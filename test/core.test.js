import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, checkInput, checkOutput, runStatus, EXIT } from "../src/index.js";

const def = (over = {}) => ({
  name: "cart add",
  provider: "cart",
  description: "Add a product to the cart",
  input: { type: "object", properties: { sku: { type: "string" }, qty: { type: "integer", minimum: 1, default: 1 } }, required: ["sku"] },
  positional: ["sku", "qty"],
  annotations: {},
  run: ({ sku, qty }) => ({ text: `Added ${qty} × ${sku}.`, data: { sku, qty } }),
  ...over,
});

test("register refuses incomplete, reserved and duplicate definitions", () => {
  const r = createRegistry();
  assert.throws(() => r.register({ name: "x" }), /has no provider/);
  assert.throws(() => r.register(def({ name: "help me" })), /reserved/);
  assert.throws(() => r.register(def({ name: "Cart Add" })), /not a valid name/);
  assert.throws(() => r.register(def({ input: { type: "object", properties: { json: { type: "boolean" } } } })), /clients own it/);
  r.register(def());
  assert.throws(() => r.register(def({ provider: "other" })), /already belongs to cart/);
});

test("register returns an unregister function, and both announce a change", () => {
  const r = createRegistry();
  const seen = [];
  r.onChange((e) => seen.push(`${e.type} ${e.name}`));
  const off = r.register(def());
  assert.equal(r.list().length, 1);
  off();
  assert.equal(r.list().length, 0);
  assert.deepEqual(seen, ["register cart add", "unregister cart add"]);
});

test("run checks and coerces input, and resolves to an exit code", async () => {
  const r = createRegistry();
  r.register(def());
  assert.deepEqual(await r.run("cart add", { sku: "V60", qty: "2" }), { code: 0, text: "Added 2 × V60.", data: { sku: "V60", qty: 2 } });
  assert.equal((await r.run("cart add", { qty: 0 })).code, EXIT.USAGE);
  assert.equal((await r.run("cart stauts")).code, EXIT.NOT_FOUND);
});

test("a handler that throws becomes exit 1, or its own code", async () => {
  const r = createRegistry();
  r.register(def({ run: () => { throw new Error("out of stock"); } }));
  assert.deepEqual(await r.run("cart add", { sku: "x" }), { code: 1, message: "out of stock" });
});

test("an aborted signal cancels with 130", async () => {
  const r = createRegistry();
  r.register(def());
  const ctrl = new AbortController();
  ctrl.abort();
  assert.equal((await r.run("cart add", { sku: "x" }, { signal: ctrl.signal })).code, EXIT.CANCELLED);
});

test("checkInput handles booleans, enums and arrays", () => {
  const schema = { type: "object", properties: { on: { type: "boolean" }, mode: { type: "string", enum: ["a", "b"] }, tags: { type: "array" } } };
  assert.deepEqual(checkInput(schema, { on: "yes", mode: "a", tags: "x, y" }).value, { on: true, mode: "a", tags: ["x", "y"] });
  assert.deepEqual(checkInput(schema, { mode: "c" }).errors, ["mode must be one of: a, b"]);
});

test("checkOutput names the field that does not match, following $ref", () => {
  const schema = { type: "object", required: ["items"], properties: { items: { type: "array", items: { $ref: "#/$defs/i" } } }, $defs: { i: { type: "object", properties: { qty: { type: "integer" } } } } };
  assert.equal(checkOutput(schema, { items: [{ qty: 1 }] }), null);
  assert.equal(checkOutput(schema, {}), "items is missing");
  assert.equal(checkOutput(schema, { items: [{ qty: "1" }] }), "items: [0]: qty: expected integer, got string");
});

test("runStatus runs every read-only <provider> status", async () => {
  const r = createRegistry();
  r.register(def());
  r.register({ name: "cart status", provider: "cart", description: "d", input: { type: "object" }, annotations: { readOnly: true }, run: () => ({ text: "Empty." }) });
  assert.deepEqual(await runStatus(r), [{ provider: "cart", code: 0, text: "Empty." }]);
});
