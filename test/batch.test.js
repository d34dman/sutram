import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, createPolicy, EXIT } from "../src/index.js";

function setup() {
  const r = createRegistry();
  const items = [];
  const notes = [];
  r.register({
    name: "list add", provider: "list", description: "Add",
    input: { type: "object", properties: { item: { type: "string" } }, required: ["item"] },
    annotations: {}, run: ({ item }) => { if (item === "bad") throw new Error("no"); items.push(item); return {}; },
  });
  r.register({
    name: "list count", provider: "list", description: "Count",
    input: { type: "object", properties: {} }, annotations: { readOnly: true }, run: () => ({ data: { n: items.length } }),
  });
  r.register({
    name: "note add", provider: "note", description: "Add a note, with no batch hooks",
    input: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    annotations: {}, run: ({ text }) => { notes.push(text); return {}; },
  });
  let saved = [];
  const off = r.defineBatch("list", {
    begin: () => { saved = [...items]; },
    commit: () => {},
    rollback: () => { items.splice(0, items.length, ...saved); },
  });
  return { r, items, notes, off };
}

test("batch checks every step before running any", async () => {
  const { r, items } = setup();
  const res = await r.batch([{ name: "list add", input: { item: "a" } }, { name: "list add", input: {} }]);
  assert.equal(res.code, EXIT.USAGE);
  assert.match(res.message, /^step 2: list add: item is required\. Nothing ran\.$/);
  assert.deepEqual(items, []);
  assert.equal((await r.batch([{ name: "list nope", input: {} }])).code, EXIT.NOT_FOUND);
});

test("a failing step rolls back providers with hooks and reports what stays", async () => {
  const { r, items, notes } = setup();
  const res = await r.batch([
    { name: "list add", input: { item: "a" } },
    { name: "note add", input: { text: "hi" } },
    { name: "list count", input: {} },
    { name: "list add", input: { item: "bad" } },
  ]);
  assert.equal(res.code, 1);
  assert.equal(res.completed, 3);
  assert.equal(res.message, "step 4 of 4: no");
  assert.deepEqual(res.rolledBack, ["list"]);
  assert.deepEqual(res.kept, ["note"]);
  assert.deepEqual(items, []);
  assert.deepEqual(notes, ["hi"]);
});

test("begin runs once per provider, and defineBatch refuses a second set of hooks", async () => {
  const r = createRegistry();
  const calls = [];
  r.register({ name: "a go", provider: "a", description: "d", input: { type: "object" }, annotations: {}, run: () => ({}) });
  const off = r.defineBatch("a", { begin: () => calls.push("begin"), commit: () => calls.push("commit") });
  assert.throws(() => r.defineBatch("a", {}), /already has batch hooks/);
  const b = r.startBatch();
  await b.run("a go");
  await b.run("a go");
  assert.deepEqual(await b.commit(), { rolledBack: [], kept: [] });
  assert.deepEqual(calls, ["begin", "commit"]);
  await assert.rejects(() => b.commit(), /already finished/);
  off();
  assert.doesNotThrow(() => r.defineBatch("a", {}));
});

test("a commit that throws fails the batch", async () => {
  const r = createRegistry();
  r.register({ name: "a go", provider: "a", description: "d", input: { type: "object" }, annotations: {}, run: () => ({}) });
  r.defineBatch("a", { commit: () => { throw new Error("disk full"); } });
  const res = await r.batch([{ name: "a go", input: {} }]);
  assert.equal(res.code, 1);
  assert.match(res.message, /disk full/);
});

test("the policy: levels, needs, relax and the asker", async () => {
  const p = createPolicy();
  const plain = { annotations: {} };
  const reader = { annotations: { readOnly: true } };
  const big = { annotations: { consequential: true } };
  assert.equal(p.needs(plain, "agent"), false);
  assert.equal(p.needs(big, "agent"), true);
  p.set({ agent: "changes" });
  assert.equal(p.needs(plain, "agent"), true);
  assert.equal(p.needs(reader, "agent"), false);
  assert.equal(p.needs(plain, "person"), false);
  p.set({ person: "none" });
  assert.equal(p.needs(big, "person"), false);
  assert.equal(p.needs(big, undefined), false);
  assert.throws(() => p.set({ agent: "sometimes" }), /unknown level/);
  assert.throws(() => p.set({ robot: "none" }), /unknown caller kind/);

  assert.equal(await p.ask({ who: "agent", steps: [{ def: plain }] }), false); // no asker
  const off = p.setAsker(() => "always");
  // "always" never covers a consequential command.
  assert.equal(await p.ask({ who: "agent", steps: [{ def: big }] }), true);
  assert.equal(p.get().agent, "changes");
  assert.equal(await p.ask({ who: "agent", steps: [{ def: plain }] }), true);
  assert.equal(p.get().agent, "consequential");
  off();
  assert.equal(p.hasAsker(), false);
});
