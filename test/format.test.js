import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, createFormats } from "../src/index.js";
import { formatResult, blocksToText, formatMan, formatHelp, checkFields } from "../src/client.js";
import { describeShape } from "../src/internals.js";
import { approvalLine, commandLine } from "../src/format.js";

// Money is the app's format, not Sutram's: this test defines it the way a commerce module would.
const formats = createFormats();
formats.define("money", {
  type: "object",
  description: "{ amount, currency } with an ISO 4217 code",
  validate: (v) => typeof v.amount === "number" && /^[A-Z]{3}$/.test(v.currency),
  display: (v, { locale }) => new Intl.NumberFormat(locale, { style: "currency", currency: v.currency }).format(v.amount),
  align: "right",
});
const MONEY = { type: "object", format: "money", properties: { amount: { type: "number" }, currency: { type: "string" } } };
const eur = (amount) => ({ amount, currency: "EUR" });
const cartStatus = {
  name: "cart status", provider: "cart", description: "What is in the cart now",
  input: { type: "object", properties: {} }, annotations: { readOnly: true },
  output: { type: "object", properties: {
    items: { type: "array", items: { type: "object", properties: { sku: { type: "string" }, name: { type: "string" }, qty: { type: "integer" }, price: MONEY } } },
    total: MONEY,
  } },
  run: () => ({}),
};
const result = { code: 0, text: "3 items, €60.90.", data: { items: [
  { sku: "V60-02", name: "V60 dripper, size 02", qty: 2, price: eur(24) },
  { sku: "COL-HUI-250", name: "Huila, Colombia", qty: 1, price: eur(12.9) },
], total: eur(60.9) } };

test("a summary, then each list as a table, money formatted", () => {
  const text = blocksToText(formatResult(result, cartStatus, { locale: "en-IE", formats }));
  assert.equal(text, [
    "3 items, €60.90.",
    "SKU          NAME                  QTY   PRICE",
    "V60-02       V60 dripper, size 02    2  €24.00",
    "COL-HUI-250  Huila, Colombia         1  €12.90",
  ].join("\n"));
});

test("without a summary, a record prints as key: value", () => {
  const text = blocksToText(formatResult({ code: 0, data: { url: "/shop", menuItems: 10 } }, {}));
  assert.equal(text, "url:       /shop\nmenuItems: 10");
});

test("--json prints the data unchanged", () => {
  assert.deepEqual(JSON.parse(formatResult(result, cartStatus, { json: true })[0].text), result.data);
});

test("records with children print as an indented tree", () => {
  const data = [{ title: "Shop", children: [{ title: "Coffee" }] }];
  assert.equal(blocksToText(formatResult({ code: 0, data }, { output: { type: "array", items: { type: "object", properties: { title: { type: "string" }, children: { type: "array" } } } } })), "TITLE\nShop\n  Coffee");
});

test("a failure prints its message", () => {
  assert.deepEqual(formatResult({ code: 2, message: "cart add: sku is required" }, {}), [{ kind: "error", text: "cart add: sku is required", code: 2 }]);
});

test("man has OUTPUT and EXIT STATUS sections", () => {
  const text = formatMan(cartStatus)[0].text;
  assert.match(text, /OUTPUT\n {5}items\n {10}list of records\.\n {10}sku/);
  assert.match(text, /EXIT STATUS/);
});

test("describeShape names a formatted field by its format", () => {
  assert.equal(describeShape(cartStatus.output), "{ items: [{ sku, name, qty, price: money }], total: money }");
});

test("man explains a page-defined format where it is used", () => {
  assert.match(formatMan(cartStatus, undefined, formats)[0].text, /total\n {10}object, money\. money: \{ amount, currency \} with an ISO 4217 code\./);
});

const products = {
  name: "product list", provider: "product", description: "Products on this page",
  input: { type: "object", properties: {} }, annotations: { readOnly: true },
  output: { type: "array", items: { type: "object", properties: {
    sku: { type: "string" }, name: { type: "string" }, origin: { type: "string" }, price: MONEY,
  } } },
  view: { columns: ["sku", "name", "price"] },
  run: () => ({}),
};
const productData = { code: 0, data: [{ sku: "COL-HUI-250", name: "Huila", origin: "Colombia", price: eur(12.9) }] };

