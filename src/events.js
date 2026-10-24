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

    /**
     * Emits an event. The payload is checked strictly against its schema
     * first: an event comes from code, so nothing is converted, and a payload
     * that does not match throws. Listeners get the payload as emitted; a
     * `default` in a payload schema only documents.
     */
    emit(name, payload = {}, { source = "code" } = {}) {
      const def = defs.get(name);
      if (!def) throw new Error(`events: "${name}" is not defined`);
      if (def.payload) {
        const { errors } = checkInput(def.payload, payload, registry.formats, { strict: true });
        if (errors.length) throw new Error(`events: ${name}: ${errors.join("; ")}`);
      }
      const ls = [...(listeners.get(name) || []), ...(listeners.get("*") || [])];
      const event = { id: ++seq, name, payload, source, heardBy: ls.filter((l) => !l.hidden).map((l) => l.as) };
      // The buffer keeps a copy, so `events recent` shows the payload as it was
      // emitted, even if the emitter changes the object afterwards.
      let kept = payload;
      try { kept = structuredClone(payload); } catch { /* not cloneable (a function, say): keep it as is */ }
      buffer.push({ ...event, payload: kept });
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

    /**
     * Forgets buffered events up to an id, by default all of them. Ids keep
     * counting, so an agent's --since stays valid. Runs by itself when
     * Sutram starts again (registry.reinitialize()).
     */
    clear(upTo = seq) {
      const keep = buffer.filter((e) => e.id > upTo);
      buffer.splice(0, buffer.length, ...keep);
    },
  };

  // When Sutram starts again, events from before describe things that are
  // gone. Events emitted after, such as route.changed, are kept.
  registry.onReinitialize(() => api.clear());

  registry.register({
    name: "events list",
    title: "List declared events",
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
    title: "Show recent events",
    provider: "events",
    description: "Show recent events on this page, optionally only those after an event id",
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
    // Payloads carry the page's own text, such as the messages it showed.
    annotations: { readOnly: true, untrustedContent: true },
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
