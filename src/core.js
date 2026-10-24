// Sutram core: a registry of commands and nothing else.
// It checks definitions and input, runs handlers, and announces changes.
// It holds no app state and touches no DOM.

import { getFormats } from "./formats.js";
import { createPolicy, whoIs } from "./policy.js";

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

/** Options that belong to clients: -h/--help, --json[=fields] and --wide. */
export const CLIENT_OPTIONS = Object.freeze(["help", "json", "wide"]);

const REQUIRED_FIELDS = ["name", "provider", "description", "annotations"];

/**
 * The annotations a command may declare. They are a contract with every
 * client, so a key Sutram does not know, such as a typo, is refused rather
 * than ignored. Clients translate them for their side: the WebMCP bridge
 * sends readOnlyHint, never Sutram's own names.
 */
export const ANNOTATIONS = Object.freeze(["readOnly", "consequential", "navigates", "reinitializes", "untrustedContent"]);

/** Whether a command may call reinitializes(): navigates implies it. */
export const mayReinitialize = (def) => !!(def && (def.annotations.reinitializes || def.annotations.navigates));
const NAME = /^[a-z][a-z0-9-]*( [a-z][a-z0-9-]*)*$/;
/** How parameters are named: one lowercase word, or words joined by _ (per_page). */
const PARAM = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
/** The most words a command name may have; the parser looks no further. */
export const MAX_NAME_WORDS = 6;

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
  if (schema.$ref === "#") return root;
  const path = schema.$ref.replace(/^#\//, "").split("/");
  return path.reduce((node, key) => (node ? node[key] : undefined), root);
}

function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

/** What a failed format check says, from the format's own description. */
const formatError = (formats, name) => {
  const def = formats.get(name);
  return def && def.description ? `${name}, ${def.description}` : `a valid ${name}`;
};

const own = (obj, key) => !!obj && Object.hasOwn(obj, key);
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** JSON Schema equality: by value, with object keys in any order. */
function same(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]));
}
// Linear: each digit can match only one way, so a long non-number fails fast.
const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;

/** The type a property declares. `["string", "null"]` is a nullable string: null already means "not given". */
function typeOfProp(prop) {
  const t = prop.type;
  if (!Array.isArray(t)) return t;
  const rest = t.filter((x) => x !== "null");
  return rest.length === 1 ? rest[0] : undefined;
}

const TYPE_ERROR = {
  integer: "a whole number", number: "a number", boolean: "true or false",
  string: "a string", array: "a list", object: "an object",
};

/**
 * One value against one property: converts text typed in a console to the
 * declared type (unless strict), then checks the constraints. Pushes errors
 * and returns the value.
 */
