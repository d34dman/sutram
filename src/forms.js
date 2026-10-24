// The forms kit: form list, status, fields, get, set, submit and discard, the
// same on every site, and form add, remove, search and upload where the app
// supplies them. An agent sets one field at a time, sees what the form asks
// for next, and fixes the one value that was wrong.
//
//   import { forms } from "@d34dman/sutram/forms";
//   forms({
//     forms: () => [{ id: "contact", label: "Contact", fields: [
//       { field: "email", label: "Email", type: "string", required: true, value: "" },
//     ] }],
//     read: (form, field) => values[field.field] ?? "",
//     write: (form, field, value) => { values[field.field] = value; render(); },
//     submit: (form) => send(values),
//     reloads: false,
//   });
//
// The kit checks forms and fields by name, converts values of the basic types
// (string, text, html, number, boolean, choice, choices), tracks unsaved
// changes against the values the form loaded with, and writes the messages.
// Reading and filling the form is the adapter's: the kit never touches the
// page. The adapter adds its own value types under `types`.
//
// Without a bundler, load dist/forms.js after dist/sutram.js and call
// Sutram.kits.forms(adapter).

import { CommandError, EXIT, getRegistry } from "./core.js";
import { checkAdapter, registerAll } from "./kit.js";

const EXAMPLE = "contact";
/** The largest file form upload takes as --text or --base64. */
const MAX_CONTENT = 5 * 1024 * 1024;

// HTML from an editor and from the server differ in whitespace only.
const normal = (v) => (typeof v === "string" ? v.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim() : v);
const same = (a, b) => (a !== null && typeof a === "object" ? JSON.stringify(a) === JSON.stringify(b) : normal(a) === normal(b));
const isEmpty = (v) =>
  v === "" || v === null || v === undefined || (Array.isArray(v) && !v.length) || (typeof v === "string" && !normal(v.replace(/<[^>]*>/g, "")));

/** A value as one short line, for messages. */
function short(v) {
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (v !== null && typeof v === "object") v = JSON.stringify(v);
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "(empty)";
  return JSON.stringify(s.length > 48 ? `${s.slice(0, 47)}…` : s);
}

const mb = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace(/\.0$/, "")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// --- The basic value types ----------------------------------------------

const YES = new Set(["true", "yes", "y", "on", "1"]);
const NO = new Set(["false", "no", "n", "off", "0"]);

/** The options of a choice field, as "key (label)", for messages. */
function allowed(f) {
  const keys = Object.keys(f.options || {});
  const list = keys.slice(0, 12).map((k) => (f.options[k] && f.options[k] !== k ? `${k} (${f.options[k]})` : k));
  return `${list.join(", ")}${keys.length > 12 ? ", …" : ""}`;
}

/** The key of an option, given its key or its label (any case), or undefined. */
function keyOf(f, raw) {
  const options = f.options || {};
  const s = String(raw).trim();
  if (Object.hasOwn(options, s)) return s;
  const lower = s.toLowerCase();
  return Object.keys(options).find((k) => String(options[k]).toLowerCase() === lower);
}

/** An empty value: refused for a required field. */
function clear(f, empty) {
  if (f.required) {
    throw new CommandError(`form set: ${f.field} is required. It takes ${f.type === "choice" ? "one" : "one or more"} of: ${allowed(f)}.`, EXIT.USAGE);
  }
  return empty;
}

/**
 * Several keys or labels, as a JSON array or separated by commas. A label
 * may itself hold a comma ("Pour-over, by hand"): the longest run of
 * comma-separated parts that names an option wins.
 */
function several(f, raw) {
  const s = Array.isArray(raw) ? raw : String(raw).trim();
  if (Array.isArray(s) || s.startsWith("[")) {
    let list = s;
    if (!Array.isArray(list)) {
      try { list = JSON.parse(s); } catch { list = null; }
    }
    if (Array.isArray(list)) {
      const keys = list.map((v) => [v, keyOf(f, v)]);
      const bad = keys.filter(([, k]) => k === undefined).map(([v]) => v);
      if (bad.length) throw new CommandError(`form set: ${f.field} has no option ${bad.map((v) => JSON.stringify(String(v))).join(", ")}. It takes: ${allowed(f)}.`, EXIT.USAGE);
      return [...new Set(keys.map(([, k]) => k))];
    }
  }
  if (s === "") return clear(f, []);
  const parts = s.split(",");
  const keys = [];
  for (let i = 0; i < parts.length;) {
    let j = parts.length;
    let key;
    while (j > i && key === undefined) {
      key = keyOf(f, parts.slice(i, j).join(","));
      if (key === undefined) j--;
    }
    if (key === undefined) {
      const part = parts[i].trim();
      // "a,,b" or a trailing comma: nothing to choose there.
      if (part === "") { i++; continue; }
      throw new CommandError(`form set: ${f.field} has no option "${part}". It takes one or more of: ${allowed(f)}, separated by commas.`, EXIT.USAGE);
    }
    keys.push(key);
    i = j;
  }
  return [...new Set(keys)];
}

