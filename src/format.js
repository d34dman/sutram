// Formatting for people. Commands return data; clients decide how it looks.
// Everything here is pure: it turns definitions and results into text blocks
// that a console (or a terminal) can print. No DOM.

import { deref } from "./core.js";
import { getFormats, STANDARD_FORMATS } from "./formats.js";

const own = (obj, key) => !!obj && Object.hasOwn(obj, key);

/**
 * A block of output: { kind, text, head? }.
 * kind is "text", "table", "pairs", "json", "dim", "man" or "error".
 * A table block also has `head`, the header line, so a client can style it.
 */

const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isRecords = (v) => Array.isArray(v) && v.length > 0 && v.every(isRecord);

/** The first line of a description, for one-line lists: man pages have a one-line summary too. */
export const summary = (s) => String(s).trim().split(/\r?\n/)[0].trim();

/** Ends a description with exactly one full stop. */
export const sentence = (s) => String(s).replace(/\.?\s*$/, ".");

/** The format definition for a property, from the page's format registry. */
const formatOf = (prop, options) => (prop && prop.format ? (options.formats || getFormats()).get(prop.format) : undefined);

/** Formats one value for a table cell or a `key: value` line. */
export function formatValue(value, prop = {}, options = {}) {
  if (value === null || value === undefined) return "";
  const fmt = formatOf(prop, options);
  if (fmt && fmt.display) {
    try {
      const shown = fmt.display(value, { locale: options.locale });
      if (shown !== undefined && shown !== null) return String(shown);
    } catch (err) {
      // A format that cannot show this value falls back to the plain value.
    }
  }
  if (Array.isArray(value)) return value.every((x) => typeof x !== "object") ? value.join(", ") : `${value.length} items`;
  if (isRecord(value)) return JSON.stringify(value);
  return String(value);
}

/**
 * Lays out a list of records as text columns. Records with `children` become
 * an indented tree. Returns { head, rows } as strings.
 */
export function formatTable(rows, itemSchema, root, { columns, maxWidth = 40, ...options } = {}) {
  const props = (deref(itemSchema, root) || {}).properties || {};
  const scalar = (k) => {
    const p = deref(props[k], root) || {};
    const fmt = formatOf(p, options);
    return (fmt && fmt.display) || (p.type !== "object" && p.type !== "array");
  };
  const cols = columns || (Object.keys(props).length ? Object.keys(props).filter(scalar) : Object.keys(rows[0]));

  const flat = [];
  (function walk(list, depth) {
    for (const r of list) {
      flat.push([r, depth]);
      if (isRecords(r.children)) walk(r.children, depth + 1);
    }
  })(rows, 0);

  const cells = flat.map(([r, depth]) => cols.map((k, i) => {
    const s = (i === 0 ? "  ".repeat(depth) : "") + formatValue(own(r, k) ? r[k] : undefined, own(props, k) ? props[k] : undefined, options);
    return s.length > maxWidth ? s.slice(0, maxWidth - 1) + "…" : s;
  }));
  const head = cols.map((k) => String((props[k] && props[k].title) || k).toUpperCase());
  const numeric = cols.map((k) => {
    const fmt = formatOf(props[k], options);
    if (fmt && fmt.align) return fmt.align === "right";
    return !!props[k] && ["number", "integer"].includes(props[k].type);
  });
  const width = cols.map((_, i) => Math.max(head[i].length, ...cells.map((c) => c[i].length)));
  const line = (cs) => cs
    .map((c, i) => (numeric[i] ? c.padStart(width[i]) : i === cs.length - 1 ? c : c.padEnd(width[i])))
    .join("  ")
    .replace(/\s+$/, "");
  return { head: line(head), rows: cells.map(line) };
}

/**
 * Turns a result into blocks for people.
 * - A failure prints its message.
 * - A summary `text`, if any, comes first; then only the lists in `data`.
 * - Without a summary: `key: value` lines for a record, a table for each list.
 * - With { json: true }: the data, unchanged. With { fields }, only those fields.
 * - With { wide: true }: every column, ignoring view.columns.
 */
