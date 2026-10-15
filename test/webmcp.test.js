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
  assert.deepEqual([...mc.tools.keys()], ["sutram_status"]);
  const off = r.register(goDef);
  assert.ok(mc.tools.has("nav_go"));
  assert.deepEqual(await mc.tools.get("nav_go").execute({ item: "/shop" }, {}), { code: 0, data: { url: "/shop" } });
  off();
  assert.ok(!mc.tools.has("nav_go"));
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
  assert.deepEqual(listTools(r).map((t) => t.name), ["sutram_status", "checkout", "nav_go"]);

  assert.deepEqual(await callTool("nav_go", { item: "/shop" }, { registry: r }), { code: 0, data: { url: "/shop" } });
  assert.equal((await callTool("nav_go", {}, { registry: r })).code, EXIT.USAGE);
  assert.equal((await callTool("nope", {}, { registry: r })).code, EXIT.NOT_FOUND);
  assert.deepEqual(await callTool("sutram_status", {}, { registry: r }), { code: 0, providers: [] });

  const refused = await callTool("checkout", {}, { registry: r });
  assert.equal(refused.code, EXIT.CANCELLED);
  assert.match(refused.message, /Place an order for 2 items\?.*confirmed: true/);
  assert.equal(placed.length, 0);
  assert.equal((await callTool("checkout", {}, { registry: r, confirmed: true })).code, 0);
  assert.equal(placed.length, 1);
});
