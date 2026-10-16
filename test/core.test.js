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

const note = (over = {}) => def({
  name: "note set",
  provider: "note",
  input: {
    type: "object",
    properties: {
      field: { type: "string" },
      value: { type: "string" },
      n: { type: "integer" },
      tags: { type: "array", items: { type: "integer" } },
    },
    required: ["field"],
  },
  positional: ["field", "value"],
  run: (input) => ({ data: input }),
  ...over,
});

test("typed values must have the declared type; only text is converted", async () => {
  const r = createRegistry();
  r.register(note());
  const usage = async (input, message) => {
    const res = await r.run("note set", { field: "t", ...input });
    assert.equal(res.code, EXIT.USAGE);
    assert.match(res.message, message);
  };
  await usage({ value: { a: 1 } }, /value must be a string/);
  await usage({ n: true }, /n must be a whole number/);
  await usage({ n: " " }, /n must be a whole number/);
  await usage({ n: "0x10" }, /n must be a whole number/);
  assert.deepEqual((await r.run("note set", { field: "t", n: " 42 " })).data, { field: "t", n: 42 });
});

test("null means not given; an empty string is a value", async () => {
  const r = createRegistry();
  r.register(note());
  assert.deepEqual((await r.run("note set", { field: "t", value: null, n: null })).data, { field: "t" });
  assert.deepEqual((await r.run("note set", { field: "t", value: "" })).data, { field: "t", value: "" });
  // "" counts as present for a required string, as in JSON Schema.
  assert.deepEqual((await r.run("note set", { field: "" })).data, { field: "" });
  assert.equal((await r.run("note set", { field: null })).code, EXIT.USAGE);
  // For other types, "" (as from --n=) is not given.
  assert.deepEqual((await r.run("note set", { field: "t", n: "" })).data, { field: "t" });
});

test("array items are converted and checked", async () => {
  const r = createRegistry();
  r.register(note());
  assert.deepEqual((await r.run("note set", { field: "t", tags: "1, 2" })).data, { field: "t", tags: [1, 2] });
  const res = await r.run("note set", { field: "t", tags: "1,x" });
  assert.equal(res.code, EXIT.USAGE);
  assert.match(res.message, /tags\[1\] must be a whole number/);
  assert.equal((await r.run("note set", { field: "t", tags: [1, "2"] })).code, EXIT.OK);
});

test("only the schema's own properties are arguments", () => {
  const { errors } = checkInput(note().input, { field: "t", constructor: "x", toString: "y" });
  assert.deepEqual(errors, ['unknown argument "constructor"', 'unknown argument "toString"']);
});

test("every keyword that applies to one value is checked", () => {
  const check = (prop, v) => checkInput({ type: "object", properties: { x: prop } }, { x: v }).errors;
  assert.deepEqual(check({ type: "string", minLength: 2 }, "a"), ["x must be at least 2 characters"]);
  assert.deepEqual(check({ type: "string", maxLength: 2 }, "😀😀"), []); // code points, not UTF-16 units
  assert.deepEqual(check({ type: "string", maxLength: 2 }, "abc"), ["x must be at most 2 characters"]);
  assert.deepEqual(check({ type: "string", pattern: "^[a-z]+$" }, "Ab"), ["x must match ^[a-z]+$"]);
  assert.deepEqual(check({ const: "yes" }, "no"), ['x must be "yes"']);
  assert.deepEqual(check({ type: "number", exclusiveMinimum: 0 }, 0), ["x must be more than 0"]);
  assert.deepEqual(check({ type: "number", exclusiveMaximum: 1 }, "1"), ["x must be less than 1"]);
  assert.deepEqual(check({ type: "number", multipleOf: 0.1 }, 0.3), []);
  assert.deepEqual(check({ type: "number", multipleOf: 0.5 }, 0.3), ["x must be a multiple of 0.5"]);
  assert.deepEqual(check({ type: "array", minItems: 2 }, "a"), ["x must have at least 2 items"]);
  assert.deepEqual(check({ type: "array", maxItems: 1 }, ["a", "b"]), ["x must have at most 1 items"]);
  assert.deepEqual(check({ type: "array", uniqueItems: true }, "a,a"), ["x must not repeat items"]);
  assert.deepEqual(check({ type: ["string", "null"], maxLength: 1 }, "ab"), ["x must be at most 1 characters"]);
  assert.deepEqual(check({ type: ["string", "null"] }, null), []);
});

test("strict checks convert nothing", () => {
  const schema = { type: "object", properties: { n: { type: "integer" }, on: { type: "boolean" } } };
  assert.deepEqual(checkInput(schema, { n: "3", on: "yes" }, undefined, { strict: true }).errors, ["n must be a whole number", "on must be true or false"]);
  assert.deepEqual(checkInput(schema, { n: 3, on: true }, undefined, { strict: true }).errors, []);
});

test("register warns about input keywords it does not check, and refuses a bad pattern", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const r = createRegistry();
  r.register(def({ name: "a", positional: [], input: { type: "object", properties: { x: { oneOf: [] }, y: { type: "object", properties: {} } } } }));
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /a: these input keywords are not checked: x\.oneOf, y\.properties/);
  r.register(def({ name: "b", positional: [], input: { type: "object", properties: { x: { type: "string", maxLength: 3 } } } }));
  assert.equal(warn.mock.callCount(), 1);
  assert.throws(() => r.register(def({ name: "c", positional: [], input: { type: "object", properties: { x: { pattern: "(" } } } })), /x\.pattern is not a valid regular expression/);
});

test("run may return a string as its text; other non-objects fail", async () => {
  const r = createRegistry();
  r.register(def({ name: "say", run: () => "Saved." }));
  r.register(def({ name: "nothing", run: () => {} }));
  r.register(def({ name: "number", run: () => 42 }));
  assert.deepEqual(await r.run("say", { sku: "a" }), { code: 0, text: "Saved." });
  assert.deepEqual(await r.run("nothing", { sku: "a" }), { code: 0 });
  assert.deepEqual(await r.run("number", { sku: "a" }), { code: EXIT.FAILED, message: "number: run returned a number; return { text?, data? } or a string" });
});
