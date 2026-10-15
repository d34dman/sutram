// Sutram core: a registry of commands and nothing else.
// It checks definitions and input, runs handlers, and announces changes.
// It holds no app state and touches no DOM.

/** Exit codes, borrowed from the shell. */
export const EXIT = Object.freeze({
  OK: 0,
  FAILED: 1,
  USAGE: 2,
  NOT_FOUND: 127,
  CANCELLED: 130, // 128 + SIGINT, as a shell reports Ctrl+C
});

/** Top-level words that belong to clients. No provider may register them. */
export const RESERVED_WORDS = Object.freeze(["help", "man", "status", "clear"]);

/** Options that belong to clients: -h/--help and --json. */
export const CLIENT_OPTIONS = Object.freeze(["help", "json"]);

const REQUIRED_FIELDS = ["name", "provider", "description", "input", "annotations"];
const NAME = /^[a-z][a-z0-9-]*( [a-z][a-z0-9-]*)*$/;

export class CommandError extends Error {
  constructor(message, code = EXIT.FAILED) {
    super(message);
    this.name = "CommandError";
    this.code = code;
  }
}

/** Resolves a local `$ref` such as `#/$defs/item` against the schema it came from. */
export function deref(schema, root) {
  if (!schema || !schema.$ref) return schema;
  const path = schema.$ref.replace(/^#\//, "").split("/");
  return path.reduce((node, key) => (node ? node[key] : undefined), root);
}

function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

/**
 * Checks input against the subset of JSON Schema commands use, and coerces
 * strings typed in a console into the declared types.
 * Returns { errors, value }.
 */
export function checkInput(schema, input = {}) {
  const errors = [];
  const value = {};
  const props = (schema && schema.properties) || {};
  const required = (schema && schema.required) || [];

  for (const key of Object.keys(input)) {
    if (!props[key]) errors.push(`unknown argument "${key}"`);
  }
  for (const [key, prop] of Object.entries(props)) {
    let v = input[key];
    if (v === undefined || v === "") {
      if (prop.default !== undefined) v = prop.default;
      else {
        if (required.includes(key)) errors.push(`${key} is required`);
        continue;
      }
    }
    if (prop.type === "integer" || prop.type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n) || (prop.type === "integer" && !Number.isInteger(n))) {
        errors.push(`${key} must be ${prop.type === "integer" ? "a whole number" : "a number"}`);
        continue;
      }
      if (prop.minimum !== undefined && n < prop.minimum) errors.push(`${key} must be at least ${prop.minimum}`);
      if (prop.maximum !== undefined && n > prop.maximum) errors.push(`${key} must be at most ${prop.maximum}`);
      v = n;
    } else if (prop.type === "boolean") {
      if (typeof v !== "boolean") {
        const s = String(v).toLowerCase();
        if (["true", "yes", "on", "1"].includes(s)) v = true;
        else if (["false", "no", "off", "0"].includes(s)) v = false;
        else { errors.push(`${key} must be true or false`); continue; }
      }
    } else if (prop.type === "array") {
      v = Array.isArray(v) ? v : String(v).split(",").map((s) => s.trim()).filter(Boolean);
    } else if (prop.type === "string") {
      v = String(v);
    }
    if (prop.enum && !prop.enum.includes(v)) errors.push(`${key} must be one of: ${prop.enum.join(", ")}`);
    value[key] = v;
  }
  return { errors, value };
}

/**
 * A shallow check of a result against an output schema: types and required
 * keys, following arrays into their first item. Returns null when it matches,
 * or a message naming the first field that does not.
 */
export function checkOutput(schema, data, root = schema) {
  schema = deref(schema, root);
  if (!schema || !schema.type) return null;
  const t = typeOf(data);
  const ok = t === schema.type || (schema.type === "number" && t === "integer");
  if (!ok) return `expected ${schema.type}, got ${t}`;
  if (t === "object") {
    for (const key of schema.required || []) if (!(key in data)) return `${key} is missing`;
    for (const [key, prop] of Object.entries(schema.properties || {})) {
      if (data[key] === undefined) continue;
      const err = checkOutput(prop, data[key], root);
      if (err) return `${key}: ${err}`;
    }
  }
  if (t === "array" && schema.items && data.length) {
    const err = checkOutput(schema.items, data[0], root);
    if (err) return `[0]: ${err}`;
  }
  return null;
}