export function formatResult(result, def = {}, options = {}) {
  if (result.code !== 0) return [{ kind: "error", text: result.message || `exit ${result.code}`, code: result.code }];
  if (options.json) {
    let data = result.data === undefined ? null : result.data;
    if (options.fields) {
      const picked = selectFields(data, options.fields, def.output);
      if (picked.error) return [{ kind: "error", text: `${def.name || "--json"}: ${picked.error}`, code: 2 }];
      data = picked.data;
    }
    return [{ kind: "json", text: JSON.stringify(data, null, 2) }];
  }

  const schema = def.output || {};
  const view = def.view || {};
  const data = result.data;
  const blocks = [];
  const tableOpts = { ...options, columns: options.wide ? undefined : view.columns };
  const table = (rows, items) => {
    const { head, rows: lines } = formatTable(rows, items, schema, tableOpts);
    blocks.push({ kind: "table", head, text: [head, ...lines].join("\n") });
  };

  if (result.text) blocks.push({ kind: "text", text: result.text });
  if (data === undefined || data === null) return blocks;

  if (isRecords(data)) { table(data, schema.items); return blocks; }
  if (!isRecord(data)) {
    if (!result.text) blocks.push({ kind: "text", text: formatValue(data, schema, options) });
    return blocks;
  }

  const props = schema.properties || {};
  const pairs = [];
  const lists = [];
  for (const [key, value] of Object.entries(data)) {
    if (isRecords(value)) lists.push([value, deref(props[key], schema)]);
    else if (!result.text && !(Array.isArray(value) && !value.length)) pairs.push([key, formatValue(value, props[key], options)]);
  }
  if (pairs.length) {
    const w = Math.max(...pairs.map(([k]) => k.length)) + 1;
    blocks.push({ kind: "pairs", text: pairs.map(([k, v]) => `${(k + ":").padEnd(w)} ${v}`).join("\n") });
  }
  for (const [rows, prop] of lists) table(rows, prop && prop.items);
  if (!blocks.length) blocks.push({ kind: "dim", text: "Nothing to show." });
  return blocks;
}

/** The fields `--json=` can pick: the properties of each record in a list, or of the record itself. */
function fieldNames(schema, data) {
  schema = deref(schema, schema) || {};
  const target = schema.type === "array" ? deref(schema.items, schema) || {} : schema;
  if (target.properties) return Object.keys(target.properties);
  if (isRecords(data)) return [...new Set(data.flatMap(Object.keys))];
  if (isRecord(data)) return Object.keys(data);
  return [];
}

/**
 * Checks `--json=` field names against a command's output schema before it
 * runs, so a typo never costs a consequential command. Returns a message or null.
 */
export function checkFields(def, fields) {
  if (!def.output) return null;
  const known = fieldNames(def.output);
  if (!known.length) return `${def.name}: --json= needs records, and this command returns ${def.output.type || "no fields"}`;
  const unknown = fields.filter((f) => !known.includes(f));
  return unknown.length ? `${def.name}: unknown field ${unknown.map((f) => `"${f}"`).join(", ")}. Available: ${known.join(", ")}` : null;
}

/**
 * Keeps only the named fields, like `gh … --json=a,b`: of each record in a
 * list, or of a single record. Returns { data } or { error }.
 */
export function selectFields(data, fields, schema) {
  const known = fieldNames(schema, data);
  // No records is still a list of records: [] stays [], once the fields are known ones.
  if (Array.isArray(data) && !data.length) {
    const unknown = known.length ? fields.filter((f) => !known.includes(f)) : [];
    return unknown.length ? { error: `unknown field ${unknown.map((f) => `"${f}"`).join(", ")}. Available: ${known.join(", ")}` } : { data: [] };
  }
  if (!isRecord(data) && !isRecords(data)) return { error: "--json= needs records, and this command returned none" };
  const unknown = fields.filter((f) => !known.includes(f));
  if (unknown.length) return { error: `unknown field ${unknown.map((f) => `"${f}"`).join(", ")}. Available: ${known.join(", ")}` };
  const pick = (r) => Object.fromEntries(fields.filter((f) => own(r, f)).map((f) => [f, r[f]]));
  return { data: Array.isArray(data) ? data.map(pick) : pick(data) };
}

