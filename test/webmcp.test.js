import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry } from "../src/index.js";
import { connectWebMCP, toTool } from "../src/webmcp.js";

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
