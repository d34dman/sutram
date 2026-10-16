// Compares how an agent fills in a real form, Drupal's "Create Article"
// form, captured from the demo site in docs/measurements/.
//
//   C.  A browser agent without Sutram. It reads the page (an accessibility
//       snapshot, the cheapest view a browser agent gets), then clicks and
//       types field by field.
//   B.  Sutram's form commands, one field per call: through WebMCP (B1), as
//       command lines in the console (B2), or every field in one sutram_batch
//       call first, then corrections one at a time (B3).
//   A.  For reference: a form-wide tool with one JSON schema. Drupal has no
//       such tool. It is built here from the field data Sutram's form module
//       already provides, as small as it can be, and it is fed to the agent
//       for free. Even this best case resends everything after one mistake.
//
// The task is the same for each: create an unpublished article with a title,
// a summary, a short body and two tags. The agent gets one value wrong (the
// published flag as "draft") and has to correct it.
//
// Prints sizes in bytes and an estimate in tokens (bytes ÷ 4; real tokenizers
// differ, the ratios between the rows hold). Run:
//
//   node scripts/measure.mjs            a Markdown table
//   node scripts/measure.mjs --json     the numbers
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const fx = JSON.parse(readFileSync(resolve(root, "docs/measurements/drupal-article-form.json"), "utf8"));
const base = fx.form;

const task = {
  title: "Pour-over, step by step",
  "body.summary": "A 15 g to 250 g V60 recipe",
  "body.value": "<p>Grind 15 g of coffee medium-fine. Rinse the filter, add the coffee, and pour 250 g of water at 94 °C in three pours over three minutes.</p>",
  field_tags: "coffee, v60",
  status: false,
};
const WRONG = { field: "status", value: "draft" }; // the mistake

// --- A: one schema for the whole form ----------------------------------------
// The schema a form-wide tool would publish: every field the form can take,
// nested as Drupal posts it (body.value → body: { value }).
const supported = fx.fields.filter((f) => f.type !== "unsupported");
function propFor(f) {
  const p = { description: f.label };
  if (f.type === "boolean") p.type = "boolean";
  else if (f.type === "number") p.type = "number";
  else if (f.type === "choice") Object.assign(p, { type: "string", enum: Object.keys(f.options || {}) });
  else if (f.type === "references") Object.assign(p, { type: "string", description: `${f.label}: names separated by commas` });
  else p.type = "string";
  return p;
}
function nest(entries) {
  const out = {};
  for (const [path, v] of entries) {
    const keys = path.split(".");
    let o = out;
    for (const k of keys.slice(0, -1)) o = o[k] ||= {};
    o[keys.at(-1)] = v;
  }
  return out;
}
function schemaOf(fields) {
  const props = {};
  for (const f of fields) {
    const keys = f.field.split(".");
    let o = props;
    for (const k of keys.slice(0, -1)) {
      o[k] ||= { type: "object", properties: {} };
      o = o[k].properties;
    }
    o[keys.at(-1)] = propFor(f);
  }
  return { type: "object", properties: props, required: fields.filter((f) => f.required).map((f) => f.field) };
}
const formTool = {
  name: "node_article_form_submit",
  description: "Create an article: send the values of the form's fields. Saves on success.",
  inputSchema: schemaOf(supported),
};
// The whole form, as a form submission carries it: the task's values, the
// rest as the form shows them now.
const current = Object.fromEntries(supported.map((f) => [f.field, f.value]));
const wholeForm = (values) => JSON.stringify(nest(Object.entries({ ...current, ...values })));
// Only the fields the task touches, if the tool allows leaving fields out.
const onlyTouched = (values) => JSON.stringify(nest(Object.entries(values)));
const withMistake = { ...task, [WRONG.field]: WRONG.value };