function checkValue(name, prop, v, errors, formats, strict) {
  const type = typeOfProp(prop);
  const text = typeof v === "string" && !strict;
  const fail = () => { errors.push(`${name} must be ${TYPE_ERROR[type]}`); return undefined; };

  if (type === "integer" || type === "number") {
    if (text && NUMBER.test(v.trim())) v = Number(v.trim());
    if (typeof v !== "number" || !Number.isFinite(v) || (type === "integer" && !Number.isInteger(v))) return fail();
  } else if (type === "boolean") {
    if (text) {
      const s = v.toLowerCase();
      if (["true", "yes", "on", "1"].includes(s)) v = true;
      else if (["false", "no", "off", "0"].includes(s)) v = false;
    }
    if (typeof v !== "boolean") return fail();
  } else if (type === "string") {
    if (typeof v !== "string") return fail();
  } else if (type === "array") {
    if (text && v.trim().startsWith("[")) { try { const list = JSON.parse(v); if (Array.isArray(list)) v = list; } catch { /* a plain a,b,c list */ } }
    if (text && typeof v === "string") v = v.split(",").map((s) => s.trim()).filter(Boolean);
    if (!Array.isArray(v)) return fail();
    if (prop.items) v = v.map((item, i) => checkValue(`${name}[${i}]`, prop.items, item, errors, formats, strict));
  } else if (type === "object") {
    if (text && v.trim().startsWith("{")) { try { v = JSON.parse(v); } catch { /* reported below */ } }
    if (!isPlainObject(v)) return fail();
  }

  const before = errors.length;
  const err = (msg) => errors.push(`${name} ${msg}`);
  if (prop.enum && !prop.enum.some((x) => same(x, v))) err(`must be one of: ${prop.enum.join(", ")}`);
  if (own(prop, "const") && !same(v, prop.const)) err(`must be ${JSON.stringify(prop.const)}`);
  if (typeof v === "number") {
    if (prop.minimum !== undefined && v < prop.minimum) err(`must be at least ${prop.minimum}`);
    if (prop.maximum !== undefined && v > prop.maximum) err(`must be at most ${prop.maximum}`);
    if (prop.exclusiveMinimum !== undefined && v <= prop.exclusiveMinimum) err(`must be more than ${prop.exclusiveMinimum}`);
    if (prop.exclusiveMaximum !== undefined && v >= prop.exclusiveMaximum) err(`must be less than ${prop.exclusiveMaximum}`);
    if (prop.multipleOf) {
      const q = v / prop.multipleOf;
      if (Math.abs(q - Math.round(q)) > 1e-9 * Math.max(1, Math.abs(q))) err(`must be a multiple of ${prop.multipleOf}`);
    }
  }
  if (typeof v === "string") {
    // JSON Schema counts characters (code points), not UTF-16 units.
    const length = [...v].length;
    if (prop.minLength !== undefined && length < prop.minLength) err(`must be at least ${prop.minLength} characters`);
    if (prop.maxLength !== undefined && length > prop.maxLength) err(`must be at most ${prop.maxLength} characters`);
    if (prop.pattern !== undefined && !new RegExp(prop.pattern, "u").test(v)) err(`must match ${prop.pattern}`);
  }
  if (Array.isArray(v)) {
    if (prop.minItems !== undefined && v.length < prop.minItems) err(`must have at least ${prop.minItems} items`);
    if (prop.maxItems !== undefined && v.length > prop.maxItems) err(`must have at most ${prop.maxItems} items`);
    if (prop.uniqueItems && v.some((x, i) => v.findIndex((y) => same(x, y)) !== i)) err("must not repeat items");
  }
  if (errors.length === before && prop.format && !formats.valid(prop.format, v)) err(`must be ${formatError(formats, prop.format)}`);
  return v;
}

/**
 * Checks input against the JSON Schema keywords that apply to one value
 * (type, enum, const, format, the number, string and array limits; items one
 * level deep). Strings typed in a console are converted to the declared
 * types; other values must already have them. `null` and `undefined` mean
 * "not given"; so does "" for a typed property that is not a string. For
 * a string, or a property with no type, "" is a value.
 * With { strict: true }, no string is converted, for values that come from
 * code, such as event payloads. Returns { errors, value }.
 */
export function checkInput(schema, input = {}, formats = getFormats(), { strict = false } = {}) {
  const errors = [];
  const value = {};
  const props = (schema && schema.properties) || {};
  const required = (schema && schema.required) || [];
  input = input || {};

  for (const key of Object.keys(input)) {
    if (!own(props, key)) errors.push(`unknown argument "${key}"`);
  }
  for (const [key, prop] of Object.entries(props)) {
    let v = own(input, key) ? input[key] : undefined;
    if (v === undefined || v === null || (v === "" && prop.type !== undefined && typeOfProp(prop) !== "string")) {
      if (prop.default === undefined) {
        if (required.includes(key)) errors.push(`${key} is required`);
        continue;
      }
      // A copy, so a handler that changes its input cannot change the schema.
      v = prop.default !== null && typeof prop.default === "object" ? structuredClone(prop.default) : prop.default;
    }
    const before = errors.length;
    v = checkValue(key, prop, v, errors, formats, strict);
    if (errors.length === before) value[key] = v;
  }
  return { errors, value };
}

/** Constraint keywords checkInput does not check. register() warns about them, once. */
const UNCHECKED = [
  "oneOf", "anyOf", "allOf", "not", "if", "then", "else", "$ref", "dependentRequired", "dependentSchemas",
  "patternProperties", "propertyNames", "minProperties", "maxProperties", "unevaluatedProperties",
  "unevaluatedItems", "prefixItems", "contains", "minContains", "maxContains",
];

