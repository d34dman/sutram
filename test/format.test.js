import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, createFormats } from "../src/index.js";
import { formatResult, blocksToText, formatMan, formatHelp, checkFields } from "../src/client.js";
import { describeShape } from "../src/internals.js";

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
  assert.deepEqual(formatResult(productData, products, { json: true, fields: ["colour"] })[0].code, 2);
});

test("help lists commands with usage and annotation", () => {
  const r = createRegistry();
  r.register(cartStatus);
  assert.match(formatHelp(r)[0].text, /^cart status {2}What is in the cart now {2}\[read-only\]$/);
});
