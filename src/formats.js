// Formats: what a JSON Schema `format` name means on this page.
// JSON Schema treats `format` as an annotation and lets validators add their
// own formats (Ajv: addFormat). Sutram follows that, and adds display: an app
// defines a format once, and every client uses the part it needs. Core checks
// input with `validate`, the console shows values with `display`, and `man`
// and the WebMCP bridge explain it with `description`.
// Sutram defines no domain formats. A format nobody defined stays a plain
// annotation: nothing is checked, and the value is shown as it is.

const FIELDS = ["type", "description", "validate", "display", "align"];

/** The formats JSON Schema draft 2020-12 itself defines. Agents and validators already know them. */
export const STANDARD_FORMATS = Object.freeze([
  "date-time", "date", "time", "duration", "email", "idn-email", "hostname", "idn-hostname",
  "ipv4", "ipv6", "uri", "uri-reference", "iri", "iri-reference", "uuid", "uri-template",
  "json-pointer", "relative-json-pointer", "regex",
]);

const NAME = /^[a-z][a-z0-9-]*$/;

function checkFormat(name, def) {
  if (typeof name !== "string" || !NAME.test(name)) throw new TypeError(`formats: "${name}" is not a valid name; use lowercase letters, digits and hyphens`);
  if (!def || typeof def !== "object") throw new TypeError(`formats: "${name}" needs a definition`);
  for (const key of Object.keys(def)) {
    if (!FIELDS.includes(key)) throw new TypeError(`formats: "${name}" has an unknown field "${key}"; use ${FIELDS.join(", ")}`);
  }
  for (const key of ["validate", "display"]) {
    if (def[key] !== undefined && typeof def[key] !== "function") throw new TypeError(`formats: "${name}".${key} must be a function`);
  }
  if (def.align !== undefined && !["left", "right"].includes(def.align)) throw new TypeError(`formats: "${name}".align must be left or right`);
}

/** Display rules for JSON Schema's own date formats. Checking them is left to the schema's author. */
const STANDARD = {
  "date-time": {
    type: "string",
    description: "a date and time, RFC 3339",
    validate: (v) => !Number.isNaN(Date.parse(v)),
    display: (v, { locale } = {}) => new Date(v).toLocaleString(locale),
  },
  date: {
    type: "string",
    description: "a full date, RFC 3339, such as 2026-10-15",
    validate: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)),
    display: (v, { locale } = {}) => new Date(`${v}T00:00:00`).toLocaleDateString(locale),
  },
};

/**
 * Creates a format registry. Most pages should use getFormats() instead, so
 * that every copy of Sutram bundled on the page shares one.
 */
export function createFormats({ standard = true } = {}) {
  const defs = new Map();
  const formats = {
    /**
     * Defines a format. Returns a function that removes it again.
     * Defining a name that is already taken is refused, so two modules
     * cannot silently disagree about what a format means.
     */
    define(name, def) {
      checkFormat(name, def);
      if (defs.has(name) && defs.get(name) !== def) throw new Error(`formats: "${name}" is already defined`);
      defs.set(name, def);
      return () => { if (defs.get(name) === def) defs.delete(name); };
    },
    get: (name) => defs.get(name),
    has: (name) => defs.has(name),
    list: () => [...defs.entries()].map(([name, def]) => ({ name, ...def })),

    /** True when the value passes the format's check, or when the format has none. */
    valid(name, value) {
      const def = defs.get(name);
      if (!def || !def.validate) return true;
      try { return !!def.validate(value); } catch (err) { return false; }
    },
  };
  if (standard) for (const [name, def] of Object.entries(STANDARD)) formats.define(name, def);
  return formats;
}

const FORMATS_KEY = Symbol.for("sutram.formats@1");

/** The page's one format registry, shared by every copy of Sutram loaded on it. */
export function getFormats() {
  if (!globalThis[FORMATS_KEY]) globalThis[FORMATS_KEY] = createFormats();
  return globalThis[FORMATS_KEY];
}
