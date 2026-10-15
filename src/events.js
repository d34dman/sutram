// Declared events: facts, emitted by their owner and heard by anyone.
// Optional. Commands are for intent ("please do this"); events are for facts
// ("this happened"). It adds `events list` and `events recent`, so agents can
// read what happened after they acted.

import { checkInput, getRegistry } from "./core.js";

export function createEvents(registry, { bufferSize = 50 } = {}) {
  const defs = new Map();
  const listeners = new Map();
  const buffer = [];
  let seq = 0;

  const api = {
    /** Declares an event and its payload schema. Only declared events can be emitted. */
    define(name, def) {
      if (defs.has(name)) throw new Error(`events: "${name}" is already defined`);
      defs.set(name, def);
    },

    /** Emits an event. The payload is checked against its schema first. */
    emit(name, payload = {}, { source = "code" } = {}) {
      const def = defs.get(name);
      if (!def) throw new Error(`events: "${name}" is not defined`);
      if (def.payload) {
        const { errors } = checkInput(def.payload, payload);
        if (errors.length) throw new Error(`events: ${name}: ${errors.join("; ")}`);
      }
      const ls = [...(listeners.get(name) || []), ...(listeners.get("*") || [])];
      const event = { id: ++seq, name, payload, source, heardBy: ls.filter((l) => !l.hidden).map((l) => l.as) };
      buffer.push(event);
      if (buffer.length > bufferSize) buffer.shift();
      for (const l of ls) {
        try { l.fn(event); } catch (err) { console.error(err); }
      }
      return event;
    },

    /** Listens for an event, or "*" for all. Returns a function that stops listening. */
    on(name, fn, { as = "anonymous", hidden = false } = {}) {
      const l = { fn, as, hidden };
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(l);
      return () => listeners.set(name, listeners.get(name).filter((x) => x !== l));
    },

    list: () => [...defs.entries()].map(([name, d]) => ({ name, description: d.description })),
    lastId: () => seq,
  };

  registry.register({
    name: "events list",
    provider: "events",
    description: "List the events providers on this page have declared",
    input: { type: "object", properties: {} },
    output: {
      type: "object",
      properties: { events: { type: "array", items: { type: "object", properties: { name: { type: "string" }, description: { type: "string" } } } } },
    },
    annotations: { readOnly: true },
    seeAlso: ["events recent"],
    run: () => ({ data: { events: api.list() } }),
  });

  registry.register({
    name: "events recent",
    provider: "events",
    description: "Show recent events, optionally only those after an event id",
    input: { type: "object", properties: { since: { type: "integer", minimum: 0, default: 0, description: "Only events with a higher id than this" } } },
    output: {
      type: "object",
      required: ["events", "cursor"],
      properties: {
        events: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer", title: "#" },
              name: { type: "string", title: "Event" },
              payload: { type: "object" },
              source: { type: "string", title: "From" },
            },
          },
        },
        cursor: { type: "integer", description: "The newest event id. Pass it as --since next time" },
      },
    },
    view: { columns: ["id", "name", "payload", "source"] },
    annotations: { readOnly: true },
    examples: ["events recent", "events recent --since=4", "events recent --json"],
    seeAlso: ["events list"],
    run({ since }) {
      const events = buffer.filter((e) => e.id > since).map(({ id, name, payload, source }) => ({ id, name, payload, source }));
      const text = events.length ? `${events.length} events. Next time: --since=${seq}` : since ? `No events after #${since}.` : "No events yet.";
      return { text, data: { events, cursor: seq } };
    },
  });

  return api;
}

const EVENTS_KEY = Symbol.for("sutram.events@1");

/** The page's one event bus, shared by every copy of Sutram loaded on it. */
export function getEvents(registry = getRegistry()) {
  if (!globalThis[EVENTS_KEY]) globalThis[EVENTS_KEY] = createEvents(registry);
  return globalThis[EVENTS_KEY];
}
