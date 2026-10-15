// Formatting for people. Commands return data; clients decide how it looks.
// Everything here is pure: it turns definitions and results into text blocks
// that a console (or a terminal) can print. No DOM.

import { deref } from "./core.js";

/**
 * A block of output: { kind, text, head? }.
 * kind is "text", "table", "pairs", "json", "dim", "man" or "error".
 * A table block also has `head`, the header line, so a client can style it.
 */

const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isRecords = (v) => Array.isArray(v) && v.length > 0 && v.every(isRecord);

/** Ends a description with exactly one full stop. */
export const sentence = (s) => String(s).replace(/\.?\s*$/, ".");

/** Formats one value for a table cell or a `key: value` line. */
export function formatValue(value, prop = {}, options = {}) {
  if (value === null || value === undefined) return "";
  if (prop.format === "money" && typeof value === "number") {
    if (options.currency) {
      return new Intl.NumberFormat(options.locale, { style: "currency", currency: options.currency }).format(value);
    }
    return value.toFixed(2);
  }
  if (prop.format === "date-time" && typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString(options.locale);
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
    const t = (deref(props[k], root) || {}).type;
    return t !== "object" && t !== "array";
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
    const s = (i === 0 ? "  ".repeat(depth) : "") + formatValue(r[k], props[k], options);
    return s.length > maxWidth ? s.slice(0, maxWidth - 1) + "…" : s;
  }));
  const head = cols.map((k) => String((props[k] && props[k].title) || k).toUpperCase());
  const numeric = cols.map((k) => props[k] && ["number", "integer"].includes(props[k].type));
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
 * - With { json: true }: the data, unchanged.
 */
export function formatResult(result, def = {}, options = {}) {
  if (result.code !== 0) return [{ kind: "error", text: result.message || `exit ${result.code}`, code: result.code }];
  if (options.json) return [{ kind: "json", text: JSON.stringify(result.data === undefined ? null : result.data, null, 2) }];

  const schema = def.output || {};
  const view = def.view || {};
  const data = result.data;
  const blocks = [];
  const tableOpts = { ...options, columns: view.columns };
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
    return `${usages[i].padEnd(w)}  ${d.description}${label ? `  [${label}]` : ""}`;
  });
  const blocks = [{ kind: "text", text: lines.join("\n"), commands: list }];
  if (!prefix) blocks.push({ kind: "dim", text: "help <provider> · man <command> · <command> -h · <command> --json · status · clear" });
  return blocks;
}

/** `<command> -h`: short usage. */
export function formatUsage(def) {
  const lines = [`usage: ${synopsis(def)}`];
  const long = longSynopsis(def);
  if (long && long !== synopsis(def)) lines.push(`   or: ${long}`);
  return [
    { kind: "text", text: lines.join("\n") },
    { kind: "dim", text: `${sentence(def.description)} See man ${def.name} for more.` },
  ];
}

const BUILT_IN_MAN = {
  help: ["help [provider]", "List the commands on this page with their usage and annotations. Generated from the registry; providers write nothing for it."],
  man: ["man <command>", "Show the full manual entry for a command, generated from its definition: arguments from the input schema, output from the output schema, annotations, examples and related commands."],
  status: ["status [--json]", "Run every read-only command named <provider> status, and show what each provider reports about the page right now."],
  clear: ["clear", "Clear the console."],
};

/** `man <command>`: the full entry, generated from the definition. */
export function formatMan(def, name = def && def.name) {
  if (!def && BUILT_IN_MAN[name]) {
    const [syn, desc] = BUILT_IN_MAN[name];
    return [{ kind: "man", text: [name.toUpperCase(), "", "NAME", `     ${name} - built into every Sutram client`, "", "SYNOPSIS", `     ${syn}`, "", "DESCRIPTION", `     ${desc}`].join("\n") }];
  }
  const props = def.input.properties || {};
  const required = def.input.required || [];
  const head = def.name.toUpperCase();
  const right = `provided by ${def.provider}`;
  const L = [head + " ".repeat(Math.max(2, 64 - head.length - right.length)) + right, "", "NAME", `     ${def.name} - ${def.description}`, "", "SYNOPSIS", `     ${synopsis(def)}`];
  const long = longSynopsis(def);
  if (long && long !== synopsis(def)) L.push(`     ${long}`);

  L.push("", "ARGUMENTS");
  if (!Object.keys(props).length) L.push("     none");
  for (const [k, p] of Object.entries(props)) {
    const bits = [
      p.type,
      required.includes(k) ? "required" : null,
      p.enum ? `one of ${p.enum.join(", ")}` : null,
      p.minimum !== undefined ? `at least ${p.minimum}` : null,
      p.default !== undefined ? `default ${p.default}` : null,
    ].filter(Boolean).join(", ");
    L.push(`     --${k}`, `          ${bits}.${p.description ? " " + sentence(p.description) : ""}`);
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
        L.push(`${" ".repeat(indent)}${k}`, `${" ".repeat(indent + 5)}${bits}.${p.description ? " " + sentence(p.description) : ""}`);
        // Recursive schemas, such as a menu tree, are described once.
        if (isList && depth < 2 && !(raw.items && raw.items.$ref && depth > 0)) fields(p.items, indent + 5, depth + 1);
      }
    })(def.output, 5, 0);
    L.push("     The console formats this as text. --json prints it unchanged, as an agent gets it.");
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
  if (depth > 2) return schema.type === "array" ? "[…]" : "{…}";
  if (schema.type === "array") return `[${describeShape(schema.items, root, depth + 1)}]`;
  if (schema.type === "object" && schema.properties) {
    const fields = Object.entries(schema.properties).map(([k, p]) => {
      const q = deref(p, root);
      return q && (q.type === "array" || (q.type === "object" && q.properties)) ? `${k}: ${describeShape(q, root, depth + 1)}` : k;
    });
    return `{ ${fields.join(", ")} }`;
  }
  return schema.type || "any";
}