/** "where keyword" for every constraint in an input schema that checkInput ignores. */
function uncheckedKeywords(input) {
  const found = [];
  const look = (where, schema, depth) => {
    if (!isPlainObject(schema)) return;
    for (const k of UNCHECKED) if (own(schema, k)) found.push(`${where}${k}`);
    if (Array.isArray(schema.type) && typeOfProp(schema) === undefined) found.push(`${where}type`);
    if (depth > 0 && schema.properties) found.push(`${where}properties`);
    if (schema.items) look(`${where}items.`, schema.items, depth + 1);
  };
  for (const k of UNCHECKED) if (own(input, k)) found.push(k);
  if (own(input, "additionalProperties") && input.additionalProperties !== false) found.push("additionalProperties");
  for (const [key, prop] of Object.entries(input.properties || {})) look(`${key}.`, prop, 1);
  return found;
}

/** How deep checkOutput follows data, so cyclic or very deep data cannot overflow the stack. */
const OUTPUT_DEPTH = 32;

/**
 * A shallow check of a result against an output schema: types (a list of
 * types too, such as ["string", "null"]), required keys and defined formats,
 * following arrays into their first item, up to 32 levels deep. Returns null
 * when it matches, or a message naming the first field that does not.
 */
export function checkOutput(schema, data, root = schema, formats = getFormats(), depth = 0) {
  if (depth > OUTPUT_DEPTH) return null;
  schema = deref(schema, root);
  if (!schema) return null;
  const t = typeOf(data);
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.includes(t) && !(types.includes("number") && t === "integer")) return `expected ${types.join(" or ")}, got ${t}`;
  }
  if (schema.format && data !== null && !formats.valid(schema.format, data)) return `expected ${formatError(formats, schema.format)}`;
  if (!schema.type) return null;
  if (t === "object") {
    for (const key of schema.required || []) if (!own(data, key)) return `${key} is missing`;
    for (const [key, prop] of Object.entries(schema.properties || {})) {
      if (!own(data, key) || data[key] === undefined) continue;
      const err = checkOutput(prop, data[key], root, formats, depth + 1);
      if (err) return `${key}: ${err}`;
    }
  }
  if (t === "array" && schema.items && data.length) {
    const err = checkOutput(schema.items, data[0], root, formats, depth + 1);
    if (err) return `[0]: ${err}`;
  }
  return null;
}

function checkDefinition(def) {
  for (const field of REQUIRED_FIELDS) {
    if (!def || def[field] === undefined) throw new TypeError(`register: "${(def && def.name) || "?"}" has no ${field}`);
  }
  if (typeof def.run !== "function") throw new TypeError(`register: "${def.name}" has no run function`);
  if (!isPlainObject(def.annotations)) throw new TypeError(`register: "${def.name}" has annotations that are not an object`);
  for (const key of Object.keys(def.annotations)) {
    if (!ANNOTATIONS.includes(key)) throw new TypeError(`register: "${def.name}" has an unknown annotation "${key}"; known: ${ANNOTATIONS.join(", ")}`);
  }
  if (def.title !== undefined && (typeof def.title !== "string" || !def.title.trim() || /[\r\n]/.test(def.title))) {
    throw new TypeError(`register: "${def.name}" has a title that is not one line of text`);
  }
  if (def.suggest !== undefined && typeof def.suggest !== "function") throw new TypeError(`register: "${def.name}" has a suggest that is not a function`);
  if (!NAME.test(def.name)) throw new TypeError(`register: "${def.name}" is not a valid name; use lowercase words separated by single spaces`);
  if (def.name.split(" ").length > MAX_NAME_WORDS) throw new TypeError(`register: "${def.name}" has more than ${MAX_NAME_WORDS} words, so no command line could reach it`);
  if (RESERVED_WORDS.includes(def.name.split(" ")[0])) throw new TypeError(`register: "${def.name}" starts with a word reserved for clients`);
  // sutram_status and sutram_batch are Sutram's own tools; a command must not shadow them.
  if (def.name.split(" ")[0] === "sutram") throw new TypeError(`register: "${def.name}" starts with "sutram", which Sutram's own tools use`);
  const props = def.input.properties || {};
  for (const key of CLIENT_OPTIONS) {
    if (own(props, key)) throw new TypeError(`register: "${def.name}" cannot declare --${key}; clients own it`);
  }
  for (const key of def.positional || []) {
    if (!own(props, key)) throw new TypeError(`register: "${def.name}" lists positional "${key}", which its input does not declare`);
  }
  for (const [key, prop] of Object.entries(props)) {
    for (const [where, p] of [[key, prop], [`${key}.items`, prop && prop.items]]) {
      if (!p || p.pattern === undefined) continue;
      try { new RegExp(p.pattern, "u"); } catch (err) { throw new TypeError(`register: "${def.name}": ${where}.pattern is not a valid regular expression: ${err.message}`); }
    }
  }
  // Agents read parameter names in every schema; one naming style keeps them guessable.
  const odd = Object.keys(props).filter((key) => !PARAM.test(key));
  if (odd.length) console.warn(`sutram: ${def.name}: name parameters with lowercase words joined by _, such as per_page: ${odd.join(", ")}`);
  const unchecked = uncheckedKeywords(def.input);
  if (unchecked.length) console.warn(`sutram: ${def.name}: these input keywords are not checked: ${unchecked.join(", ")}. Check them in run().`);
}

