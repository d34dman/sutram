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

/** True for a full date, YYYY-MM-DD, that is on the calendar: 2026-02-31 is not. */
function isFullDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = m.slice(1).map(Number);
  const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= days[mo - 1];
}

/** True for an RFC 3339 date-time: a full date, T, a time with seconds, and Z or an offset. */
function isDateTime(v) {
  const m = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|[+-](\d{2}):(\d{2}))$/.exec(v);
  if (!m || !isFullDate(m[1])) return false;
  const [h, min, sec] = [m[2], m[3], m[4]].map(Number);
  const offset = m[6].length > 1 ? Number(m[7]) <= 23 && Number(m[8]) <= 59 : true;
  return h <= 23 && min <= 59 && sec <= 60 && offset; // 60: a leap second
}

/** JSON Schema's own date formats: RFC 3339, checked, and shown in the reader's locale. */
const STANDARD = {
  "date-time": {
    type: "string",
    description: "a date and time, RFC 3339, such as 2026-10-15T14:30:00Z",
    validate: isDateTime,
    // A value that is not a date shows as written, never as "Invalid Date".
    display: (v, { locale } = {}) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString(locale); },
  },
  date: {
    type: "string",
    description: "a full date, RFC 3339, such as 2026-10-15",
    validate: isFullDate,
    display: (v, { locale } = {}) => { const d = new Date(`${v}T00:00:00`); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(locale); },
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
