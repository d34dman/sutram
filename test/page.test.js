import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry } from "../src/index.js";
import { page } from "../src/page.js";

test("page status: title, route, path and the entity, asked of the adapter each run", async () => {
  const r = createRegistry();
  let p = { title: "Hello", route: "entity.node.canonical", entity: { type: "node", id: 5, bundle: "article", label: "Hello" } };
  const off = page({ page: () => p, here: () => "/node/5" }, { registry: r });
  assert.equal(r.get("page status").provider, "page");
  assert.equal(r.get("page status").title, "Show page status");
  assert.deepEqual(r.get("page status").annotations, { readOnly: true, untrustedContent: true }, "the title and label are the site's text");
  const res = await r.run("page status");
  assert.equal(res.text, '"Hello", route entity.node.canonical. It shows node 5 (article): "Hello".');
  assert.deepEqual(res.data, {
    title: "Hello", path: "/node/5", route: "entity.node.canonical",
    entity: { type: "node", id: "5", bundle: "article", label: "Hello" },
  });
  p = { title: "Docs" };
  const bare = await r.run("page status");
  assert.equal(bare.text, '"Docs".');
  assert.deepEqual(bare.data, { title: "Docs", path: "/node/5" });
  off();
  assert.equal(r.get("page status"), undefined);
});

test("page status: an async adapter, and an entity with only type and id", async () => {
  const r = createRegistry();
  page({ page: async () => ({ title: "User", entity: { type: "user", id: "1" } }), here: () => "/user/1" }, { registry: r });
  const res = await r.run("page status");
  assert.equal(res.text, '"User". It shows user 1.');
  assert.deepEqual(res.data.entity, { type: "user", id: "1" });
});

test("page refuses an adapter without page()", () => {
  const r = createRegistry();
  assert.throws(() => page({}, { registry: r }), /page: the adapter needs a page\(\) function/);
  assert.throws(() => page({ page: () => ({}), here: "/" }, { registry: r }), /here must be a function/);
  assert.equal(r.get("page status"), undefined);
});
