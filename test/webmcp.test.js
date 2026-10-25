import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, EXIT } from "../src/index.js";
import { connectWebMCP, toTool, listTools, callTool, execLines, REINITIALIZED_NOTE } from "../src/webmcp.js";

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

/** The question WebMCP asks with the browser's confirm() when the page has no asker; the answer is no. */
async function confirmQuestion(r, tool, input = {}) {
  const mc = fakeModelContext();
  const disconnect = connectWebMCP(r, mc);
  const asked = [];
  const confirm = globalThis.confirm;
  globalThis.confirm = (text) => { asked.push(text); return false; };
  try {
    assert.equal((await mc.tools.get(tool).execute(input, {})).code, EXIT.CANCELLED);
  } finally { globalThis.confirm = confirm; disconnect(); }
  assert.equal(asked.length, 1);
  return asked[0].replace(/^An agent on this page wants to act\.\n\n/, "");
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
  assert.equal(refused.message, "checkout is consequential, and this page has no way to ask the user, so it did not run.");
  assert.equal(placed.length, 0);
  const questions = [];
  r.policy.setAsker(({ steps }) => { questions.push(steps.map((s) => s.def.name)); return true; });
  assert.equal((await callTool("checkout", {}, { registry: r })).code, 0);
  assert.deepEqual(questions, [["checkout"]]);
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

  // "changes": every command that is not read-only asks, every time.
  r.policy.set({ agent: "changes" });
  assert.equal((await mc.tools.get("doc_add").execute({ item: "b" }, {})).code, EXIT.CANCELLED);
  answer = true;
  assert.equal((await mc.tools.get("doc_add").execute({ item: "c" }, {})).code, 0);
  answer = false;
  assert.equal((await mc.tools.get("doc_add").execute({ item: "d" }, {})).code, EXIT.CANCELLED);
  assert.equal(r.policy.get().agent, "changes");
  assert.deepEqual(log, ["a", "c"]);

  // Bad input is reported before anyone is asked.
  const before = asked.length;
  r.policy.set({ agent: "changes" });
  assert.equal((await mc.tools.get("doc_add").execute({}, {})).code, EXIT.USAGE);
  assert.equal(asked.length, before);

  // Sutram.call and Sutram.exec ask through the asker too: the person
  // answers, not the agent, and an old confirmed: true changes nothing.
  const n = asked.length;
  assert.equal((await callTool("doc_add", { item: "d" }, { registry: r, confirmed: true })).code, EXIT.CANCELLED);
  assert.equal((await execLines("doc add d", { registry: r, confirmed: true })).code, EXIT.CANCELLED);
  assert.equal(asked.length, n + 2);
  answer = true;
  assert.equal((await callTool("doc_add", { item: "e" }, { registry: r })).code, 0);
  assert.deepEqual(log, ["a", "c", "e"]);
});

test("without an asker, Sutram.call runs nothing that needs the user, and the caller cannot say yes", async () => {
  const { r, log } = counter();
  r.policy.set({ agent: "changes" });
  for (const options of [{}, { confirmed: true }, { caller: "code" }]) {
    const refused = await callTool("doc_add", { item: "d" }, { registry: r, ...options });
    assert.equal(refused.code, EXIT.CANCELLED);
    assert.equal(refused.message, "doc_add needs the user's approval on this page, and this page has no way to ask the user, so it did not run.");
  }
  assert.deepEqual(log, []);
});

test("Sutram.call and Sutram.exec always run as the agent", async () => {
  const { r } = counter();
  const callers = [];
  r.onResult(({ caller }) => callers.push(caller));
  await callTool("doc_add", { item: "a" }, { registry: r, caller: "code" });
  await execLines("doc add b", { registry: r, caller: "console" });
  assert.deepEqual(callers, ["agent", "agent"]);
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
  assert.match(consequential.message, /^sutram_batch contains consequential commands, and this page has no way to ask the user/);
  assert.match(await confirmQuestion(r, "sutram_batch", { calls: [{ tool: "doc_add", input: { item: "a" } }, { tool: "doc_clear" }] }), /doc clear cannot easily be undone\.\ndoc add a\ndoc clear$/);
});