const optionsOf = (f, partial) =>
  Object.entries(f.options || {})
    .filter(([k, label]) => k.startsWith(partial) || String(label).toLowerCase().startsWith(partial.toLowerCase()))
    .map(([k, label]) => ({ value: k, description: String(label) }));

/** The types the kit converts itself. An adapter's types come first. */
const BASIC = {
  string: { coerce: (f, raw) => String(raw) },
  text: { coerce: (f, raw) => String(raw) },
  html: { coerce: (f, raw) => String(raw), format: "HTML, such as <p>…</p>" },
  number: {
    coerce(f, raw) {
      const s = String(raw).trim();
      if (s !== "" && !Number.isFinite(Number(s))) throw new CommandError(`form set: ${f.field} takes a number.`, EXIT.USAGE);
      return s;
    },
    format: "a number, such as 12 or 4.5",
  },
  boolean: {
    coerce(f, raw) {
      const v = String(raw).trim().toLowerCase();
      if (YES.has(v)) return true;
      if (NO.has(v)) return false;
      throw new CommandError(`form set: ${f.field} is a yes/no field. Use true or false.`, EXIT.USAGE);
    },
    suggest: (f, partial) => ["true", "false"].filter((v) => v.startsWith(partial)),
    format: "true or false",
  },
  choice: {
    coerce(f, raw) {
      const s = String(raw).trim();
      if (s === "") return clear(f, "");
      const key = keyOf(f, s);
      if (key !== undefined) return key;
      throw new CommandError(`form set: ${f.field} takes one of: ${allowed(f)}.`, EXIT.USAGE);
    },
    suggest: optionsOf,
    format: "one key or its label",
  },
  choices: {
    coerce: several,
    suggest: optionsOf,
    format: "keys or labels, separated by commas or as a JSON array; replaces the selection",
  },
};

// --- Files for form upload ------------------------------------------------

/** A File from text or base64 content. */
function fromContent({ name, text, base64, type }, verb) {
  if (!name) throw new CommandError(`${verb}: give the file a name with its extension, such as --name=notes.txt.`, EXIT.USAGE);
  const tooLarge = (bytes) => new CommandError(`${verb}: the content is too large to pass here (${mb(bytes)}, at most ${mb(MAX_CONTENT)}). Give a URL the page can fetch, or let the person choose the file at the console.`, EXIT.USAGE);
  let bytes;
  if (text !== undefined) bytes = new TextEncoder().encode(text);
  else {
    let data = String(base64).trim();
    const dataUrl = data.match(/^data:([^;,]*)(;[^,]*)?,/);
    if (dataUrl) {
      if (!type && dataUrl[1]) type = dataUrl[1];
      data = data.slice(dataUrl[0].length);
    }
    data = data.replace(/\s+/g, "");
    if (data.length > Math.ceil(MAX_CONTENT / 3) * 4 + 4) throw tooLarge((data.length * 3) / 4);
    try {
      bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    } catch {
      throw new CommandError(`${verb}: --base64 is not valid base64.`, EXIT.USAGE);
    }
  }
  if (bytes.length > MAX_CONTENT) throw tooLarge(bytes.length);
  return new File([bytes], name, { type: type || "" });
}

/** A File fetched by the page, in the user's session. */
async function fromUrl(source, { name, type }, { signal, verb }) {
  const here = globalThis.location ? globalThis.location.href : undefined;
  let url;
  try { url = new URL(source, here); } catch { throw new CommandError(`${verb}: "${source}" is not a URL.`, EXIT.USAGE); }
  if (!["http:", "https:", "data:", "blob:"].includes(url.protocol)) throw new CommandError(`${verb}: "${source}" is not a URL the page can fetch.`, EXIT.USAGE);
  const own = globalThis.location && url.origin === globalThis.location.origin;
  let res;
  try {
    res = await fetch(url, { credentials: "same-origin", signal });
  } catch (err) {
    if (signal && signal.aborted) throw new CommandError(`${verb}: cancelled.`, EXIT.CANCELLED);
    throw new CommandError(
      own || url.protocol === "data:" || url.protocol === "blob:"
        ? `${verb}: ${url.href} could not be fetched: ${err && err.message}.`
        : `${verb}: the browser did not let the page fetch ${url.href}. Cross-site URLs work only if that site allows it (CORS): give a URL of this site, or the file's content (--base64 or --text with --name).`,
      EXIT.FAILED,
    );
  }
  if (!res.ok) throw new CommandError(`${verb}: ${url.href} answered HTTP ${res.status}.`, EXIT.FAILED);
  const blob = await res.blob();
  const last = url.protocol === "data:" ? "" : url.pathname.split("/").pop();
  const filename = name || (last ? decodeURIComponent(last) : "");
  if (!filename) throw new CommandError(`${verb}: ${url.protocol === "data:" ? "a data: URL" : url.href} has no file name: give one with --name, such as --name=photo.jpg.`, EXIT.USAGE);
  return new File([blob], filename, { type: type || (blob.type || "").split(";")[0] });
}

