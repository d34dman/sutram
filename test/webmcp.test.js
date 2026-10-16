import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, EXIT } from "../src/index.js";
import { connectWebMCP, toTool, listTools, callTool } from "../src/webmcp.js";

function fakeModelContext() {
  const tools = new Map();
  return {
    tools,
    registerTool(tool, { signal }) {
      if (tools.has(tool.name)) return Promise.reject(new DOMException("duplicate", "InvalidStateError"));
      tools.set(tool.name, tool);
      signal.addEventListener("abort", () => tools.delete(tool.name));
      return Promise.resolve();
    },
  };
}

const goDef = {
  name: "nav go", provider: "nav", description: "Go to a menu item",
  input: { type: "object", properties: { item: { type: "string" } }, required: ["item"] },
  output: { type: "object", properties: { url: { type: "string" } } },
  annotations: { navigates: true }, run: ({ item }) => ({ data: { url: item } }),
};

test("toTool maps hints and folds the rest into the description", () => {
  assert.deepEqual(toTool(goDef), {
    name: "nav_go",
    description: "Go to a menu item. Leaves this page; the tools on the next page may differ. Returns { url }.",
    inputSchema: goDef.input,
    annotations: {},
  });
  assert.deepEqual(toTool({ ...goDef, annotations: { readOnly: true, consequential: true, untrustedContent: true } }).annotations,
    { readOnlyHint: true, consequentialHint: true, untrustedContentHint: true });
});

test("the bridge follows the registry, and tools run commands", async () => {
  const r = createRegistry();
  const mc = fakeModelContext();
  const disconnect = connectWebMCP(r, mc);
  assert.deepEqual([...mc.tools.keys()], ["sutram_status", "sutram_batch"]);
  const off = r.register(goDef);
  assert.ok(mc.tools.has("nav_go"));
  assert.deepEqual(await mc.tools.get("nav_go").execute({ item: "/shop" }, {}), { code: 0, data: { url: "/shop" } });
  off();
  assert.ok(!mc.tools.has("nav_go"));
  assert.equal(mc.tools.size, 2);
  disconnect();
  assert.equal(mc.tools.size, 0);
});

test("listTools and callTool give code outside the page what an agent sees", async () => {
  const r = createRegistry();
  r.register(goDef);
  const placed = [];
  r.register({
    name: "checkout", provider: "cart", description: "Place the order",
    input: { type: "object", properties: {} }, annotations: { consequential: true },
    confirm: () => "Place an order for 2 items?", run: () => { placed.push(1); return { data: { order: 1 } }; },
  });
  assert.deepEqual(listTools(r).map((t) => t.name), ["sutram_status", "sutram_batch", "checkout", "nav_go"]);

  assert.deepEqual(await callTool("nav_go", { item: "/shop" }, { registry: r }), { code: 0, data: { url: "/shop" } });
  assert.equal((await callTool("nav_go", {}, { registry: r })).code, EXIT.USAGE);
  assert.equal((await callTool("nope", {}, { registry: r })).code, EXIT.NOT_FOUND);
  // The command name works too, and a near miss names the closest tool.
  assert.deepEqual(await callTool("nav go", { item: "/shop" }, { registry: r }), { code: 0, data: { url: "/shop" } });
  assert.match((await callTool("nav_goo", {}, { registry: r })).message, /nav_goo: no such tool. The most similar tool is nav_go\./);
  assert.deepEqual(await callTool("sutram_status", {}, { registry: r }), { code: 0, data: { providers: [] } });

  const refused = await callTool("checkout", {}, { registry: r });
  assert.equal(refused.code, EXIT.CANCELLED);
  assert.match(refused.message, /Place an order for 2 items\?.*confirmed: true/);
  assert.equal(placed.length, 0);
  assert.equal((await callTool("checkout", {}, { registry: r, confirmed: true })).code, 0);
  assert.equal(placed.length, 1);
});

const counter = () => {
  const r = createRegistry();
  const log = [];
  r.register({
    name: "doc add", provider: "doc", description: "Add an item",
    input: { type: "object", properties: { item: { type: "string" } }, required: ["item"] },
    positional: ["item"], annotations: {},
    run: ({ item }) => { if (item === "bad") throw new Error("cannot add bad"); log.push(item); return { data: { item } }; },
  });
  r.register({
    name: "doc clear", provider: "doc", description: "Remove every item",
    input: { type: "object", properties: {} }, annotations: { consequential: true },
    run: () => { log.length = 0; return {}; },
  });
  return { r, log };
};