test("--wide shows the columns view.columns leaves out", () => {
  assert.doesNotMatch(blocksToText(formatResult(productData, products, { formats })), /ORIGIN/);
  assert.match(blocksToText(formatResult(productData, products, { wide: true, formats })), /^SKU +NAME +ORIGIN +PRICE$/m);
});

test("--json=fields keeps only those fields, and names the ones that exist", () => {
  const out = formatResult(productData, products, { json: true, fields: ["sku", "price"] });
  assert.deepEqual(JSON.parse(out[0].text), [{ sku: "COL-HUI-250", price: { amount: 12.9, currency: "EUR" } }]);
  const picked = JSON.parse(formatResult(result, cartStatus, { json: true, fields: ["total"] })[0].text);
  assert.deepEqual(picked, { total: { amount: 60.9, currency: "EUR" } });
  assert.equal(checkFields(products, ["sku"]), null);
  assert.equal(checkFields(products, ["sku", "colour"]), 'product list: unknown field "colour". Available: sku, name, origin, price');
  // After the run, a field it lacks is a note, not an error: the command has run.
  const late = formatResult(productData, products, { json: true, fields: ["colour"] });
  assert.equal(late[0].kind, "dim");
  assert.deepEqual(JSON.parse(late[1].text), productData.data);
});

test("--json=fields reaches the rows of a list inside a record, and the record's own fields come first", async () => {
  const { selectFields } = await import("../src/client.js");
  const rows = {
    name: "listing rows", provider: "listing", description: "Rows", annotations: { readOnly: true }, run: () => ({}),
    output: {
      type: "object",
      properties: {
        total: { type: "integer" },
        rows: { type: "array", items: { type: "object", properties: { title: { type: "string" }, url: { type: "string" }, total: { type: "integer" } } } },
      },
    },
  };
  const data = { total: 2, rows: [{ title: "A", url: "/a", total: 1 }, { title: "B", url: "/b", total: 5 }] };
  assert.equal(checkFields(rows, ["title", "url"]), null);
  assert.equal(checkFields(rows, ["colour"]), 'listing rows: unknown field "colour". Available: total, rows, title, url');
  assert.deepEqual(selectFields(data, ["title"], rows.output).data, { rows: [{ title: "A" }, { title: "B" }] });
  assert.deepEqual(selectFields(data, ["url", "total"], rows.output).data, { total: 2, rows: [{ url: "/a" }, { url: "/b" }] });
  assert.deepEqual(selectFields(data, ["rows"], rows.output).data, { rows: data.rows });
  // Rows the schema does not describe (an app's own columns) are checked after the run.
  const open = { ...rows, output: { type: "object", properties: { total: { type: "integer" }, rows: { type: "array", items: { type: "object" } } } } };
  assert.equal(checkFields(open, ["title"]), null);
  assert.deepEqual(selectFields(data, ["title"], open.output).data, { rows: [{ title: "A" }, { title: "B" }] });
  assert.match(selectFields(data, ["colour"], open.output).error, /unknown field "colour". Available: total, rows, title, url/);
  // Without a schema, the data says what is there.
  assert.deepEqual(selectFields({ n: 1, items: [{ a: 1, b: 2 }] }, ["b"]).data, { items: [{ b: 2 }] });
  // Of several lists, only those with the field.
  assert.deepEqual(selectFields({ forms: [{ form: "f" }], fields: [{ field: "x", value: 1 }] }, ["value"]).data, { fields: [{ value: 1 }] });
});

test("help lists commands with usage and annotation", () => {
  const r = createRegistry();
  r.register(cartStatus);
  assert.match(formatHelp(r)[0].text, /^cart status {2}What is in the cart now {2}\[read-only\]$/);
});

test("--json=fields on an empty list gives an empty list", async () => {
  const { selectFields } = await import("../src/client.js");
  const schema = { type: "array", items: { type: "object", properties: { sku: { type: "string" } } } };
  assert.deepEqual(selectFields([], ["sku"], schema), { data: [] });
  assert.match(selectFields([], ["nope"], schema).error, /unknown field "nope"/);
  assert.deepEqual(selectFields([], ["sku"]), { data: [] });
});