// --- Inputs shared by the commands -----------------------------------------

const FORM = { type: "string", description: `The form's id, such as ${EXAMPLE}. form list shows the forms on this page.` };
const FIELD = { type: "string", description: "A field of the form as a dotted path, such as title, body.summary or links.0.uri. form fields <form> lists them." };
const ONE = { type: "object", properties: { form: FORM }, required: ["form"] };

/**
 * Registers the form commands on a registry (the page's by default). The
 * adapter supplies:
 *
 *   forms()                  the forms on the page now: [{ id, label?,
 *                            entity?, fields: [{ field, label?, type,
 *                            required?, options?, format?, value }],
 *                            errors?: [{ field, message }] }]. id is
 *                            command-safe; field is a dotted path; value is
 *                            what the field held when the form loaded, so
 *                            the kit can tell what changed. A field of type
 *                            "unsupported" is listed but never filled. May be
 *                            async; called each time a command runs.
 *   read(form, field)        a field's value now. May be async.
 *   write(form, field, v)    fills a field with a value the kit or the
 *                            field's type converted. May be async (an app
 *                            that renders again); { signal } comes third.
 *   submit(form)             sends the form, the same as its button. Called
 *                            after form submit has answered when it reloads,
 *                            or awaited for { text?, data? } when it does not.
 *   reloads                  true if submitting loads a new page (form submit
 *                            is marked navigates); false if the app answers in
 *                            place.
 *
 * and may supply:
 *
 *   types                    value types of its own, by type name (or by a
 *                            field's `handler`): { coerce(field, raw, form,
 *                            { signal }), suggest?(field, partial, form),
 *                            format? }. They come before the basic types.
 *   check(form)              problems the app finds before sending, such as
 *                            the browser's validation: [{ field, message }].
 *   notes                    { submit(form), upload(form, input) }: a sentence
 *                            added to the question before submitting or
 *                            uploading, such as "It will be published."
 *   valueHelp                more for form set's value description: how this
 *                            app's types take values.
 *   add(form, field, value)  adds an item to a field that takes several
 *                            (value undefined), or adds a value to what it
 *                            holds. Returns { data: { added, item? }, text? }.
 *                            With addable(form): [{ field, label? }] for Tab.
 *   remove(form, target)     removes an item or a file. Returns { data:
 *                            { removed, … }, text? }. With removable(form).
 *   search(form, field, t)   what a reference field can point to: { data:
 *                            { field, candidates: [{ value, label, id? }] },
 *                            text? }. With searchable(form).
 *   upload(form, field, files, input)  puts Files (or null: let the person
 *                            choose) into a file field. Returns { data:
 *                            { uploaded: [{ field, filename, … }],
 *                            refused? }, text? }. With uploadable(form).
 *
 * The four optional commands are registered only when the adapter supplies
 * them. The question asked before submit, discard, remove and upload reads
 * the form at once: when forms(), read() or notes return a promise, the
 * generic question is asked instead. Every adapter function gets { signal, verb } last. Returns a
 * function that removes the commands again.
 */