test("a batch question names its consequential commands and keeps each command to one line", async () => {
  const { r, log } = counter();
  const calls = [{ tool: "doc_clear" }, { tool: "doc_add", input: { item: "x" + "\n".repeat(80) + "y" } }];

  // Without an asker, WebMCP falls back to the browser's confirm(), and the question is short.
  const question = await confirmQuestion(r, "sutram_batch", { calls });
  assert.equal(question, 'Run these 2 commands? doc clear cannot easily be undone.\ndoc clear\ndoc add "x…" (81 lines)');

  const mc = fakeModelContext();
  connectWebMCP(r, mc);
  const asked = [];
  const confirm = globalThis.confirm;
  globalThis.confirm = (text) => { asked.push(text); return true; };
  try {
    assert.equal((await mc.tools.get("sutram_batch").execute({ calls }, {})).code, 0);
  } finally { globalThis.confirm = confirm; }
  assert.equal(asked.length, 1);
  assert.match(asked[0], /doc clear cannot easily be undone/);
  assert.ok(!asked[0].includes("\n\n\n"));
  // What runs is the full value.
  assert.deepEqual(log, ["x" + "\n".repeat(80) + "y"]);
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
  assert.equal(await confirmQuestion(r, "shop_order", { ids: [1, 2, 3] }), "Order 3 × 1?");
  assert.match(await confirmQuestion(r, "sutram_batch", { calls: [{ tool: "shop_order", input: { ids: [1], all: false } }, { tool: "shop_wipe" }] }), /shop order --ids=1 --no-all --qty=1\nshop wipe\nshop order: Order 1 × 1\?$/);

  const warn = console.warn;
  const warned = [];
  console.warn = (m) => warned.push(m);
  try {
    assert.equal(await confirmQuestion(r, "shop_wipe"), "Run shop wipe?");
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
  assert.equal((await callTool("sutram_batch", { calls: [{ tool: "doc_clear", input: null }] }, { registry: r })).code, EXIT.CANCELLED);
  r.policy.setAsker(() => true);
  assert.equal((await callTool("sutram_batch", { calls: [{ tool: "doc_clear", input: null }] }, { registry: r })).code, 0);
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
  r.policy.setAsker(() => true);
  const ok = await callTool("sutram_status", {}, { registry: r });
  assert.deepEqual(ok, { code: 0, data: { providers: [{ provider: "bank", code: 0, text: "€12" }] } });
});

test("connectWebMCP survives a tool the browser refuses, and refreshes a tool changed in place", async () => {
  const r = createRegistry();
  const mc = fakeModelContext();
  const register = mc.registerTool.bind(mc);
  mc.registerTool = (tool, opts) => { if (tool.name === "bad_go") throw new TypeError("bad schema"); return register(tool, opts); };
  const def = (name) => ({ name, provider: name.split(" ")[0], description: "Go", annotations: {}, run: () => ({}) });
  r.register(def("bad go"));
  const good = def("good go");
  r.register(good);
  const warn = console.warn;
  const warned = [];
  console.warn = (m) => warned.push(m);
  try { connectWebMCP(r, mc); } finally { console.warn = warn; }
  assert.ok(mc.tools.has("good_go"));
  assert.ok(!mc.tools.has("bad_go"));
  assert.match(warned[0], /WebMCP refused bad_go: bad schema/);

  good.annotations.readOnly = true;
  assert.equal((await mc.tools.get("good_go").execute({}, {})).code, 0);
  assert.deepEqual(mc.tools.get("good_go").annotations, { readOnlyHint: true });
  good.annotations.consequential = true;
  r.register(good); // registering the same definition again refreshes it too
  assert.deepEqual(mc.tools.get("good_go").annotations, { readOnlyHint: true, consequentialHint: true });
});

test("an aborted WebMCP call withdraws its question", async () => {
  const { r, log } = counter();
  const mc = fakeModelContext();
  connectWebMCP(r, mc);
  let seen = null;
  r.policy.setAsker((req) => { seen = req.signal; return new Promise(() => {}); }); // the user never answers
  const ctrl = new AbortController();
  const pending = mc.tools.get("doc_clear").execute({}, { signal: ctrl.signal });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(seen && !seen.aborted);
  ctrl.abort();
  assert.equal((await pending).code, EXIT.CANCELLED);
  assert.ok(seen.aborted);
  assert.deepEqual(log, []);
});

test("a run that starts Sutram again tells the agent to wait, and later calls are refused until it is ready", async () => {
  const r = createRegistry();
  r.register({
    ...goDef,
    run: ({ item }, { reinitializes }) => {
      if (item === "/gone") return { code: EXIT.FAILED, message: "no such page" };
      reinitializes();
      return { text: `Going to ${item}.`, data: { url: item } };
    },
  });
  r.register({ name: "nav status", provider: "nav", description: "Where", annotations: { readOnly: true }, run: () => "Home" });
  const failed = await callTool("nav_go", { item: "/gone" }, { registry: r });
  assert.equal(failed.message, "no such page", "no note when Sutram did not start again");
  const ok = await callTool("nav_go", { item: "/shop" }, { registry: r });
  assert.equal(ok.text, `Going to /shop. ${REINITIALIZED_NOTE}`);
  assert.match(REINITIALIZED_NOTE, /await Sutram\.ready/);
  const early = await callTool("nav_status", {}, { registry: r });
  assert.equal(early.code, EXIT.CANCELLED);
  assert.match(early.message, /Sutram is starting again/);
  r.initialized();
  assert.equal((await callTool("nav_status", {}, { registry: r })).text, "Home");
});

test("sutram_batch takes a command that may start Sutram again only as its last call", async () => {
  const r = createRegistry();
  r.register({ ...goDef, run: ({ item }, { reinitializes }) => { reinitializes(); return { data: { url: item } }; } });
  r.register({ name: "nav status", provider: "nav", description: "Where", annotations: { readOnly: true }, run: () => "Home" });
  const go = { tool: "nav_go", input: { item: "/shop" } };
  const first = await callTool("sutram_batch", { calls: [go, { tool: "nav_status" }] }, { registry: r });
  assert.equal(first.code, EXIT.USAGE);
  assert.match(first.message, /step 1: nav go may start Sutram again, so it must be the last step\. Nothing ran\./);
  const last = await callTool("sutram_batch", { calls: [{ tool: "nav_status" }, go] }, { registry: r });
  assert.equal(last.code, EXIT.OK);
  assert.equal(last.note, REINITIALIZED_NOTE);
});

test("a title becomes the tool's title and the generic question", async () => {
  assert.equal(toTool(goDef).title, undefined);
  assert.equal(toTool({ ...goDef, title: "Go to a page" }).title, "Go to a page");
  assert.ok(listTools(createRegistry()).every((tool) => tool.title));
  const r = createRegistry();
  r.register({ name: "form save", title: "Save a form.", provider: "form", description: "Save", annotations: { consequential: true }, run: () => ({}) });
  assert.equal(await confirmQuestion(r, "form_save"), "Save a form? (form save)");
});

test("sutram_batch returns its calls' results as they are, so agents get untrustedContentHint", () => {
  const batch = listTools(createRegistry()).find((t) => t.name === "sutram_batch");
  assert.deepEqual(batch.annotations, { untrustedContentHint: true });
});

test("sutram_status and events recent carry the page's own text, so agents get untrustedContentHint", async () => {
  const { createEvents } = await import("../src/events.js");
  const r = createRegistry();
  createEvents(r);
  const tools = Object.fromEntries(listTools(r).map((t) => [t.name, t]));
  assert.deepEqual(tools.sutram_status.annotations, { readOnlyHint: true, untrustedContentHint: true });
  assert.deepEqual(tools.events_recent.annotations, { readOnlyHint: true, untrustedContentHint: true });
});

test("sutram_status takes only the providers an agent names", async () => {
  const r = createRegistry();
  for (const provider of ["form", "page"]) {
    r.register({
      name: `${provider} status`, provider, description: `The ${provider}`,
      input: { type: "object", properties: {} }, annotations: { readOnly: true },
      run: () => ({ text: `${provider} ok`, data: { provider } }),
    });
  }
  const all = await callTool("sutram_status", {}, { registry: r });
  assert.deepEqual(all.data.providers.map((p) => p.provider), ["form", "page"]);
  const one = await callTool("sutram_status", { providers: ["page"] }, { registry: r });
  assert.deepEqual(one.data.providers, [{ provider: "page", code: 0, text: "page ok", data: { provider: "page" } }]);

  const unknown = await callTool("sutram_status", { providers: ["page", "messages"] }, { registry: r });
  assert.equal(unknown.code, EXIT.USAGE);
  assert.equal(unknown.message, "sutram_status: messages reports no status on this page; these do: form, page.");
  assert.equal((await callTool("sutram_status", { providers: "page" }, { registry: r })).code, EXIT.USAGE);

  // The WebMCP tool passes its input on.
  const mc = fakeModelContext();
  connectWebMCP(r, mc);
  assert.deepEqual((await mc.tools.get("sutram_status").execute({ providers: ["form"] }, {})).data.providers.map((p) => p.provider), ["form"]);
});

test("sutram_batch with quiet returns a count, and only the result of the call that failed", async () => {
  const { r, log } = counter();
  const ok = await callTool("sutram_batch", { quiet: true, calls: [{ tool: "doc_add", input: { item: "a" } }, { tool: "doc_add", input: { item: "b" } }] }, { registry: r });
  assert.deepEqual(ok, { code: 0, completed: 2, total: 2 });
  assert.deepEqual(log, ["a", "b"]);

  const failed = await callTool("sutram_batch", { quiet: true, calls: [{ tool: "doc_add", input: { item: "c" } }, { tool: "doc_add", input: { item: "bad" } }, { tool: "doc_add", input: { item: "d" } }] }, { registry: r });
  assert.equal(failed.code, 1);
  assert.equal(failed.completed, 1);
  assert.equal(failed.results, undefined);
  assert.deepEqual(failed.failed, { code: 1, message: "cannot add bad" });
  assert.match(failed.message, /step 2 of 3: cannot add bad/);
});