/** Quotes a word for a command line only when it needs it, the way a shell user would. */
function quoteWord(s) {
  return s !== "" && /^[\w@%+=:,./-]+$/.test(s) && !s.startsWith("-") ? s : `"${s.replace(/(["\\])/g, "\\$1")}"`;
}

/**
 * A value as one command line word that reads back as the same value.
 * A list of plain items is written a,b,c; an object, or a list that a comma
 * split would change, is written as JSON, in single quotes when it can be.
 */
function quoteArg(value) {
  const plain = (x) => ["string", "number", "boolean"].includes(typeof x) && !/[,\n]/.test(String(x)) && String(x).trim() === String(x) && String(x) !== "";
  if ((Array.isArray(value) && value.length && value.every(plain)) || (value === null || typeof value !== "object")) {
    return quoteWord(Array.isArray(value) ? value.join(",") : String(value));
  }
  const json = JSON.stringify(value);
  return json.includes("'") ? quoteWord(json) : `'${json}'`;
}

/** A heredoc for a multi-line value, with a closing word that no line of it holds. */
function heredoc(s) {
  const lines = s.split("\n");
  let tag = "END";
  for (let n = 2; lines.some((l) => l.trim() === tag); n++) tag = `END${n}`;
  return `<<${tag}\n${s}\n${tag}`;
}

/**
 * The command line that runs a command with this input, such as
 * `form node-article-edit-form set revision_log "Clearer title"`. Positional
 * arguments come first, in order; the rest are long options. The first
 * multi-line text value, such as HTML, goes last as a heredoc. Clients use it
 * to show what an agent or a button ran in the words a person would type.
 */
export function commandLine(def, input = {}) {
  const parts = [def.name];
  const props = (def.input && def.input.properties) || {};
  const order = def.positional || [];
  const block = Object.keys(input).find((key) => typeof input[key] === "string" && input[key].includes("\n"));
  const used = new Set(block ? [block] : []);
  // A positional word is plain text, so only strings and numbers go there.
  for (const key of order) {
    if (!own(input, key) || input[key] == null || key === block || !["string", "number"].includes(typeof input[key])) break;
    parts.push(quoteArg(input[key]));
    used.add(key);
  }
  // null and undefined mean "not given", so they are left out.
  for (const [key, value] of Object.entries(input)) {
    if (used.has(key) || value == null) continue;
    const flag = props[key] && [].concat(props[key].type).includes("boolean");
    if (flag && typeof value === "boolean") parts.push(value ? `--${key}` : `--no-${key}`);
    else parts.push(`--${key}=${quoteArg(value)}`);
  }
  if (block) parts.push(`--${block} ${heredoc(input[block])}`);
  return parts.join(" ");
}

/** Plain text for a list of blocks, for terminals and tests. */
export const blocksToText = (blocks) => blocks.map((b) => b.text).join("\n");

/** Short usage: positionals first, then options. */
export function synopsis(def) {
  const props = def.input.properties || {};
  const required = def.input.required || [];
  const order = def.positional || [];
  const parts = order.map((k) => (required.includes(k) ? `<${k}>` : `[${k}]`));
  for (const k of Object.keys(props)) {
    if (order.includes(k)) continue;
    const p = props[k];
    const s = p.type === "boolean" ? `--${k}` : `--${k}=<${p.enum ? p.enum.join("|") : p.type}>`;
    parts.push(required.includes(k) ? s : `[${s}]`);
  }
  return [def.name, ...parts].join(" ");
}

/** The same usage with every argument as an option, or null when that adds nothing. */
export function longSynopsis(def) {
  const props = def.input.properties || {};
  const required = def.input.required || [];
  if (!(def.positional || []).length) return null;
  const parts = Object.keys(props).map((k) => {
    const s = props[k].type === "boolean" ? `--${k}` : `--${k}=<${props[k].type}>`;
    return required.includes(k) ? s : `[${s}]`;
  });
  return [def.name, ...parts].join(" ");
}

/** The annotation label shown next to a command in help. */
export function annotationLabel(annotations = {}) {
  if (annotations.readOnly) return "read-only";
  if (annotations.consequential) return "consequential";
  if (annotations.navigates) return "navigates";
  return null;
}