/**
 * Creates a registry. Most pages should use getRegistry() instead, so that
 * every copy of Sutram bundled on the page shares one list.
 */
export function createRegistry({ checkResults = true, formats = getFormats(), policy = createPolicy() } = {}) {
  const commands = new Map();
  const batchHooks = new Map(); // provider → { begin, commit, rollback }
  const changeFns = new Set();
  const runFns = new Set();
  const resultFns = new Set();
  const reinitFns = new Set();

  // Ready: the page's commands are registered. It starts pending; the
  // browser entry point resolves it once the page's scripts have run, or
  // the app calls initialized() itself. After reinitialize(), runs are
  // refused and a new ready waits for initialized(); on a page that is
  // being left, it never comes, so nobody acts on the old page.
  let resolveReady;
  let ready = new Promise((resolve) => { resolveReady = resolve; });
  let isReady = false;
  let leaving = false;
  let generation = 0;

  const notify = (fns, event) => fns.forEach((fn) => {
    try { fn(event); } catch (err) { console.error(err); }
  });

  // One batch at a time: each waits for the one before it. A batch takes its
  // providers as it reaches them, so two at once could each wait on the other.
  let batchTail = Promise.resolve();
  let active = null; // the running batch: { providers: Set, done: Promise }

  /** Resolves true when `promise` settles first, false when the signal aborts first. */
  const until = (promise, signal) => {
    if (!signal) return promise.then(() => true);
    if (signal.aborted) return Promise.resolve(false);
    return new Promise((resolve) => {
      const onAbort = () => resolve(false);
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(() => { signal.removeEventListener("abort", onAbort); resolve(true); });
    });
  };
  /** The promise's value, or undefined as soon as the signal aborts. */
  const raceAbort = (promise, signal) => {
    if (!signal) return promise;
    let onAbort;
    const aborted = new Promise((resolve) => { onAbort = () => resolve(undefined); signal.addEventListener("abort", onAbort, { once: true }); });
    return Promise.race([promise, aborted]).finally(() => signal.removeEventListener("abort", onAbort));
  };
  const cancelled = (name) => ({ code: EXIT.CANCELLED, message: `${name}: cancelled` });

  async function execute(name, input, { caller = "code", signal, expect } = {}, inBatch) {
    let def = commands.get(name);
    // A person or an agent waits for a batch that is changing this provider,
    // so its rollback cannot undo their edit. App code does not: it may be
    // running inside one of the batch's own commands.
    while (!inBatch && def && whoIs(caller) && active && active.providers.has(def.provider)) {
      if (!(await until(active.done, signal))) return cancelled(name);
      def = commands.get(name);
    }
    if (expect !== undefined && def !== expect) {
      return { code: EXIT.CANCELLED, message: `${name}: the command changed after it was checked, so it did not run` };
    }
    if (leaving) return { code: EXIT.CANCELLED, message: `${name}: Sutram is starting again, so it did not run. Wait for Sutram.ready, then look again.` };
    if (!def) return { code: EXIT.NOT_FOUND, message: `${name}: command not found` };
    const { errors, value } = checkInput(def.input, input, formats);
    // The next step, as a command line tool says it: where the usage is.
    if (errors.length) return { code: EXIT.USAGE, message: `${name}: ${errors.join("; ")}. Try ${name} -h.` };
    if (signal && signal.aborted) return cancelled(name);

    notify(runFns, { name, input: value, caller });
    const result = await (async () => {
      try {
        // An abort settles the call even when the handler ignores the signal.
        const reinitializes = () => {
          if (!mayReinitialize(def)) throw new Error(`${name} called reinitializes() but does not declare the reinitializes or navigates annotation`);
          registry.reinitialize({ navigates: !!def.annotations.navigates });
        };
        let res = await raceAbort(def.run(value, { caller, signal, reinitializes }), signal);
        if (signal && signal.aborted) return cancelled(name);
        if (typeof res === "string") res = { text: res };
        else if (res === undefined || res === null) res = {};
        else if (!isPlainObject(res)) {
          return { code: EXIT.FAILED, message: `${name}: run returned ${Array.isArray(res) ? "a list" : `a ${typeof res}`}; return { text?, data? } or a string` };
        }
        if (checkResults && def.output && res.data !== undefined) {
          const err = checkOutput(def.output, res.data, def.output, formats);
          if (err) console.warn(`sutram: ${name} returned data that does not match its output schema: ${err}`);
        }
        return { code: EXIT.OK, ...res };
      } catch (err) {
        if (signal && signal.aborted) return cancelled(name);
        // Only a CommandError sets the code: a DOMException has a legacy numeric code, often 0.
        const code = err instanceof CommandError && Number.isInteger(err.code) && err.code !== EXIT.OK ? err.code : EXIT.FAILED;
        return { code, message: (err && err.message) || String(err) };
      }
    })();
    notify(resultFns, { name, input: value, caller, result });
    return result;
  }

  const registry = {
    /** The format registry this registry checks input and results against. */
    formats,

    /** Who clients ask before a command runs. See policy.js. */
    policy,

    /**
     * Adds a command. Returns a function that removes it again.
     * Registering a name another definition owns is refused.
     */
    register(def) {
      // A command without arguments may leave out input.
      if (def && def.input === undefined) {
        const input = { type: "object", properties: {} };
        def = Object.isExtensible(def) ? Object.assign(def, { input }) : { ...def, input };
      }
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

    /** Resolves once the page's commands are registered. A new promise after every reinitialize(). */
    get ready() { return ready; },
    /** Counts reinitialize() calls, so a client can tell whether a run started Sutram again. */
    get generation() { return generation; },

    /**
     * Sutram starts again: what was on the page is gone or going. Clears
     * what listens (events), refuses runs, and makes ready wait for
     * initialized(). A command calls it through reinitializes() in its run
     * context; app code, such as a single-page app's router, calls it here.
     * navigates: true says the page is being left, so the browser entry
     * point can start Sutram on this page again if it is not left after all.
     */
    reinitialize({ navigates = false } = {}) {
      generation++;
      leaving = true;
      if (isReady) {
        isReady = false;
        ready = new Promise((resolve) => { resolveReady = resolve; });
      }
      notify(reinitFns, { generation, navigates: !!navigates });
    },

    /** The page's commands are registered: resolves ready and allows runs again. */
    initialized() {
      leaving = false;
      if (!isReady) { isReady = true; resolveReady(); }
    },

    /** Called on every reinitialize(), with { generation, navigates }. Returns a function that stops listening. */
    onReinitialize(fn) { reinitFns.add(fn); return () => reinitFns.delete(fn); },

    get: (name) => commands.get(name),
    has: (name) => commands.has(name),
    /** Every command on the page right now, sorted by name. */
    list: () => [...commands.values()].sort((a, b) => a.name.localeCompare(b.name)),

    /** Called on every register and unregister. Returns a function that stops listening. */
    onChange(fn) { changeFns.add(fn); return () => changeFns.delete(fn); },
    /** Called before every run, with { name, input, caller }. */
    onRun(fn) { runFns.add(fn); return () => runFns.delete(fn); },
    /** Called after every run that got as far as the handler, with { name, input, caller, result }. */
    onResult(fn) { resultFns.add(fn); return () => resultFns.delete(fn); },

    /**
     * Runs a command. Always resolves to a result:
     * { code: 0, text?, data? } on success, { code, message } otherwise.
     * `expect` is the definition a client checked and asked about: when the
     * name no longer maps to it, nothing runs. A console or agent run of a
     * provider that a batch is changing waits until the batch is done.
     */
    run: (name, input = {}, options = {}) => execute(name, input, options, false),
    /**
     * Lets a provider group the commands of a batch into one change, such as
     * one undo step. In a batch, begin() is called before the provider's first
     * command, then commit() when every command succeeded, or rollback() when
     * one failed. Any of them may be async. Returns a function that removes them.
     */
    defineBatch(provider, hooks = {}) {
      if (batchHooks.has(provider)) throw new Error(`defineBatch: ${provider} already has batch hooks`);
      batchHooks.set(provider, hooks);
      return () => { if (batchHooks.get(provider) === hooks) batchHooks.delete(provider); };
    },

    /**
     * Starts a batch for a client that runs commands one at a time, such as
     * the console running pasted lines. Run commands with batch.run(name,
     * input), then call batch.commit() or batch.rollback(). Both resolve to
     * { rolledBack, kept }: the providers whose changes were undone, and those
     * whose changes stay because they have no batch hooks.
     */
    startBatch({ caller = "code", signal } = {}) {
      const begun = []; // [{ provider, hooks }]
      const kept = new Set();
      let finished = false;
      // Take a place in the queue now; wait for it at the first run.
      let release;
      const done = new Promise((resolve) => { release = resolve; });
      const turn = batchTail;
      batchTail = batchTail.then(() => done);
      const me = { providers: new Set(), done };
      let started = false;

      const finish = async (how) => {
        if (finished) throw new Error("batch: already finished");
        finished = true;
        const list = how === "commit" ? begun : [...begun].reverse();
        let error = null;
        try {
          for (const { hooks } of list) {
            try { if (hooks[how]) await hooks[how](); } catch (err) { error = error || err; if (how === "rollback") console.error(err); }
          }
        } finally {
          if (active === me) active = null;
          release();
        }
        if (error && how === "commit") throw error;
        return { rolledBack: how === "rollback" ? begun.map((b) => b.provider) : [], kept: [...kept] };
      };
      return {
        /** Runs one command in the batch. `expect`, as for run(). */
        async run(name, input = {}, { expect } = {}) {
          if (finished) throw new Error("batch: already finished");
          if (!started) {
            if (!(await until(turn, signal))) return cancelled(name);
            started = true;
            active = me;
          }
          const def = commands.get(name);
          const hooks = def && batchHooks.get(def.provider);
          if (hooks && !begun.some((b) => b.provider === def.provider)) {
            me.providers.add(def.provider);
            try { if (hooks.begin) await hooks.begin(); } catch (err) {
              me.providers.delete(def.provider);
              return { code: EXIT.FAILED, message: `${name}: ${def.provider} could not start a batch: ${(err && err.message) || err}` };
            }
            begun.push({ provider: def.provider, hooks });
          }
          const result = await execute(name, input, { caller, signal, expect: expect === undefined ? def : expect }, true);
          if (result.code === EXIT.OK && def && !hooks && !def.annotations.readOnly) kept.add(def.provider);
          return result;
        },
        commit: () => finish("commit"),
        rollback: () => finish("rollback"),
      };
    },

    /**
     * Runs steps, [{ name, input, def? }], as one batch. Every step is checked
     * before any runs, so a typo runs nothing. A step runs only while its name
     * still maps to the definition that was checked: `def` when the step gives
     * one (the definition a client asked about), else the one found here.
     * The batch stops at the first step that fails and rolls back what the
     * providers' batch hooks can undo.
     * Resolves to { code, results, completed, total, message?, rolledBack?, kept? }.
     */
    async batch(steps, { caller = "code", signal } = {}) {
      if (!Array.isArray(steps)) return { code: EXIT.USAGE, message: "batch: steps must be a list of { name, input }", results: [], completed: 0, total: 0 };
      const total = steps.length;
      const refuse = (code, message) => ({ code, message, results: [], completed: 0, total });
      const defs = [];
      for (const [i, step] of steps.entries()) {
        if (!isPlainObject(step) || typeof step.name !== "string") return refuse(EXIT.USAGE, `step ${i + 1}: each step must be { name, input }. Nothing ran.`);
        const { name, input, def: expected } = step;
        const def = commands.get(name);
        if (expected !== undefined && def !== expected) return refuse(EXIT.CANCELLED, `step ${i + 1}: ${name} changed after it was approved. Nothing ran.`);
        if (!def) return refuse(EXIT.NOT_FOUND, `step ${i + 1}: ${name}: command not found. Nothing ran.`);
        const { errors } = checkInput(def.input, input, formats);
        if (errors.length) return refuse(EXIT.USAGE, `step ${i + 1}: ${name}: ${errors.join("; ")}. Nothing ran.`);
        if (mayReinitialize(def) && i < total - 1) return refuse(EXIT.USAGE, `step ${i + 1}: ${name} may start Sutram again, so it must be the last step. Nothing ran.`);
        defs.push(def);
      }
      const b = registry.startBatch({ caller, signal });
      const results = [];
      for (const [i, { name, input }] of steps.entries()) {
        const result = await b.run(name, input, { expect: defs[i] });
        results.push(result);
        if (result.code !== EXIT.OK) {
          const { rolledBack, kept } = await b.rollback();
          return { code: result.code, message: `step ${i + 1} of ${total}: ${result.message}`, results, completed: i, total, rolledBack, kept };
        }
      }
      try { await b.commit(); } catch (err) {
        return { code: EXIT.FAILED, message: `the batch ran, but saving it failed: ${(err && err.message) || err}`, results, completed: total, total };
      }
      return { code: EXIT.OK, results, completed: total, total };
    },
  };
  return registry;
}

// The key changes when the registry's shape does, so copies of Sutram that
// would break each other's registry keep their own instead.
const REGISTRY_KEY = Symbol.for("sutram.registry@3");
const OLDER_KEYS = [Symbol.for("sutram.registry@1"), Symbol.for("sutram.registry@2")];

/** The page's one registry, shared by every copy of Sutram loaded on it. */
export function getRegistry() {
  if (!globalThis[REGISTRY_KEY]) {
    globalThis[REGISTRY_KEY] = createRegistry();
    if (OLDER_KEYS.some((key) => globalThis[key])) {
      console.warn("sutram: an older Sutram is on this page. Its commands are in its own registry, not in this one; load one version.");
    }
  }
  return globalThis[REGISTRY_KEY];
}

/** True for a command that follows the status convention: `<provider> status`, read-only. */
export const isStatusCommand = (def) => / status$/.test(def.name) && !!def.annotations.readOnly;

/** Names in `providers` that report no status, said so that the next call can fix them; null when all do. */
export function unknownProviders(registry, providers) {
  if (!providers) return null;
  const known = [...new Set(registry.list().filter(isStatusCommand).map((d) => d.provider))];
  const unknown = providers.filter((p) => !known.includes(p));
  if (!unknown.length) return null;
  return `${unknown.join(", ")} ${unknown.length === 1 ? "reports" : "report"} no status on this page; ${known.length ? `these do: ${known.join(", ")}` : "none does"}.`;
}

/**
 * Runs every `<provider> status` command, the way a bare `status` does, or
 * only those of `providers`. `run` runs each one, registry.run by default; a
 * batch passes its own run, so a status inside it does not wait for the
 * batch to end. Resolves to [{ provider, code, text?, data?, message? }].
 */
export async function runStatus(registry, { caller = "status", signal, providers, run = registry.run } = {}) {
  const results = [];
  for (const def of registry.list().filter(isStatusCommand)) {
    if (providers && !providers.includes(def.provider)) continue;
    results.push({ provider: def.provider, ...(await run(def.name, {}, { caller, signal })) });
  }
  return results;
}
