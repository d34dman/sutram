// Declared events: facts, emitted by their owner and heard by anyone.
// Optional. Commands are for intent ("please do this"); events are for facts
// ("this happened"). It adds `events list`, `events recent` and `events wait`,
// so agents can read what happened after they acted.

import { CommandError, EXIT, checkInput, getRegistry } from "./core.js";

/** How long events wait waits by default, and at most, in seconds. */
const WAIT_DEFAULT = 10;
const WAIT_MAX = 60;

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

    /**
     * The first event named `name` ("*" for any) with an id above `since`:
     * one the page still keeps, or else the next one emitted. `since`
     * defaults to the newest id, so it waits for the next one. Resolves to
     * { id, name, payload, source }, or to null after `timeout` ms or when
     * the signal aborts.
     */
    next(name = "*", { since = seq, timeout = WAIT_DEFAULT * 1000, signal } = {}) {
      if (name !== "*" && !defs.has(name)) throw new Error(`events: "${name}" is not defined`);
      const matches = (e) => e.id > since && (name === "*" || e.name === name);
      const brief = ({ id, name: n, payload, source }) => ({ id, name: n, payload, source });
      const kept = buffer.find(matches);
      if (kept) return Promise.resolve(brief(kept));
      if (signal && signal.aborted) return Promise.resolve(null);
      return new Promise((resolve) => {
        let timer;
        const done = (event) => {
          off();
          clearTimeout(timer);
          if (signal) signal.removeEventListener("abort", abort);
          resolve(event);
        };
        const abort = () => done(null);
        // The buffer's copy: the payload as it was emitted.
        const off = api.on(name, (e) => done(brief(buffer.find((b) => b.id === e.id) || e)), { as: "events wait", hidden: true });
        timer = setTimeout(abort, timeout);
        if (signal) signal.addEventListener("abort", abort, { once: true });
      });
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

  registry.register({
    name: "events wait",
    title: "Wait for an event",
    provider: "events",
    description: "Wait until an event happens and return it, instead of asking events recent again and again. Returns at once when the page already keeps a matching event after --since",
    input: {
      type: "object",
      properties: {
        name: { type: "string", description: "The event to wait for, such as message.shown. Leave it out to take any event" },
        since: { type: "integer", minimum: 0, description: "Only events with a higher id than this, including ones already kept. Leave it out to wait for the next one" },
        timeout: { type: "integer", minimum: 1, maximum: WAIT_MAX, default: WAIT_DEFAULT, description: "Seconds to wait before giving up" },
      },
    },
    positional: ["name"],
    output: {
      type: "object",
      required: ["event", "cursor"],
      properties: {
        event: {
          type: "object",
          properties: { id: { type: "integer" }, name: { type: "string" }, payload: { type: "object" }, source: { type: "string" } },
        },
        cursor: { type: "integer", description: "The event's id. Pass it as --since next time" },
      },
    },
    annotations: { readOnly: true, untrustedContent: true },
    examples: ["events wait message.shown", "events wait route.changed --since=4", "events wait --timeout=30 --json"],
    seeAlso: ["events recent", "events list"],
    suggest: (key, partial) => (key === "name" ? api.list().map((e) => e.name).filter((n) => n.startsWith(partial)) : []),
    async run({ name, since, timeout }, { signal }) {
      if (name && !defs.has(name)) {
        const known = api.list().map((e) => e.name);
        throw new CommandError(`events wait: this page has no event "${name}"; ${known.length ? `it has ${known.join(", ")}` : "it declares none"}.`, EXIT.USAGE);
      }
      const event = await api.next(name || "*", { since, timeout: timeout * 1000, signal });
      if (signal && signal.aborted) return null;
      if (!event) throw new CommandError(`events wait: no ${name || "event"} within ${timeout} s. To keep waiting without missing one: events wait${name ? ` ${name}` : ""} --since=${since === undefined ? seq : since}`);
      return {
        text: `#${event.id} ${event.name} from ${event.source}: ${JSON.stringify(event.payload)}. Next time: --since=${event.id}`,
        data: { event, cursor: event.id },
      };
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