/** `help` and `help <provider>`: one line per command. */
export function formatHelp(registry, prefix = "") {
  const list = registry.list().filter((d) => !prefix || d.name === prefix || d.name.startsWith(prefix + " "));
  if (!list.length) return [{ kind: "error", text: `help: nothing called "${prefix}" on this page`, code: 1 }];
  const usages = list.map(synopsis);
  const w = Math.min(40, Math.max(...usages.map((u) => u.length)));
  const lines = list.map((d, i) => {
    const label = annotationLabel(d.annotations);
    return `${usages[i].padEnd(w)}  ${summary(d.description)}${label ? `  [${label}]` : ""}`;
  });
  const blocks = [{ kind: "text", text: lines.join("\n"), commands: list }];
  if (!prefix) blocks.push({ kind: "dim", text: "help <provider> · man <command> · <command> -h · <command> --json[=fields] · <command> --wide · status · clear" });
  return blocks;
}

/** `<command> -h`: short usage. */
export function formatUsage(def) {
  const lines = [`usage: ${synopsis(def)}`];
  const long = longSynopsis(def);
  if (long && long !== synopsis(def)) lines.push(`   or: ${long}`);
  return [
    { kind: "text", text: lines.join("\n") },
    { kind: "dim", text: `${sentence(summary(def.description))} See man ${def.name} for more.` },
  ];
}

const BUILT_IN_MAN = {
  help: ["help [provider]", "List the commands on this page with their usage and annotations. Generated from the registry; providers write nothing for it."],
  man: ["man <command>", "Show the full manual entry for a command, generated from its definition: arguments from the input schema, output from the output schema, annotations, examples and related commands."],
  status: ["status [--json]", "Run every read-only command named <provider> status, and show what each provider reports about the page right now."],
  clear: ["clear", "Clear the console."],
};

/** ", money: { amount, currency } with an ISO 4217 code." for a property whose format is defined. */
function formatNote(prop, formats) {
  const fmt = prop && prop.format ? formats.get(prop.format) : undefined;
  return fmt && fmt.description && !STANDARD_FORMATS.includes(prop.format) ? ` ${prop.format}: ${sentence(fmt.description)}` : "";
}