test("help shows the first line of a multi-line description; man shows all of it", () => {
  const r = createRegistry();
  r.register({ name: "doc fix", provider: "doc", description: "Fix the document\n\nRuns every check, then\n  fixes what it can.", annotations: {}, run: () => ({}) });
  r.register({ name: "doc show", provider: "doc", description: "Show it", annotations: { readOnly: true }, run: () => ({}) });
  const help = formatHelp(r);
  assert.equal(help[0].text.split("\n").length, help[0].commands.length);
  assert.match(help[0].text, /doc fix\s+Fix the document\n/);
  const man = blocksToText(formatMan(r.get("doc fix"), "doc fix", r.formats));
  assert.match(man, /doc fix - Fix the document\n/);
  assert.match(man, /DESCRIPTION\n\n?     Runs every check, then\n       fixes what it can\./);
});

test("wording: plurals, sentences, empty lists, object defaults, nullable types", async () => {
  const { sentence, formatValue, synopsis } = await import("../src/internals.js");
  const { complete } = await import("../src/client.js");
  assert.equal(formatValue([{ a: 1 }]), "1 item");
  assert.equal(formatValue([{ a: 1 }, { a: 2 }]), "2 items");
  assert.equal(sentence("Hi!"), "Hi!");
  assert.equal(sentence("Sure?"), "Sure?");
  assert.equal(sentence("Done  "), "Done.");
  assert.deepEqual(formatResult({ code: 0, data: [] }, {}), [{ kind: "dim", text: "Nothing to show." }]);
  const r = createRegistry();
  const d = {
    name: "doc set", provider: "doc", description: "Set", annotations: {},
    input: { type: "object", properties: { note: { type: ["string", "null"] }, on: { type: ["boolean", "null"] }, meta: { type: "object", default: { a: 1 } } } },
    run: () => ({}),
  };
  r.register(d);
  r.register({ name: "media add", provider: "media", description: "Add", annotations: {}, run: () => ({}) });
  assert.equal(synopsis(d), "doc set [--note=<string>] [--on] [--meta=<object>]");
  const man = blocksToText(formatMan(d, "doc set", r.formats));
  assert.match(man, /--note\n\s+string or null\./);
  assert.match(man, /default \{"a":1\}/);
  const items = (await complete(r, "med")).items;
  assert.notEqual(items[0].description, "1 commands");
});

test("view.columns counts only the columns a table has", () => {
  const def = { output: { type: "object", properties: {
    menus: { type: "array", items: { type: "object", properties: { menu: { type: "string" }, links: { type: "integer" } } } },
    items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, url: { type: "string" } } } },
  } }, view: { columns: ["title", "url"] } };
  const menus = blocksToText(formatResult({ code: 0, data: { menus: [{ menu: "main", links: 3 }] } }, def));
  assert.match(menus, /^MENU\s+LINKS\nmain\s+3$/m);
  const items = blocksToText(formatResult({ code: 0, data: { items: [{ id: "a", title: "Home", url: "/" }] } }, def));
  assert.match(items, /^TITLE\s+URL\nHome\s+\/$/m);
});

test("approvalLine keeps each command to one line; commandLine keeps the full value", () => {
  const def = {
    name: "page edit", description: "Edit a page", positional: ["title"],
    input: { type: "object", properties: { title: { type: "string" }, body: { type: "string" }, tags: { type: "array" } } },
  };
  const body = "<p>Hello</p>\n".repeat(11) + "<p>Bye</p>";
  const title = "t".repeat(70);
  assert.equal(approvalLine(def, { title: "Short", body }), 'page edit Short --body="<p>Hello</p>…" (12 lines)');
  assert.equal(approvalLine(def, { title }), `page edit "${"t".repeat(60)}…" (70 characters)`);
  assert.equal(approvalLine(def, { title: "Short", tags: ["a", "b"] }), "page edit Short --tags=a,b");
  assert.equal(approvalLine(def, { tags: [{ long: "x".repeat(80) }] }).split("\n").length, 1);
  assert.match(approvalLine(def, { tags: [{ long: "x".repeat(80) }] }), /… \(\d+ characters\)$/);
  assert.equal(commandLine(def, { title: "Short", body }), `page edit Short --body <<END\n${body}\nEND`);
});
