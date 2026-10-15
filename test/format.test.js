import { test } from "node:test";
import assert from "node:assert/strict";
import { formatResult, blocksToText, formatMan, describeShape, createRegistry, formatHelp } from "../src/index.js";

const MONEY = { type: "number", format: "money" };
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
  { sku: "V60-02", name: "V60 dripper, size 02", qty: 2, price: 24 },
  { sku: "COL-HUI-250", name: "Huila, Colombia", qty: 1, price: 12.9 },
], total: 60.9 } };

test("a summary, then each list as a table, money formatted", () => {
  const text = blocksToText(formatResult(result, cartStatus, { currency: "EUR", locale: "en-IE" }));
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

test("describeShape summarises output for a tool description", () => {
  assert.equal(describeShape(cartStatus.output), "{ items: [{ sku, name, qty, price }], total }");
});

test("help lists commands with usage and annotation", () => {
  const r = createRegistry();
  r.register(cartStatus);
  assert.match(formatHelp(r)[0].text, /^cart status {2}What is in the cart now {2}\[read-only\]$/);
});
