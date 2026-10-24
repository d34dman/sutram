// The messages kit: what the page said, such as "Saved" after a save or an
// error after a failed one. It gives the same data two ways: the messages
// command lists the messages, for an agent that asks, and each message is
// also emitted as a message.shown event, for one that reads events recent.
// One adapter function feeds both.
//
//   import { messages } from "@d34dman/sutram/messages";
//   messages({
//     messages: () => shown,               // [{ type: "status", text: "Saved." }]
//     watch: (changed) => app.on("message", changed),
//   });
//
// Without a bundler, load dist/messages.js after dist/sutram.js and call
// Sutram.kits.messages(adapter).

import { CommandError, EXIT, getRegistry } from "./core.js";
import { getEvents } from "./events.js";
import { checkAdapter, registerAll } from "./kit.js";

const TYPES = ["status", "warning", "error"];
const EVENT = "message.shown";
const MESSAGE = {
  type: "object",
  required: ["type", "text"],
  properties: {
    type: { type: "string", enum: TYPES, description: "status, warning or error" },
    text: { type: "string" },
  },
};

/** The messages, from the adapter, checked. */
async function load(adapter) {
  const list = await adapter.messages();
  if (!Array.isArray(list)) throw new CommandError("messages: the app's adapter returned no list of messages", EXIT.FAILED);
  return list.map((m) => {
    if (!m || !TYPES.includes(m.type) || typeof m.text !== "string") {
      throw new CommandError(`messages: the app's adapter returned a message that is not { type: ${TYPES.join(" | ")}, text }`, EXIT.FAILED);
    }
    return { type: m.type, text: m.text };
  });
}

const same = (a, b) => a.type === b.type && a.text === b.text;

/**
 * Registers the messages command on a registry (the page's by default),
 * declares the message.shown event, and emits it for each message the
 * page has shown. The adapter supplies:
 *
 *   messages()       the messages the page has shown since it loaded,
 *                    oldest first: [{ type: "status" | "warning" |
 *                    "error", text }]. May be async; called each time the
 *                    command runs, once at the start, and after changed().
 *   watch(changed)   optional: calls changed() when new messages may have
 *                    come without a new page, such as after an AJAX
 *                    request. May return a function that stops watching.
 *
 * The kit emits message.shown for the messages there are at the start, and
 * after each changed() for those that are new: the ones after the list it
 * saw last, or all of them when the list starts afresh. Returns a function
 * that removes the command and stops watching.
 */
export function messages(adapter, { registry = getRegistry(), events = getEvents(registry) } = {}) {
  checkAdapter("messages", adapter, { "messages()": "function", "watch()": "function?" });
  if (!events.list().some((e) => e.name === EVENT)) {
    events.define(EVENT, { description: "The page showed a message, such as Saved or an error", payload: MESSAGE });
  }

  let seen = [];
  let pulling = Promise.resolve();
  const pull = () => {
    pulling = pulling.then(async () => {
      let now;
      try { now = await load(adapter); } catch (err) { console.error(err); return; }
      const grew = seen.length <= now.length && seen.every((m, i) => same(m, now[i]));
      for (const m of grew ? now.slice(seen.length) : now) events.emit(EVENT, m, { source: "messages" });
      seen = now;
    });
    return pulling;
  };

  const off = registerAll(registry, [{
    name: "messages",
    title: "Show messages",
    provider: "messages",
    description: "Show the messages this page has shown, such as Saved or an error, oldest first",
    input: { type: "object", properties: {} },
    output: { type: "object", required: ["messages"], properties: { messages: { type: "array", items: MESSAGE } } },
    view: { columns: ["type", "text"] },
    annotations: { readOnly: true },
    examples: ["messages", "messages --json"],
    seeAlso: ["events recent"],
    async run() {
      const list = await load(adapter);
      if (!list.length) return { text: "No messages on this page.", data: { messages: [] } };
      return { data: { messages: list } };
    },
  }]);
  const unwatch = adapter.watch ? adapter.watch(() => { pull(); }) : undefined;
  pull();
  return () => {
    off();
    if (typeof unwatch === "function") unwatch();
  };
}
