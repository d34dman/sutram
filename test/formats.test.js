import { test } from "node:test";
import assert from "node:assert/strict";
import { createFormats, createRegistry, checkInput, checkOutput, formatValue, formatResult, blocksToText, EXIT } from "../src/index.js";
import { toTool } from "../src/webmcp.js";

const sku = {
  type: "string",
  description: "a product code such as V60-02",
  validate: (v) => /^[A-Z0-9-]+$/.test(v),
  display: (v) => `#${v}`,
};

test("define refuses bad definitions and names that are taken, and returns a remover", () => {
  const f = createFormats();
  assert.throws(() => f.define("Money", {}), /not a valid name/);
  assert.throws(() => f.define("sku", { show: () => "" }), /unknown field "show"/);
  assert.throws(() => f.define("sku", { display: "nope" }), /must be a function/);
  assert.throws(() => f.define("date", {}), /already defined/, "JSON Schema's own date formats come predefined");
  const off = f.define("sku", sku);
  assert.throws(() => f.define("sku", { ...sku }), /already defined/);
  off();
  assert.ok(!f.has("sku"));
});

test("a format nobody defined is only an annotation: no check, shown as it is", () => {
  const f = createFormats();
  const schema = { type: "object", properties: { price: { type: "number", format: "money" } } };
  assert.deepEqual(checkInput(schema, { price: "24" }, f), { errors: [], value: { price: 24 } });
  assert.equal(checkOutput(schema, { price: 24 }, schema, f), null);
  assert.equal(formatValue(24, schema.properties.price, { formats: f }), "24");
  assert.equal(formatValue({ amount: 24 }, { format: "money" }, { formats: f }), '{"amount":24}');
});

test("validate checks typed input and results; display shows values", async () => {
  const f = createFormats();
  f.define("sku", sku);
  const r = createRegistry({ formats: f });
  r.register({
    name: "cart add", provider: "cart", description: "Add",
    input: { type: "object", properties: { sku: { type: "string", format: "sku" } }, required: ["sku"] },
    output: { type: "object", properties: { sku: { type: "string", format: "sku" } } },
    annotations: {}, run: ({ sku: s }) => ({ data: { sku: s } }),
  });
  const bad = await r.run("cart add", { sku: "v60 02" });
  assert.equal(bad.code, EXIT.USAGE);
  assert.equal(bad.message, "cart add: sku must be sku, a product code such as V60-02");
  const ok = await r.run("cart add", { sku: "V60-02" });
  assert.equal(blocksToText(formatResult(ok, r.get("cart add"), { formats: f })), "sku: #V60-02");
  assert.equal(checkOutput({ type: "string", format: "sku" }, "nope!", undefined, f), "expected sku, a product code such as V60-02");
});

test("a display that throws falls back to the plain value", () => {
  const f = createFormats();
  f.define("odd", { display: () => { throw new Error("no"); } });
  assert.equal(formatValue(3, { format: "odd" }, { formats: f }), "3");
});

test("agents get each page-defined format explained once, and none of JSON Schema's own", () => {
  const f = createFormats();
  f.define("sku", sku);
  const tool = toTool({
    name: "cart add", provider: "cart", description: "Add a product",
    input: { type: "object", properties: { sku: { type: "string", format: "sku" }, at: { type: "string", format: "date-time" } } },
    output: { type: "object", properties: { sku: { type: "string", format: "sku" } } },
    annotations: {}, run: () => ({}),
  }, f);
  assert.equal(tool.description, "Add a product. Returns { sku: sku }. sku: a product code such as V60-02.");
});
