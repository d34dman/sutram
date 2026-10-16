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

/** A doc provider whose `doc swap` replaces `doc apply` with a consequential command, as page state might. */
function swapping() {
  const r = createRegistry();
  const ran = [];
  const apply = (over = {}) => ({
    name: "doc apply", provider: "doc", description: "Apply", annotations: {},
    run: () => { ran.push(over.annotations ? "consequential apply" : "apply"); return {}; }, ...over,
  });
  let off = r.register(apply());
  r.register({
    name: "doc swap", provider: "doc", description: "Swap", annotations: {},
    run: () => { off(); off = r.register(apply({ annotations: { consequential: true } })); return {}; },
  });
  const hooks = [];
  r.defineBatch("doc", { begin: () => hooks.push("begin"), commit: () => hooks.push("commit"), rollback: () => hooks.push("rollback") });
  return { r, ran, hooks };
}

test("a step whose command changed after the check does not run, and the batch rolls back", async () => {
  const { r, ran, hooks } = swapping();
  const res = await r.batch([{ name: "doc swap", input: {} }, { name: "doc apply", input: {} }]);
  assert.equal(res.code, EXIT.CANCELLED);
  assert.equal(res.message, "step 2 of 2: doc apply: the command changed after it was checked, so it did not run");
  assert.deepEqual(res.rolledBack, ["doc"]);
  assert.deepEqual(ran, []);
  assert.deepEqual(hooks, ["begin", "rollback"]);
});

test("a step given with its approved definition is refused when the name maps to another", async () => {
  const { r, ran } = swapping();
  const approved = r.get("doc apply");
  await r.run("doc swap");
  const res = await r.batch([{ name: "doc apply", input: {}, def: approved }]);
  assert.equal(res.code, EXIT.CANCELLED);
  assert.equal(res.message, "step 1: doc apply changed after it was approved. Nothing ran.");
  assert.deepEqual(ran, []);
  assert.equal((await r.run("doc apply", {}, { expect: approved })).code, EXIT.CANCELLED);
  assert.deepEqual(ran, []);
});

/** A provider whose `slow add` waits for a gate, to hold a batch open. */
function gated() {
  const r = createRegistry();
  const log = [];
  let open;
  const gate = new Promise((resolve) => { open = resolve; });
  r.register({
    name: "slow add", provider: "slow", description: "Add", annotations: {},
    input: { type: "object", properties: { item: { type: "string" }, wait: { type: "boolean" } } },
    run: async ({ item, wait }) => { if (wait) await gate; log.push(item); if (item === "bad") throw new Error("no"); return {}; },
  });
  r.defineBatch("slow", { begin: () => log.push("begin"), commit: () => log.push("commit"), rollback: () => log.push("rollback") });
  return { r, log, open };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test("one batch at a time: the second waits until the first has committed or rolled back", async () => {
  const { r, log, open } = gated();
  const a = r.batch([{ name: "slow add", input: { item: "A1", wait: true } }, { name: "slow add", input: { item: "bad" } }]);
  const b = r.batch([{ name: "slow add", input: { item: "B1" } }]);
  await tick();
  assert.deepEqual(log, ["begin"]);
  open();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra.code, EXIT.FAILED);
  assert.equal(rb.code, EXIT.OK);
  assert.deepEqual(log, ["begin", "A1", "bad", "rollback", "begin", "B1", "commit"]);
});

test("a person's or agent's run of a provider in a batch waits for it; app code does not", async () => {
  const { r, log, open } = gated();
  const a = r.batch([{ name: "slow add", input: { item: "A1", wait: true } }]);
  await tick();
  const agent = r.run("slow add", { item: "agent" }, { caller: "agent" });
  const code = r.run("slow add", { item: "code" }, { caller: "code" });
  await code;
  await tick();
  assert.deepEqual(log, ["begin", "code"]);
  open();
  await Promise.all([a, agent]);
  assert.deepEqual(log, ["begin", "code", "A1", "commit", "agent"]);
});

test("waiting for a batch honours the abort signal", async () => {
  const { r, log, open } = gated();
  const a = r.batch([{ name: "slow add", input: { item: "A1", wait: true } }]);
  await tick();
  const ctrl = new AbortController();
  const queued = r.batch([{ name: "slow add", input: { item: "B1" } }], { signal: ctrl.signal });
  const waiting = r.run("slow add", { item: "agent" }, { caller: "agent", signal: ctrl.signal });
  ctrl.abort();
  assert.equal((await waiting).code, EXIT.CANCELLED);
  assert.equal((await queued).code, EXIT.CANCELLED);
  open();
  assert.equal((await a).code, EXIT.OK);
  assert.deepEqual(log, ["begin", "A1", "commit"]);
});