// --- B: Sutram's form commands -----------------------------------------------
const q = (v) => (typeof v === "string" && /[\s"'<>]/.test(v) ? JSON.stringify(v) : String(v));
const setLine = (field, value) => `${base} set ${field} ${q(value)}`;
const setCall = (field, value) => JSON.stringify({ tool: `${base.replace(/ /g, "_")}_set`, input: { field, value: String(value) } });
const steps = Object.entries(withMistake);
const wrongAt = steps.findIndex(([k]) => k === WRONG.field);
const lines = [...steps.map(([k, v]) => setLine(k, v)), `${base} save`];
const calls = [...steps.map(([k, v]) => setCall(k, v)), JSON.stringify({ tool: `${base.replace(/ /g, "_")}_save`, input: {} })];
const errorText = fx.outputs.find((o) => o.code === 2).text;

// --- C: a browser agent without Sutram ----------------------------------------
// Playwright MCP calls with the element references from the snapshot. The
// summary only appears after "Edit summary" is clicked, so its reference is
// not known up front.
const ba = fx.browserAgent;
const snapshot = readFileSync(resolve(root, "docs/measurements", ba.snapshotFile), "utf8");
const act = (tool, element, ref, text) => JSON.stringify({ tool, input: { element, ref, ...(text === undefined ? {} : { text }) } });
const browserCalls = [
  act("browser_type", "Title", ba.refs.title, task.title),
  act("browser_click", "Edit summary", ba.refs.editSummary),
  act("browser_type", "Summary", "e???", task["body.summary"]),
  act("browser_type", "Rich Text Editor", ba.refs["body.value"], "Grind 15 g of coffee medium-fine. Rinse the filter, add the coffee, and pour 250 g of water at 94 °C in three pours over three minutes."),
  act("browser_type", "Tags", ba.refs.field_tags, task.field_tags),
  act("browser_click", "Published", ba.refs.status),
  act("browser_click", "Save", ba.refs.save),
];
// A screenshot costs about width × height ÷ 750 tokens (Anthropic's guidance for images).
const screenshot = Math.round((ba.viewport[0] * ba.viewport[1]) / 750);
const screens = Math.ceil(ba.pageHeight / ba.viewport[1]);

// --- B3: everything in one batch, then corrections ------------------------------
const batchCall = (list) => JSON.stringify({ tool: "sutram_batch", input: { calls: list.map((c) => JSON.parse(c)) } });

// What each side reads before it can act, writes, and writes again after the
// mistake. A pasted batch stops at the failing line, so the console path
// sends the corrected line and the lines after it again; a WebMCP call fails
// alone, so B1 sends one call again.
const bytes = (s) => Buffer.byteLength(s, "utf8");
const rows = [
  {
    way: "C. Browser agent, no Sutram (accessibility snapshot)",
    reads: bytes(snapshot),
    writes: browserCalls.reduce((n, c) => n + bytes(c), 0),
    // No error message: to see that a value is wrong, it reads the page again.
    again: bytes(snapshot) + bytes(browserCalls[5]),
  },
  {
    way: "B1. Sutram through WebMCP, one call per field",
    reads: fx.pageTools.bytes,
    writes: calls.reduce((n, c) => n + bytes(c), 0),
    again: bytes(setCall(WRONG.field, task[WRONG.field])) + bytes(calls.at(-1)),
  },
  {
    way: "B2. Sutram in the console (help, fields)",
    reads: bytes(fx.help) + bytes(fx.fieldsText),
    writes: bytes(lines.join("\n")),
    again: bytes([setLine(WRONG.field, task[WRONG.field]), ...lines.slice(wrongAt + 1)].join("\n")),
  },
  {
    way: "B3. Sutram, every field in one sutram_batch, then corrections",
    reads: fx.pageTools.bytes,
    writes: bytes(batchCall(calls)),
    // The batch stops at the wrong value; the fields before it stay set.
    again: bytes(batchCall([setCall(WRONG.field, task[WRONG.field]), ...calls.slice(wrongAt + 1)])),
  },
  {
    way: "A. For reference: a hand-made form-wide tool, whole form",
    reads: bytes(JSON.stringify(formTool)),
    writes: bytes(wholeForm(withMistake)),
    again: bytes(wholeForm(task)),
  },
  {
    way: "A′. The same, only the fields it changes",
    reads: bytes(JSON.stringify(formTool)),
    writes: bytes(onlyTouched(withMistake)),
    again: bytes(onlyTouched(task)),
  },
];
const tokens = (n) => Math.round(n / 4);

// Discovery for the whole page: every tool's schema, or help's one line per command.
const page = { tools: fx.pageTools.bytes, count: fx.pageTools.count, help: bytes(fx.help) };

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ captured: fx.captured, errorText, page, html: ba.htmlBytes, screenshot: { tokens: screenshot, screens }, rows: rows.map((r) => ({ ...r, tokens: { reads: tokens(r.reads), writes: tokens(r.writes), again: tokens(r.again) } })) }, null, 2));
} else {
  console.log(`Form: ${base}, ${supported.length} fields an agent can set. Captured ${fx.captured}.\n`);
  console.log("| Way | Reads first | Writes | Correcting one wrong value |");
  console.log("|---|--:|--:|--:|");
  for (const r of rows) console.log(`| ${r.way} | ${r.reads} B (≈${tokens(r.reads)} tokens) | ${r.writes} B (≈${tokens(r.writes)}) | ${r.again} B (≈${tokens(r.again)}) |`);
  console.log(`\nDiscovering the whole page (${page.count} commands): the tool list is ${page.tools} B (≈${tokens(page.tools)} tokens), help is ${page.help} B (≈${tokens(page.help)}).`);
  console.log(`\nThe same page as raw HTML is ${ba.htmlBytes} B (≈${tokens(ba.htmlBytes)} tokens). A screenshot of the ${ba.viewport.join("×")} viewport costs ≈${screenshot} tokens, and the form takes ${screens}. ${Object.keys(ba.hiddenUntilClicked).length} fields are hidden until clicked open (${Object.entries(ba.hiddenUntilClicked).map(([k, v]) => `${k}: ${v}`).join("; ")}); C's numbers count no extra reads for them.`);
  console.log(`\nThe wrong value, as the form command reports it: "${errorText}"`);
}