function checkDefinition(def) {
  for (const field of REQUIRED_FIELDS) {
    if (!def || def[field] === undefined) throw new TypeError(`register: "${(def && def.name) || "?"}" has no ${field}`);
  }
  if (typeof def.run !== "function") throw new TypeError(`register: "${def.name}" has no run function`);
  if (!NAME.test(def.name)) throw new TypeError(`register: "${def.name}" is not a valid name; use lowercase words separated by single spaces`);
  if (RESERVED_WORDS.includes(def.name.split(" ")[0])) throw new TypeError(`register: "${def.name}" starts with a word reserved for clients`);
  for (const key of CLIENT_OPTIONS) {
    if (def.input.properties && def.input.properties[key]) throw new TypeError(`register: "${def.name}" cannot declare --${key}; clients own it`);
  }
  for (const key of def.positional || []) {
    if (!def.input.properties || !def.input.properties[key]) throw new TypeError(`register: "${def.name}" lists positional "${key}", which its input does not declare`);
  }
}

/**
 * Creates a registry. Most pages should use getRegistry() instead, so that
 * every copy of Sutram bundled on the page shares one list.
 */
export function createRegistry({ checkResults = true } = {}) {
  const commands = new Map();
  const changeFns = new Set();
  const runFns = new Set();

  const notify = (fns, event) => fns.forEach((fn) => {
    try { fn(event); } catch (err) { console.error(err); }
  });

  const registry = {
    /**
     * Adds a command. Returns a function that removes it again.
     * Registering a name another definition owns is refused.
     */
    register(def) {
      checkDefinition(def);
      const existing = commands.get(def.name);
      if (existing && existing !== def) {
        throw new Error(`register: "${def.name}" already belongs to ${existing.provider}; ${def.provider} cannot replace it`);
      }
      commands.set(def.name, def);
      notify(changeFns, { type: "register", name: def.name, def });
      return () => {
        if (commands.get(def.name) !== def) return;
        commands.delete(def.name);
        notify(changeFns, { type: "unregister", name: def.name, def });
      };
    },

    get: (name) => commands.get(name),
    has: (name) => commands.has(name),
    /** Every command on the page right now, sorted by name. */
    list: () => [...commands.values()].sort((a, b) => a.name.localeCompare(b.name)),

    /** Called on every register and unregister. Returns a function that stops listening. */
    onChange(fn) { changeFns.add(fn); return () => changeFns.delete(fn); },
    /** Called before every run, with { name, input, caller }. */
    onRun(fn) { runFns.add(fn); return () => runFns.delete(fn); },

    /**
     * Runs a command. Always resolves to a result:
     * { code: 0, text?, data? } on success, { code, message } otherwise.
     */
    async run(name, input = {}, { caller = "code", signal } = {}) {
      const def = commands.get(name);
      if (!def) return { code: EXIT.NOT_FOUND, message: `${name}: command not found` };
      const { errors, value } = checkInput(def.input, input);
      if (errors.length) return { code: EXIT.USAGE, message: `${name}: ${errors.join("; ")}` };
      if (signal && signal.aborted) return { code: EXIT.CANCELLED, message: `${name}: cancelled` };

      notify(runFns, { name, input: value, caller });
      try {
        const res = (await def.run(value, { caller, signal })) || {};
        if (checkResults && def.output && res.data !== undefined) {
          const err = checkOutput(def.output, res.data);
          if (err) console.warn(`sutram: ${name} returned data that does not match its output schema: ${err}`);
        }
        return { code: EXIT.OK, ...res };
      } catch (err) {
        if (signal && signal.aborted) return { code: EXIT.CANCELLED, message: `${name}: cancelled` };
        return { code: err && Number.isInteger(err.code) ? err.code : EXIT.FAILED, message: (err && err.message) || String(err) };
      }
    },
  };
  return registry;
}

const REGISTRY_KEY = Symbol.for("sutram.registry@1");

/** The page's one registry, shared by every copy of Sutram loaded on it. */
export function getRegistry() {
  if (!globalThis[REGISTRY_KEY]) globalThis[REGISTRY_KEY] = createRegistry();
  return globalThis[REGISTRY_KEY];
}

/** True for a command that follows the status convention: `<provider> status`, read-only. */
export const isStatusCommand = (def) => / status$/.test(def.name) && !!def.annotations.readOnly;

/**
 * Runs every `<provider> status` command, the way a bare `status` does.
 * Resolves to [{ provider, code, text?, data?, message? }].
 */
export async function runStatus(registry, { caller = "status", signal } = {}) {
  const results = [];
  for (const def of registry.list().filter(isStatusCommand)) {
    results.push({ provider: def.provider, ...(await registry.run(def.name, {}, { caller, signal })) });
  }
  return results;
}