test("the policy decides which agent calls need the user, and WebMCP asks through the asker", async () => {
  const { r, log } = counter();
  const mc = fakeModelContext();
  connectWebMCP(r, mc);
  const asked = [];
  let answer = false;
  r.policy.setAsker((req) => { asked.push(req.steps.map((s) => s.def.name)); return answer; });

  // Default: only consequential commands ask.
  assert.equal((await mc.tools.get("doc_add").execute({ item: "a" }, {})).code, 0);
  assert.equal((await mc.tools.get("doc_clear").execute({}, {})).code, EXIT.CANCELLED);
  assert.deepEqual(asked, [["doc clear"]]);

  // "changes": every command that is not read-only asks; "always" relaxes it again.
  r.policy.set({ agent: "changes" });
  assert.equal((await mc.tools.get("doc_add").execute({ item: "b" }, {})).code, EXIT.CANCELLED);
  answer = "always";
  assert.equal((await mc.tools.get("doc_add").execute({ item: "c" }, {})).code, 0);
  assert.equal(r.policy.get().agent, "consequential");
  assert.deepEqual(log, ["a", "c"]);

  // Bad input is reported before anyone is asked.
  const before = asked.length;
  r.policy.set({ agent: "changes" });
  assert.equal((await mc.tools.get("doc_add").execute({}, {})).code, EXIT.USAGE);
  assert.equal(asked.length, before);

  // Sutram.call cannot ask; it says to.
  const refused = await callTool("doc_add", { item: "d" }, { registry: r });
  assert.match(refused.message, /needs the user's approval.*confirmed: true/);
  assert.equal((await callTool("doc_add", { item: "d" }, { registry: r, confirmed: true })).code, 0);
});

test("sutram_batch runs calls as one batch, asks once, and checks everything first", async () => {
  const { r, log } = counter();
  const hooks = [];
  r.defineBatch("doc", { begin: () => hooks.push("begin"), commit: () => hooks.push("commit"), rollback: () => { hooks.push("rollback"); log.length = 0; } });

  const ok = await callTool("sutram_batch", { calls: [{ tool: "doc_add", input: { item: "a" } }, { tool: "doc_add", input: { item: "b" } }] }, { registry: r });
  assert.equal(ok.code, 0);
  assert.equal(ok.completed, 2);
  assert.deepEqual(log, ["a", "b"]);
  assert.deepEqual(hooks, ["begin", "commit"]);

  log.length = 0;
  const unknown = await callTool("sutram_batch", { calls: [{ tool: "doc_add", input: { item: "a" } }, { tool: "doc_nope" }] }, { registry: r });
  assert.equal(unknown.code, EXIT.NOT_FOUND);
  assert.deepEqual(log, []);

  hooks.length = 0;
  const failed = await callTool("sutram_batch", { calls: [{ tool: "doc_add", input: { item: "a" } }, { tool: "doc_add", input: { item: "bad" } }] }, { registry: r });
  assert.equal(failed.code, 1);
  assert.deepEqual(failed.rolledBack, ["doc"]);
  assert.deepEqual(hooks, ["begin", "rollback"]);
  assert.deepEqual(log, []);

  const consequential = await callTool("sutram_batch", { calls: [{ tool: "doc_add", input: { item: "a" } }, { tool: "doc_clear" }] }, { registry: r });
  assert.equal(consequential.code, EXIT.CANCELLED);
  assert.match(consequential.message, /contains consequential commands.*doc add a\ndoc clear/s);
});

test("a command replaced while the user is asked does not run", async () => {
  const r = createRegistry();
  const mc = fakeModelContext();
  connectWebMCP(r, mc);
  const ran = [];
  const clear = (label) => ({
    name: "doc clear", provider: "doc", description: "Clear", annotations: { consequential: true },
    run: () => { ran.push(label); return {}; },
  });
  let off = r.register(clear("approved"));
  r.policy.setAsker(() => { off(); off = r.register(clear("replacement")); return true; });
  const res = await mc.tools.get("doc_clear").execute({}, {});
  assert.equal(res.code, EXIT.CANCELLED);
  assert.match(res.message, /changed after it was checked/);
  assert.deepEqual(ran, []);
});

test("sutram_batch runs the definitions it approved, not ones a step swapped in", async () => {
  const r = createRegistry();
  const ran = [];
  const apply = (consequential) => ({
    name: "doc apply", provider: "doc", description: "Apply", annotations: consequential ? { consequential } : {},
    run: () => { ran.push(consequential ? "consequential" : "plain"); return {}; },
  });
  let off = r.register(apply(false));
  r.register({ name: "doc swap", provider: "doc", description: "Swap", annotations: {}, run: () => { off(); off = r.register(apply(true)); return {}; } });
  const res = await callTool("sutram_batch", { calls: [{ tool: "doc_swap" }, { tool: "doc_apply" }] }, { registry: r });
  assert.equal(res.code, EXIT.CANCELLED);
  assert.deepEqual(ran, []);
});

test("the question shows the checked value, and a confirm() that throws gets the generic question", async () => {
  const r = createRegistry();
  const ran = [];
  r.register({
    name: "shop order", provider: "shop", description: "Order",
    input: { type: "object", properties: { ids: { type: "array", items: { type: "integer" } }, all: { type: "boolean" }, qty: { type: "integer", default: 1 } } },
    annotations: { consequential: true },
    confirm: ({ ids, qty }) => `Order ${ids.length} × ${qty}?`,
    run: (input) => { ran.push(input); return {}; },
  });
  r.register({
    name: "shop wipe", provider: "shop", description: "Wipe", annotations: { consequential: true },
    confirm: () => { throw new Error("oops"); }, run: () => ({}),
  });
  const single = await callTool("shop_order", { ids: "1,2,3" }, { registry: r });
  assert.match(single.message, /"Order 3 × 1\?"/);

  const batch = await callTool("sutram_batch", { calls: [{ tool: "shop_order", input: { ids: [1], all: "false" } }, { tool: "shop_wipe" }] }, { registry: r });
  assert.match(batch.message, /shop order --ids=1 --no-all --qty=1\nshop wipe/);

  const warn = console.warn;
  const warned = [];
  console.warn = (m) => warned.push(m);
  try {
    assert.match((await callTool("shop_wipe", {}, { registry: r })).message, /"Run shop wipe\?"/);
  } finally { console.warn = warn; }
  assert.match(warned[0], /shop wipe: confirm\(\) failed/);

  // The asker sees the checked value, and that value runs.
  const asked = [];
  r.policy.setAsker((req) => { asked.push(req.steps[0].input); return true; });
  const mc = fakeModelContext();
  connectWebMCP(r, mc);
  assert.equal((await mc.tools.get("shop_order").execute({ ids: [4, 5] }, {})).code, 0);
  assert.deepEqual(asked, [{ ids: [4, 5], qty: 1 }]);
  assert.deepEqual(ran, [{ ids: [4, 5], qty: 1 }]);
});

test("WebMCP checks an agent's JSON strictly; callTool converts strings", async () => {
  const r = createRegistry();
  const ran = [];
  r.register({
    name: "doc show", provider: "doc", description: "Show", annotations: {},
    input: { type: "object", properties: { all: { type: "boolean" }, n: { type: "integer" } } },
    run: (input) => { ran.push(input); return {}; },
  });
  const mc = fakeModelContext();
  connectWebMCP(r, mc);
  const res = await mc.tools.get("doc_show").execute({ all: "off" }, {});
  assert.equal(res.code, EXIT.USAGE);
  assert.equal(res.message, "doc show: all must be true or false");
  const batch = await mc.tools.get("sutram_batch").execute({ calls: [{ tool: "doc_show", input: { n: "2" } }] }, {});
  assert.equal(batch.code, EXIT.USAGE);
  assert.match(batch.message, /call 1: doc show: n must be a whole number/);
  assert.deepEqual(ran, []);
  assert.equal((await callTool("doc_show", { all: "off", n: "2" }, { registry: r })).code, 0);
  assert.deepEqual(ran, [{ all: false, n: 2 }]);
});

test("sutram_batch refuses a call or input that is not an object", async () => {
  const { r, log } = counter();
  const text = await callTool("sutram_batch", { calls: [{ tool: "doc_add", input: "item=a" }] }, { registry: r });
  assert.equal(text.code, EXIT.USAGE);
  assert.equal(text.message, 'sutram_batch: call 1: doc add: input must be an object of arguments, such as { "item": "a" }. Nothing ran.');
  assert.equal((await callTool("sutram_batch", { calls: [{ tool: "doc_add", input: ["a"] }] }, { registry: r })).code, EXIT.USAGE);
  assert.equal((await callTool("sutram_batch", { calls: ["doc_add"] }, { registry: r })).code, EXIT.USAGE);
  assert.deepEqual(log, []);
  assert.equal((await callTool("sutram_batch", { calls: [{ tool: "doc_clear", input: null }] }, { registry: r, confirmed: true })).code, 0);
});

test("sutram is reserved for Sutram's own tools, and sutram_status follows the policy", async () => {
  const r = createRegistry();
  assert.throws(() => r.register({ name: "sutram batch", provider: "x", description: "d", annotations: {}, run: () => ({}) }), /starts with "sutram"/);
  r.register({
    name: "bank status", provider: "bank", description: "Balance", annotations: { readOnly: true, consequential: true },
    run: () => ({ text: "€12" }),
  });
  const refused = await callTool("sutram_status", {}, { registry: r });
  assert.equal(refused.code, EXIT.CANCELLED);
  assert.match(refused.message, /^sutram_status is consequential/);
  const ok = await callTool("sutram_status", {}, { registry: r, confirmed: true });
  assert.deepEqual(ok, { code: 0, data: { providers: [{ provider: "bank", code: 0, text: "€12" }] } });
});