/** `man <command>`: the full entry, generated from the definition. */
export function formatMan(def, name = def && def.name, formats = getFormats()) {
  if (!def && BUILT_IN_MAN[name]) {
    const [syn, desc] = BUILT_IN_MAN[name];
    return [{ kind: "man", text: [name.toUpperCase(), "", "NAME", `     ${name} - built into every Sutram client`, "", "SYNOPSIS", `     ${syn}`, "", "DESCRIPTION", `     ${desc}`].join("\n") }];
  }
  const props = def.input.properties || {};
  const required = def.input.required || [];
  const head = def.name.toUpperCase();
  const right = `provided by ${def.provider}`;
  const L = [head + " ".repeat(Math.max(2, 64 - head.length - right.length)) + right, "", "NAME", `     ${def.name} - ${summary(def.description)}`, "", "SYNOPSIS", `     ${synopsis(def)}`];
  const long = longSynopsis(def);
  if (long && long !== synopsis(def)) L.push(`     ${long}`);
  // The rest of a multi-line description, as written.
  const more = String(def.description).trim().split(/\r?\n/).slice(1);
  if (more.some((l) => l.trim())) L.push("", "DESCRIPTION", ...more.map((l) => (l.trim() ? `     ${l.trimEnd()}` : "")));

  L.push("", "ARGUMENTS");
  if (!Object.keys(props).length) L.push("     none");
  for (const [k, p] of Object.entries(props)) {
    const bits = [
      p.type,
      p.format,
      required.includes(k) ? "required" : null,
      p.enum ? `one of ${p.enum.join(", ")}` : null,
      p.minimum !== undefined ? `at least ${p.minimum}` : null,
      p.default !== undefined ? `default ${p.default}` : null,
    ].filter(Boolean).join(", ");
    L.push(`     --${k}`, `          ${bits}.${p.description ? " " + sentence(p.description) : ""}${formatNote(p, formats)}`);
  }

  L.push("", "OUTPUT");
  if (!def.output) L.push("     not declared. --json prints whatever the command returns.");
  else {
    const root = def.output;
    (function fields(schema, indent, depth) {
      schema = deref(schema, root);
      if (!schema) return;
      if (schema.type === "array") { fields(schema.items, indent, depth); return; }
      for (const [k, raw] of Object.entries(schema.properties || {})) {
        const p = deref(raw, root) || {};
        const items = p.type === "array" ? deref(p.items, root) || {} : null;
        const isList = items && items.properties;
        const bits = [isList ? "list of records" : items ? `list of ${items.type || "values"}` : p.type, p.format].filter(Boolean).join(", ");
        L.push(`${" ".repeat(indent)}${k}`, `${" ".repeat(indent + 5)}${bits}.${p.description ? " " + sentence(p.description) : ""}${formatNote(p, formats)}`);
        // Recursive schemas, such as a menu tree, are described once.
        if (isList && depth < 2 && !(raw.items && raw.items.$ref && depth > 0)) fields(p.items, indent + 5, depth + 1);
      }
    })(def.output, 5, 0);
    L.push("     The console formats this as text; --wide shows every column. --json prints it unchanged, as an agent gets it, and --json=<field,…> keeps only those fields.");
  }

  const label = annotationLabel(def.annotations);
  const notes = [];
  if (def.annotations.consequential) notes.push("The console asks before running it, and agent hosts ask you.");
  if (def.annotations.navigates) notes.push("Leaves the page; the commands on the next page may differ.");
  L.push("", "ANNOTATIONS", `     ${label || "none: an ordinary write"}${notes.length ? ". " + notes.join(" ") : ""}`);
  L.push("", "EXIT STATUS", "     0 done, 1 failed, 2 usage error, 127 not found, 130 cancelled.");
  if (def.examples && def.examples.length) L.push("", "EXAMPLES", ...def.examples.map((x) => `     ${x}`));
  if (def.seeAlso && def.seeAlso.length) L.push("", "SEE ALSO", `     ${def.seeAlso.join(", ")}`);
  return [{ kind: "man", text: L.join("\n") }];
}

/**
 * A one-line shape of a schema, such as `{ items: [{ sku, qty }], total }`.
 * Used where a full schema cannot go, such as a WebMCP tool description.
 */
export function describeShape(schema, root = schema, depth = 0) {
  schema = deref(schema, root);
  if (!schema) return "any";
  // A field with a format is named by its format; formatsUsed() explains it once.
  if (schema.format && depth > 0) return schema.format;
  if (depth > 2) return schema.type === "array" ? "[…]" : "{…}";
  if (schema.type === "array") return `[${describeShape(schema.items, root, depth + 1)}]`;
  if (schema.type === "object" && schema.properties) {
    const fields = Object.entries(schema.properties).map(([k, p]) => {
      const q = deref(p, root);
      if (q && q.format) return `${k}: ${q.format}`;
      return q && (q.type === "array" || (q.type === "object" && q.properties)) ? `${k}: ${describeShape(q, root, depth + 1)}` : k;
    });
    return `{ ${fields.join(", ")} }`;
  }
  return schema.type || "any";
}

/**
 * The page-defined formats a command's input and output use, with their
 * descriptions, for readers that cannot look them up. JSON Schema's own
 * formats are left out: agents already know them.
 */
export function formatsUsed(def, formats = getFormats()) {
  const names = new Set();
  const seen = new Set();
  const walk = (schema, root) => {
    schema = deref(schema, root);
    if (!schema || typeof schema !== "object" || seen.has(schema)) return;
    seen.add(schema);
    if (schema.format) names.add(schema.format);
    if (schema.items) walk(schema.items, root);
    for (const p of Object.values(schema.properties || {})) walk(p, root);
  };
  walk(def.input, def.input);
  if (def.output) walk(def.output, def.output);
  return [...names]
    .filter((n) => !STANDARD_FORMATS.includes(n) && formats.get(n) && formats.get(n).description)
    .map((n) => ({ name: n, description: formats.get(n).description }));
}
