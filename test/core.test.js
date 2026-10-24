import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, CommandError, EXIT, ANNOTATIONS } from "../src/index.js";
import { checkInput, checkOutput, runStatus } from "../src/client.js";

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
  assert.throws(() => r.register(def({ name: "a b c d e f g", positional: [] })), /more than 6 words/);
  assert.doesNotThrow(() => r.register(def({ name: "a b c d e f", positional: [] })));
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
  const codeOf = async (err) => { const r2 = createRegistry(); r2.register(def({ run: () => { throw err; } })); return (await r2.run("cart add", { sku: "x" })).code; };
  assert.equal(await codeOf(new CommandError("bad", EXIT.USAGE)), EXIT.USAGE);
  // Only a CommandError sets the code, and never to success.
  assert.equal(await codeOf(new CommandError("bad", 0)), EXIT.FAILED);
  assert.equal(await codeOf(new DOMException("denied", "NotAllowedError")), EXIT.FAILED);
  assert.equal(await codeOf(Object.assign(new Error("x"), { code: 8 })), EXIT.FAILED);
});

test("a thrown DOMException fails a batch and rolls it back", async () => {
  const r = createRegistry();
  const calls = [];
  r.register(def({ run: () => { throw new DOMException("denied", "NotAllowedError"); } }));
  r.defineBatch("cart", { commit: () => calls.push("commit"), rollback: () => calls.push("rollback") });
  const res = await r.batch([{ name: "cart add", input: { sku: "x" } }]);
  assert.equal(res.code, EXIT.FAILED);
  assert.deepEqual(calls, ["rollback"]);
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

test("a command without arguments may leave out input", async () => {
  const r = createRegistry();
  const { input, ...rest } = def({ name: "cart clear", positional: [], run: () => "Cleared." });
  r.register(rest);
  assert.deepEqual(r.get("cart clear").input, { type: "object", properties: {} });
  assert.deepEqual(await r.run("cart clear"), { code: 0, text: "Cleared." });
  assert.equal((await r.run("cart clear", { x: 1 })).code, EXIT.USAGE);
  r.register(Object.freeze(def({ name: "cart frozen", input: undefined, positional: [] })));
  assert.ok(r.get("cart frozen").input);
});

test("getRegistry keeps its own registry next to an older Sutram's, and warns", async () => {
  const { getRegistry } = await import("../src/index.js");
  const key = Symbol.for("sutram.registry@2");
  const old = Symbol.for("sutram.registry@1");
  const saved = globalThis[key];
  delete globalThis[key];
  globalThis[old] = { list: () => [] }; // an 0.3 registry, without policy
  const warn = console.warn;
  const warned = [];
  console.warn = (m) => warned.push(m);
  try {
    const r = getRegistry();
    assert.equal(typeof r.policy.needs, "function");
    assert.equal(getRegistry(), r);
    assert.equal(warned.length, 1);
    assert.match(warned[0], /an older Sutram is on this page/);
  } finally {
    console.warn = warn;
    delete globalThis[old];
    if (saved) globalThis[key] = saved; else delete globalThis[key];
  }
});

test("object and array defaults reach run() as copies", async () => {
  const r = createRegistry();
  const input = { type: "object", properties: { tags: { type: "array", default: ["a"] }, meta: { type: "object", default: { n: 1 } } } };
  r.register(def({ name: "doc tag", positional: [], input, run: ({ tags, meta }) => { tags.push("x"); meta.n++; return { data: { tags, meta } }; } }));
  await r.run("doc tag");
  const res = await r.run("doc tag");
  assert.deepEqual(res.data, { tags: ["a", "x"], meta: { n: 2 } });
  assert.deepEqual(input.properties.tags.default, ["a"]);
  assert.deepEqual(input.properties.meta.default, { n: 1 });
});

test("only own properties count, for input, parsing, output checks, tables, fields and events", async () => {
  const { parse, selectFields } = await import("../src/client.js");
  const { formatTable } = await import("../src/internals.js");
  const { createEvents } = await import("../src/events.js");
  const props = { constructor: { type: "string" }, toString: { type: "string" } };
  assert.deepEqual(checkInput({ type: "object", properties: props }, {}), { errors: [], value: {} });
  const r = createRegistry();
  r.register(def({ name: "doc name", input: { type: "object", properties: props }, positional: ["constructor"] }));
  assert.deepEqual(parse(r, "doc name x").input, { constructor: "x" });
  assert.equal(checkOutput({ type: "object", required: ["toString"] }, {}), "toString is missing");
  assert.equal(checkOutput({ type: "object", properties: { constructor: { type: "string" } } }, {}), null);
  assert.doesNotMatch(JSON.stringify(formatTable([{ toString: "a" }], { type: "object", properties: props })), /function/);
  assert.deepEqual(selectFields([{ toString: "a" }], ["toString", "constructor"], { type: "array", items: { type: "object", properties: props } }).data, [{ toString: "a" }]);
  const ev = createEvents(r);
  ev.define("doc.named", { description: "Named", payload: { type: "object", properties: props } });
  assert.doesNotThrow(() => ev.emit("doc.named", {}));
});

test("checkOutput accepts nullable types and stops at a depth limit on cyclic data", () => {
  const nullable = { type: "object", properties: { note: { type: ["string", "null"], format: "date" } } };
  assert.equal(checkOutput(nullable, { note: null }), null);
  assert.equal(checkOutput(nullable, { note: 3 }), "note: expected string or null, got integer");
  const node = { type: "object", properties: { next: { $ref: "#" } } };
  const a = {};
  a.next = a;
  assert.equal(checkOutput(node, a), null);
});

test("an abort settles run() with 130 even when the handler ignores the signal", async () => {
  const r = createRegistry();
  r.register(def({ run: () => new Promise(() => {}) }));
  const ctrl = new AbortController();
  const pending = r.run("cart add", { sku: "x" }, { signal: ctrl.signal });
  setTimeout(() => ctrl.abort(), 5);
  assert.deepEqual(await pending, { code: EXIT.CANCELLED, message: "cart add: cancelled" });
});

test("a long non-number is refused quickly", () => {
  const prop = { type: "object", properties: { n: { type: "number" } } };
  const started = performance.now();
  assert.deepEqual(checkInput(prop, { n: "1".repeat(40000) + "x" }).errors, ["n must be a number"]);
  assert.ok(performance.now() - started < 200, `took ${Math.round(performance.now() - started)} ms`);
  for (const [text, n] of [["2", 2], ["-1.5", -1.5], [".5", 0.5], ["3.", 3], ["1e3", 1000], ["+2E-1", 0.2]]) {
    assert.equal(checkInput(prop, { n: text }).value.n, n);
  }
  assert.equal(checkInput(prop, { n: "1.2.3" }).errors.length, 1);
});

test("enum, const and uniqueItems compare by value; batch refuses steps that are not objects", async () => {
  const schema = { type: "object", properties: {
    pick: { type: "object", enum: [{ a: 1, b: 2 }] },
    fixed: { type: "array", const: [1, { x: true }] },
    list: { type: "array", uniqueItems: true },
  } };
  assert.deepEqual(checkInput(schema, { pick: { b: 2, a: 1 }, fixed: [1, { x: true }], list: [{ a: 1, b: 2 }, { a: 1 }] }).errors, []);
  assert.deepEqual(checkInput(schema, { list: [{ a: 1, b: 2 }, { b: 2, a: 1 }] }).errors, ["list must not repeat items"]);
  assert.deepEqual(checkInput(schema, { pick: { a: 1 } }).errors.length, 1);
  const r = createRegistry();
  assert.deepEqual(await r.batch([null]), { code: EXIT.USAGE, message: "step 1: each step must be { name, input }. Nothing ran.", results: [], completed: 0, total: 1 });
  assert.equal((await r.batch("cart add")).code, EXIT.USAGE);
});

test("annotations are a contract: unknown keys are refused", () => {
  const r = createRegistry();
  const def = { name: "nav go", provider: "nav", description: "Go", run: () => {} };
  assert.throws(() => r.register({ ...def, annotations: { reinitialises: true } }), /unknown annotation "reinitialises"; known: readOnly, consequential, navigates, reinitializes, untrustedContent/);
  assert.throws(() => r.register({ ...def, annotations: null }), /annotations that are not an object/);
  assert.deepEqual([...ANNOTATIONS], ["readOnly", "consequential", "navigates", "reinitializes", "untrustedContent"]);
});

test("only a command that declares it may start Sutram again", async () => {
  const r = createRegistry();
  r.register({ name: "page reload", provider: "page", description: "Reload", annotations: {}, run: (_, { reinitializes }) => { reinitializes(); } });
  const res = await r.run("page reload");
  assert.equal(res.code, EXIT.FAILED);
  assert.match(res.message, /does not declare the reinitializes or navigates annotation/);
  assert.equal(r.generation, 0);
});

test("ready resolves on initialized(), and is a new promise after reinitialize()", async () => {
  const r = createRegistry();
  const state = (p) => Promise.race([p.then(() => "ready"), new Promise((res) => setTimeout(() => res("pending"), 5))]);
  assert.equal(await state(r.ready), "pending");
  r.initialized();
  assert.equal(await state(r.ready), "ready");
  const heard = [];
  r.onReinitialize((e) => heard.push(e.generation));
  r.reinitialize();
  assert.deepEqual(heard, [1]);
  assert.equal(await state(r.ready), "pending", "on a page being left, ready never comes");
  r.initialized();
  assert.equal(await state(r.ready), "ready");
});

test("register checks a title, and warns about parameter names that are not snake_case", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const r = createRegistry();
  r.register(def({ name: "a", title: "Add to the cart" }));
  assert.equal(r.get("a").title, "Add to the cart");
  for (const title of ["", "  ", "two\nlines", 3]) {
    assert.throws(() => r.register(def({ name: "b", title })), /has a title that is not one line of text/);
  }
  r.register(def({ name: "c", positional: [], input: { type: "object", properties: { per_page: { type: "integer" }, page: { type: "integer" } } } }));
  assert.equal(warn.mock.callCount(), 0);
  r.register(def({ name: "d", positional: [], input: { type: "object", properties: { perPage: { type: "integer" }, "per-page": { type: "integer" }, q: { type: "string" } } } }));
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /d: name parameters with lowercase words joined by _, such as per_page: perPage, per-page$/);
});