export function forms(adapter, { registry = getRegistry() } = {}) {
  checkAdapter("form", adapter, {
    "forms()": "function",
    "read(form, field)": "function",
    "write(form, field, value)": "function",
    "submit(form)": "function",
    reloads: "boolean",
    "check(form)": "function?",
    "add(form, field, value)": "function?",
    "remove(form, target)": "function?",
    "search(form, field, text)": "function?",
    "upload(form, field, files, input)": "function?",
    "addable(form)": "function?",
    "removable(form)": "function?",
    "searchable(form)": "function?",
    "uploadable(form)": "function?",
  });
  const types = adapter.types || {};
  const notes = adapter.notes || {};
  const typeOf = (f) => (f.handler && types[f.handler]) || types[f.type] || BASIC[f.type] || {};

  /** The forms on the page now, checked. */
  async function load() {
    const list = await adapter.forms();
    if (!Array.isArray(list)) throw new CommandError("form: the app's adapter returned no list of forms", EXIT.FAILED);
    for (const f of list) {
      if (!f || typeof f.id !== "string" || !Array.isArray(f.fields)) throw new CommandError("form: the app's adapter returned a form without { id, fields }", EXIT.FAILED);
    }
    return list;
  }

  /** A form with what the commands need. */
  function open(form) {
    const fields = form.fields.filter((f) => f && typeof f.field === "string" && f.type !== "unsupported");
    const byPath = new Map(fields.map((f) => [f.field, f]));
    const self = {
      form,
      id: form.id,
      label: String(form.label || form.id),
      fields,
      byPath,
      errors: (form.errors || []).map((e) => ({ field: e.field || "", message: String(e.message) })),
      read: (f) => adapter.read(form, f),
      field(path, verb) {
        const f = byPath.get(path);
        if (f) return f;
        const paths = [...byPath.keys()];
        throw new CommandError(`form ${verb}: ${form.id} has no field "${path}". Fields: ${paths.slice(0, 12).join(", ")}${paths.length > 12 ? ", …" : ""}. form fields ${form.id} lists them.`, EXIT.USAGE);
      },
      async unsaved() {
        const now = await Promise.all(fields.map((f) => self.read(f)));
        return fields.map((f, i) => ({ field: f.field, from: f.value, to: now[i] })).filter((c) => !same(c.from, c.to));
      },
      async missing() {
        const now = await Promise.all(fields.map((f) => (f.required ? self.read(f) : "x")));
        return fields.filter((f, i) => f.required && isEmpty(now[i])).map((f) => f.field);
      },
    };
    return self;
  }

  /** The open form a command names, or an error that says which are open. */
  async function find(id, verb) {
    const all = await load();
    const found = all.find((f) => f.id === id);
    if (found) return open(found);
    const ids = all.map((f) => f.id);
    throw new CommandError(ids.length ? `form ${verb}: no form "${id}" on this page. Open: ${ids.join(", ")}.` : `form ${verb}: there is no form on this page.`, EXIT.NOT_FOUND);
  }
  // A question for the person is asked synchronously: these read the form
  // without waiting, and throw when the adapter answers with a promise, so
  // the generic question is asked instead.
  const now = (v) => {
    if (v && typeof v.then === "function") throw new Error("the adapter answers asynchronously");
    return v;
  };
  function findNow(id) {
    const list = now(adapter.forms());
    const raw = Array.isArray(list) && list.find((f) => f && f.id === id);
    if (!raw) throw new Error(`no form ${id}`);
    return open(raw);
  }
  const unsavedNow = (f) => f.fields.filter((x) => !same(x.value, now(f.read(x)))).map((x) => x.field);
  const quietly = async (fn) => { try { return await fn(); } catch { return []; } };
  const starts = (partial) => (s) => String(s.value ?? s).startsWith(partial);

  /** Completion: forms, the fields of the form typed, and values. */
  function suggest(key, partial, { input = {}, signal } = {}) {
    if (key === "form") return quietly(async () => (await load()).map((f) => ({ value: f.id, description: String(f.label || "") })).filter(starts(partial)));
    if (key === "field") {
      return quietly(async () => {
        const f = (await load()).find((o) => o.id === input.form);
        return f ? open(f).fields.map((x) => ({ value: x.field, description: String(x.label || "") })).filter(starts(partial)) : [];
      });
    }
    if (key === "value") {
      return quietly(async () => {
        const raw = (await load()).find((o) => o.id === input.form);
        const x = raw && open(raw).byPath.get(input.field);
        const own = x && typeOf(x).suggest;
        return own ? own(x, partial, raw, { signal }) : [];
      });
    }
    return [];
  }
  /** Completion for a command whose field (or target) comes from the adapter. */
  const suggestFrom = (list, key) => (k, partial, options = {}) => {
    if (k !== key) return suggest(k, partial, options);
    return quietly(async () => {
      const raw = (await load()).find((o) => o.id === (options.input || {}).form);
      return raw ? (await list(raw)).map((x) => ({ value: x[key] ?? x.field, description: String(x.label || "") })).filter(starts(partial)) : [];
    });
  };

  const describe = (x) => ({
    field: x.field,
    ...(x.label ? { label: String(x.label) } : {}),
    type: x.type,
    required: !!x.required,
    ...(x.options ? { options: x.options } : {}),
    ...(x.format || typeOf(x).format ? { format: x.format || typeOf(x).format } : {}),
  });

  const defs = [
    {
      name: "form list",
      title: "List forms",
      provider: "form",
      description: "List the forms on this page, with their unsaved changes and errors",
      input: { type: "object", properties: {} },
      output: {
        type: "object",
        required: ["forms"],
        properties: {
          forms: {
            type: "array",
            items: {
              type: "object",
              required: ["form", "label"],
              properties: { form: { type: "string", title: "Form" }, label: { type: "string", title: "Editing" }, unsaved: { type: "integer" }, errors: { type: "integer" } },
            },
          },
        },
      },
      view: { columns: ["form", "label", "unsaved", "errors"] },
      annotations: { readOnly: true },
      seeAlso: ["form status", "form fields"],
      async run() {
        const list = (await load()).map(open);
        const data = await Promise.all(list.map(async (f) => ({ form: f.id, label: f.label, unsaved: (await f.unsaved()).length, errors: f.errors.length })));
        return { ...(data.length ? {} : { text: "There is no form on this page." }), data: { forms: data } };
      },
    },
    {
      name: "form status",
      title: "Show form status",
      provider: "form",
      description: "Show a form's unsaved changes, the required fields still empty, and errors",
      input: ONE,
      positional: ["form"],
      output: {
        type: "object",
        required: ["form", "unsaved", "missing", "errors"],
        properties: {
          form: { type: "string" },
          entity: { type: "object", description: "What the form edits, as the app describes it" },
          unsaved: { type: "array", items: { type: "object", properties: { field: { type: "string" }, from: {}, to: {} } } },
          missing: { type: "array", items: { type: "string" }, description: "Required fields that are empty" },
          errors: {
            type: "array",
            items: { type: "object", properties: { field: { type: "string", description: "Empty for an error about the whole form" }, message: { type: "string" } } },
          },
        },
      },
      annotations: { readOnly: true },
      examples: [`form status ${EXAMPLE}`],
      seeAlso: ["form list", "form fields", "form submit"],
      suggest,
      async run({ form: id }) {
        const f = await find(id, "status");
        const [changes, missing] = await Promise.all([f.unsaved(), f.missing()]);
        const lines = [];
        if (f.errors.length) {
          lines.push(`Not submitted: ${f.errors.length === 1 ? "an error" : `${f.errors.length} errors`}.`);
          for (const e of f.errors) lines.push(`  ${e.field || "form"}: ${e.message}`);
        }
        lines.push(changes.length
          ? `${f.errors.length ? "Changed since the page loaded" : "Unsaved changes"} in ${f.label}: ${changes.map((c) => c.field).join(", ")}. form submit ${id} sends them.`
          : `No unsaved changes in ${f.label}.`);
        if (missing.length) lines.push(`Still required: ${missing.join(", ")}.`);
        return {
          text: lines.join("\n"),
          data: { form: id, ...(f.form.entity ? { entity: f.form.entity } : {}), unsaved: changes, missing, errors: f.errors },
        };
      },
    },
    {
      name: "form fields",
      title: "List form fields",
      provider: "form",
      description: "List the fields a form has now, with their type and current value",
      input: ONE,
      positional: ["form"],
      output: {
        type: "object",
        required: ["fields"],
        properties: {
          fields: {
            type: "array",
            items: {
              type: "object",
              required: ["field", "type"],
              properties: {
                field: { type: "string", title: "Field" },
                label: { type: "string" },
                type: { type: "string", description: "string, text, html, number, boolean, choice, choices, and the app's own types; unsupported when the field cannot be filled yet" },
                required: { type: "boolean" },
                value: {},
                options: { type: "object", description: "For choice and choices fields: the keys and their labels. A choices value is a list of keys" },
                format: { type: "string", description: "How form set takes the value" },
              },
            },
          },
        },
      },
      view: { columns: ["field", "label", "type", "required", "value"] },
      annotations: { readOnly: true },
      examples: [`form fields ${EXAMPLE}`],
      seeAlso: ["form get", "form set"],
      suggest,
      async run({ form: id }) {
        const f = await find(id, "fields");
        const all = f.form.fields.filter((x) => x && typeof x.field === "string");
        const values = await Promise.all(all.map((x) => (x.type === "unsupported" ? "" : f.read(x))));
        return { data: { fields: all.map((x, i) => ({ ...describe(x), value: values[i] })) } };
      },
    },
    {
      name: "form get",
      title: "Read a form field",
      provider: "form",
      description: "Show one field's current value in full, with its allowed values or format",
      input: { type: "object", properties: { form: FORM, field: FIELD }, required: ["form", "field"] },
      positional: ["form", "field"],
      output: {
        type: "object",
        required: ["field", "value"],
        properties: { field: { type: "string" }, value: {}, label: { type: "string" }, type: { type: "string" }, required: { type: "boolean" }, options: { type: "object" }, format: { type: "string" } },
      },
      annotations: { readOnly: true },
      examples: [`form get ${EXAMPLE} email`],
      seeAlso: ["form set"],
      suggest,
      async run({ form: id, field }) {
        const f = await find(id, "get");
        const x = f.field(field, "get");
        const value = await f.read(x);
        return { text: typeof value === "boolean" ? short(value) : String(value ?? ""), data: { ...describe(x), value } };
      },
    },
    {
      name: "form set",
      title: "Change a form field",
      provider: "form",
      description: "Change one field. Nothing is sent until form submit. Answers can add fields to the form: the result names them",
      input: {
        type: "object",
        properties: {
          form: FORM,
          field: FIELD,
          value: {
            type: "string",
            description: [
              "The new value, as text. Yes/no fields take true or false; choice fields take a key or its label; choices fields take keys or labels separated by commas, or a JSON array, and replace the selection; HTML fields take HTML such as <p>…</p>. Empty clears a field that is not required. form get shows a field's format.",
              adapter.valueHelp ? String(adapter.valueHelp) : "",
            ].filter(Boolean).join(" "),
          },
        },
        required: ["form", "field", "value"],
      },
      positional: ["form", "field", "value"],
      output: {
        type: "object",
        required: ["field", "to"],
        properties: {
          field: { type: "string" },
          from: {},
          to: {},
          added: { type: "array", items: { type: "string" }, description: "Fields the form asks for now that it did not before" },
          removed: { type: "array", items: { type: "string" }, description: "Fields the form no longer asks for" },
        },
      },
      annotations: {},
      examples: [`form set ${EXAMPLE} email ada@example.com`, `form set ${EXAMPLE} summary "Charged twice in May"`, `form set ${EXAMPLE} callback true`],
      seeAlso: ["form fields", "form status", "form submit"],
      suggest,
      async run({ form: id, field, value }, { signal }) {
        const f = await find(id, "set");
        const x = f.field(field, "set");
        const coerce = typeOf(x).coerce;
        const next = coerce ? await coerce(x, value, f.form, { signal, verb: "form set" }) : String(value);
        const from = await f.read(x);
        await adapter.write(f.form, x, next, { signal, verb: "form set" });
        // Filling a field may change the form: read it as it is now.
        let to = next;
        let added = [];
        let removed = [];
        const again = (await load()).find((o) => o.id === id);
        if (again) {
          const g = open(again);
          const y = g.byPath.get(field);
          if (y) to = await g.read(y);
          added = [...g.byPath.keys()].filter((p) => !f.byPath.has(p));
          removed = [...f.byPath.keys()].filter((p) => !g.byPath.has(p));
        }
        let text = `${field}: ${short(from)} → ${short(to)}. Not sent yet.`;
        if (added.length) text += ` The form now also asks for: ${added.join(", ")}.`;
        if (removed.length) text += ` No longer asked: ${removed.join(", ")}.`;
        return { text, data: { field, from, to, ...(added.length ? { added } : {}), ...(removed.length ? { removed } : {}) } };
      },
    },
    {
      name: "form submit",
      title: "Submit a form",
      provider: "form",
      description: adapter.reloads ? "Submit a form, the same as clicking its button. The page reloads" : "Submit a form, the same as clicking its button",
      input: ONE,
      positional: ["form"],
      output: { type: "object", required: ["form", "submitted"], properties: { form: { type: "string" }, submitted: { type: "boolean" } } },
      annotations: adapter.reloads ? { consequential: true, navigates: true } : { consequential: true },
      confirm({ form: id }) {
        const f = findNow(id);
        const changes = unsavedNow(f).length;
        const note = notes.submit ? now(notes.submit(f.form)) : "";
        return `Submit ${f.label}${changes ? ` with ${plural(changes, "change")}` : ""}?${note ? ` ${note}` : ""}`;
      },
      examples: [`form submit ${EXAMPLE}`],
      seeAlso: ["form status", "messages"],
      suggest,
      async run({ form: id }, { reinitializes, signal }) {
        const verb = "form submit";
        const f = await find(id, "submit");
        // Checked here, so a caller gets exit 1 instead of a browser bubble nobody sees.
        const missing = await f.missing();
        if (missing.length) {
          throw new CommandError(`${verb}: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required. Set ${missing.length === 1 ? "it" : "them"} first, for example: form set ${id} ${missing[0]} …`, EXIT.FAILED);
        }
        const problems = adapter.check ? await adapter.check(f.form, { signal, verb }) : [];
        if (problems && problems.length) {
          throw new CommandError(`${verb}: ${problems.map((p) => (p.field ? `${p.field}: ${p.message}` : p.message)).join("; ")}.`, EXIT.FAILED);
        }
        if (adapter.reloads) {
          // The page reloads: Sutram starts again there.
          reinitializes();
          // Submit after the result has been delivered to the caller.
          setTimeout(() => adapter.submit(f.form, { verb }), 0);
          return {
            text: `Submitting ${f.label}. The page reloads; then messages says how it went, or form status ${id} shows errors if the form comes back.`,
            data: { form: id, submitted: true },
          };
        }
        const done = (await adapter.submit(f.form, { signal, verb })) || {};
        return { text: done.text || `Submitted ${f.label}.`, data: { form: id, submitted: true, ...(done.data || {}) } };
      },
    },
    {
      name: "form discard",
      title: "Discard form changes",
      provider: "form",
      description: "Undo the unsaved changes in a form: every field gets back the value it had when the form loaded",
      input: ONE,
      positional: ["form"],
      output: { type: "object", required: ["discarded"], properties: { discarded: { type: "array", items: { type: "string" } } } },
      annotations: { consequential: true },
      confirm({ form: id }) {
        const changes = unsavedNow(findNow(id));
        return changes.length ? `Discard the unsaved changes in ${changes.join(", ")}?` : "There are no unsaved changes. Run anyway?";
      },
      examples: [`form discard ${EXAMPLE}`],
      seeAlso: ["form status"],
      suggest,
      async run({ form: id }, { signal }) {
        const changes = await (await find(id, "discard")).unsaved();
        // One at a time, each on the form as it is then: a write may change it.
        for (const c of changes) {
          const f = await find(id, "discard");
          const x = f.byPath.get(c.field);
          if (x) await adapter.write(f.form, x, c.from, { signal, verb: "form discard" });
        }
        return {
          text: changes.length ? `Discarded changes in ${changes.map((c) => c.field).join(", ")}.` : "Nothing to discard.",
          data: { discarded: changes.map((c) => c.field) },
        };
      },
    },
  ];

  /** Runs one of the adapter's optional commands and checks its answer. */
  const answer = (verb, needs) => (result) => {
    if (!result || typeof result !== "object" || !result.data || typeof result.data !== "object" || needs.some((k) => !(k in result.data))) {
      throw new CommandError(`${verb}: the app's adapter answered without { data: { ${needs.join(", ")} } }`, EXIT.FAILED);
    }
    return result;
  };

  if (adapter.add) {
    defs.push({
      name: "form add",
      title: "Add to a form field",
      provider: "form",
      description: "Add an item to a field that takes several, the same as clicking its \"Add another\" button. With a value, add it to what the field holds",
      input: {
        type: "object",
        properties: {
          form: FORM,
          field: { type: "string", description: "The field, by its name without an item number, such as links." },
          value: { type: "string", description: "What to add, for a field that takes it. Leave it out to add an empty item." },
        },
        required: ["form", "field"],
      },
      positional: ["form", "field", "value"],
      output: {
        type: "object",
        required: ["field", "added"],
        properties: {
          field: { type: "string" },
          item: { type: "string", description: "The new item, such as links.1" },
          added: { type: "array", description: "The new paths form set fills; with a value, what was added" },
          value: { description: "With a value: what the field holds now, as form get reads it" },
        },
      },
      annotations: {},
      examples: [`form add ${EXAMPLE} links`],
      seeAlso: ["form set", "form remove", "form fields"],
      suggest: adapter.addable ? suggestFrom(adapter.addable, "field") : suggest,
      async run({ form: id, field, value }, { signal }) {
        const verb = "form add";
        const f = await find(id, "add");
        const r = answer(verb, ["added"])(await adapter.add(f.form, field, value, { signal, verb }));
        const added = Array.isArray(r.data.added) ? r.data.added : [];
        const item = r.data.item || field;
        const first = added.length && typeof added[0] === "string" ? added[0] : "";
        return {
          text: r.text || (added.length
            ? `Added ${item} to ${f.label}${first ? `: ${added.join(", ")}. form set ${id} ${first} … fills it` : ""}.`
            : `Nothing was added to ${field}. form fields ${id} shows the field.`),
          data: { field, ...r.data },
        };
      },
    });
  }

  if (adapter.remove) {
    defs.push({
      name: "form remove",
      title: "Remove from a form field",
      provider: "form",
      description: "Remove an item from a field that takes several, or a file from a file field, the same as clicking its Remove button. The items after it move up",
      input: {
        type: "object",
        properties: {
          form: FORM,
          target: { type: "string", description: "What to remove, by its path: an item as the field name and its number (links.1), a file as its field (image) or with its number (files.1)." },
        },
        required: ["form", "target"],
      },
      positional: ["form", "target"],
      output: { type: "object", required: ["removed"], properties: { removed: { type: "string" }, items: { type: "integer", description: "Items the field has now" } } },
      annotations: { consequential: true },
      confirm({ form: id, target }) {
        const f = findNow(id);
        const values = f.fields.filter((x) => x.field === target || x.field.startsWith(`${target}.`)).map((x) => short(now(f.read(x))));
        return `Remove ${target}${values.length ? ` (${values.join(", ")})` : ""} from ${f.label}?`;
      },
      examples: [`form remove ${EXAMPLE} links.1`],
      seeAlso: ["form add", "form fields"],
      suggest: adapter.removable ? suggestFrom(adapter.removable, "target") : suggest,
      async run({ form: id, target }, { signal }) {
        const verb = "form remove";
        const f = await find(id, "remove");
        const r = answer(verb, ["removed"])(await adapter.remove(f.form, target, { signal, verb }));
        const n = r.data.items;
        return {
          text: r.text || `Removed ${target} from ${f.label}${Number.isInteger(n) ? `; it has ${plural(n, "item")} now` : ""}. Not sent yet.`,
          data: r.data,
        };
      },
    });
  }

  if (adapter.search) {
    defs.push({
      name: "form search",
      title: "Search for a reference",
      provider: "form",
      description: "Find what a reference field can point to, as its autocomplete does",
      input: {
        type: "object",
        properties: {
          form: FORM,
          field: { type: "string", description: "A reference field, such as author or tags. The item number may be left out." },
          text: { type: "string", description: "Part of a label, such as the start of a title or name" },
        },
        required: ["form", "field", "text"],
      },
      positional: ["form", "field", "text"],
      output: {
        type: "object",
        required: ["field", "candidates"],
        properties: {
          field: { type: "string" },
          text: { type: "string" },
          candidates: {
            type: "array",
            items: {
              type: "object",
              required: ["value", "label"],
              properties: {
                value: { type: "string", title: "Value", description: "As form set takes it" },
                label: { type: "string", title: "Label" },
                id: { type: "string", title: "Id" },
              },
            },
          },
        },
      },
      view: { columns: ["value", "label", "id"] },
      annotations: { readOnly: true },
      examples: [`form search ${EXAMPLE} tags cof`],
      seeAlso: ["form set", "form fields"],
      suggest: adapter.searchable ? suggestFrom(adapter.searchable, "field") : suggest,
      async run({ form: id, field, text }, { signal }) {
        const verb = "form search";
        const f = await find(id, "search");
        const r = answer(verb, ["candidates"])(await adapter.search(f.form, field, text, { signal, verb }));
        const found = r.data.candidates;
        return {
          text: r.text || (found.length ? found.map((c) => c.value).join("\n") : `Nothing in ${r.data.field || field} matches "${text}".`),
          data: { field, text, ...r.data },
        };
      },
    });
  }

  if (adapter.upload) {
    const text = (description) => ({ type: "string", description });
    defs.push({
      name: "form upload",
      title: "Upload a file to a form field",
      provider: "form",
      description: "Upload a file to a file or image field, the same as choosing it in the field",
      input: {
        type: "object",
        properties: {
          form: FORM,
          field: text("A file or image field, by its name, such as image. A field that takes several gets a new item."),
          source: text("A URL the page may fetch: of this site, such as /files/a.pdf, or of a site that allows it (CORS); a data: URL works too. Several, separated by spaces, for a field that takes several. Leave it out, and --text and --base64, to choose the file yourself at the console."),
          name: text("The file name with its extension, such as notes.txt. Needed with --text and --base64; for a URL it replaces the name in its path."),
          text: text("The content of a text file."),
          base64: text(`The content of the file, base64 encoded. At most ${mb(MAX_CONTENT)}: give a larger file as a URL.`),
          type: text("The MIME type, such as application/pdf."),
          alt: text("An image's alternative text, set once it is uploaded."),
          title: text("An image's title, set once it is uploaded."),
          description: text("A file's description, set once it is uploaded."),
        },
        required: ["form", "field"],
      },
      positional: ["form", "field", "source"],
      output: {
        type: "object",
        required: ["field", "uploaded"],
        properties: {
          field: { type: "string" },
          uploaded: {
            type: "array",
            items: {
              type: "object",
              required: ["field", "filename"],
              properties: {
                field: { type: "string", title: "Item", description: "The path of the new item, as form get reads it" },
                filename: { type: "string", title: "File" },
                size: { type: "integer", title: "Bytes" },
                mime: { type: "string" },
                url: { type: "string" },
                paths: { type: "array", items: { type: "string" }, description: "The paths that came with it, such as image.alt, which form set fills" },
              },
            },
          },
          refused: { type: "array", items: { type: "string" }, description: "What the app refused when it took some of the files" },
        },
      },
      view: { columns: ["field", "filename", "size", "paths"] },
      annotations: { consequential: true },
      confirm(input) {
        const { form: id, field, source, name, text: t, base64 } = input;
        const what = name || (source ? source.split(/\s+/).join(", ") : t !== undefined || base64 ? "a file" : "a file you choose");
        const note = notes.upload ? now(notes.upload(findNow(id).form, input)) : "";
        return `Upload ${what} to ${field} of ${id}?${note ? ` ${note}` : ""}`;
      },
      examples: [`form upload ${EXAMPLE} image /files/photo.png --alt="A photo"`, `form upload ${EXAMPLE} files --name=notes.txt --text="Grind at 18"`, `form upload ${EXAMPLE} image`],
      seeAlso: ["form remove", "form set", "form submit"],
      suggest: adapter.uploadable ? suggestFrom(adapter.uploadable, "field") : suggest,
      async run(input, { signal, caller }) {
        const verb = "form upload";
        const { form: id, field, source } = input;
        const f = await find(id, "upload");
        let files = null;
        if (input.text !== undefined || input.base64 !== undefined) {
          if (source || (input.text !== undefined && input.base64 !== undefined)) throw new CommandError(`${verb}: give one source: a URL, --text or --base64.`, EXIT.USAGE);
          files = [fromContent(input, verb)];
        } else if (source && source.trim()) {
          const urls = source.trim().split(/\s+/);
          if (urls.length > 1 && input.name) throw new CommandError(`${verb}: --name names one file; give one URL with it.`, EXIT.USAGE);
          files = await Promise.all(urls.map((u) => fromUrl(u, input, { signal, verb })));
        }
        const r = answer(verb, ["uploaded"])(await adapter.upload(f.form, field, files, input, { signal, verb, caller }));
        const uploaded = r.data.uploaded;
        const refused = r.data.refused || [];
        return {
          text: r.text || [
            `Uploaded to ${f.label}, not sent yet:`,
            ...uploaded.map((a) => `  ${a.field}: ${a.filename}${a.size !== undefined ? `, ${a.size} bytes` : ""}${a.paths && a.paths.length ? `; also ${a.paths.join(", ")}` : ""}`),
            ...refused.map((m) => `  Refused: ${m}`),
          ].join("\n"),
          data: { field, ...r.data },
        };
      },
    });
  }

  return registerAll(registry, defs);
}
