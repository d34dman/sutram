import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, EXIT } from "../src/index.js";
import { complete } from "../src/client.js";
import { lists } from "../src/lists.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const CONTENT = {
  label: "Content",
  columns: [{ key: "title", label: "Title" }, { key: "type", label: "Content type" }, { key: "status", label: "Status" }],
  rows: [
    { title: "Hello", type: "Article", status: "Published", url: "/node/5", extra: "dropped" },
    { title: "About", type: "Basic page", status: null },
  ],
  page: 2,
  pages: 3,
  total: 6,
  sort: "changed",
  order: "desc",
  sorts: [{ key: "title", label: "Title" }, "changed"],
  filters: [
    { key: "type", label: "Content type", value: "", options: [{ value: "article", label: "Article" }, { value: "page", label: "Basic page" }] },
    { key: "title", label: "Title", value: "hel" },
  ],
};

function setup(over = {}, all = { content: CONTENT }) {
  const r = createRegistry();
  r.initialized();
  const calls = [];
  const off = lists({ lists: () => all, go: (list, state) => calls.push([list, state]), reloads: true, ...over }, { registry: r });
  return { r, calls, off };
}

test("registers list status, list rows and list go with titles; reloads picks the annotation", () => {
  const { r, off } = setup();
  for (const name of ["list status", "list rows", "list go"]) assert.ok(r.get(name).title, name);
  assert.deepEqual(r.get("list go").annotations, { navigates: true });
  assert.deepEqual(setup({ reloads: false }).r.get("list go").annotations, { reinitializes: true });
  off();
  assert.equal(r.get("list rows"), undefined);
});

test("list status: rows, page, sort, and the sorts and filters there are", async () => {
  const { r } = setup();
  const res = await r.run("list status");
  assert.equal(res.text, "Content (content): 2 rows of 6, page 2 of 3, sorted by changed desc, filtered by title=hel. See list rows.");
  assert.deepEqual(res.data.lists[0], {
    list: "content", label: "Content", rows: 2, total: 6, page: 2, pages: 3, sort: "changed", order: "desc",
    sorts: ["title", "changed"],
    filters: [
      { key: "type", label: "Content type", value: "", options: ["article", "page"] },
      { key: "title", label: "Title", value: "hel" },
    ],
  });
  const none = await setup({}, {}).r.run("list status");
  assert.equal(none.text, "This page has no lists.");
});

test("list rows: the columns in order, url when there is one, the only list by default", async () => {
  const { r } = setup();
  const res = await r.run("list rows");
  assert.equal(res.text, "Content: 2 rows of 6, page 2 of 3. Next: list go content --page=3.");
  assert.deepEqual(res.data, {
    list: "content", page: 2, pages: 3, total: 6, columns: ["title", "type", "status"],
    rows: [
      { title: "Hello", type: "Article", status: "Published", url: "/node/5" },
      { title: "About", type: "Basic page", status: "" },
    ],
  });
  assert.deepEqual((await r.run("list rows", { list: "Content" })).data.list, "content");
});

test("several lists: the command must say which", async () => {
  const { r } = setup({}, { content: CONTENT, people: { columns: [{ key: "name" }], rows: [] } });
  const res = await r.run("list rows");
  assert.equal(res.code, EXIT.USAGE);
  assert.equal(res.message, "list rows: this page has 2 lists; say which: content, people.");
  assert.equal((await r.run("list rows", { list: "people" })).text, "people shows no rows.");
  assert.equal((await r.run("list rows", { list: "nope" })).message, 'list rows: no list "nope". Lists: content, people.');
});

test("list go: one complete state for the adapter, after answering; a new sort or filter starts at page 1", async () => {
  const { r, calls } = setup();
  const res = await r.run("list go", { list: "content", page: 3 });
  assert.equal(res.text, "Showing Content, page 3, sorted by changed desc, filtered by title=hel. Then run list rows.");
  r.initialized();
  await r.run("list go", { filter: ["type=article", "title="], sort: "title" });
  r.initialized();
  await r.run("list go", { order: "asc" });
  assert.deepEqual(calls, []);
  await tick();
  assert.deepEqual(calls, [
    ["content", { page: 3, sort: "changed", order: "desc", filters: { type: "", title: "hel" } }],
    ["content", { page: 1, sort: "title", order: "asc", filters: { type: "article", title: "" } }],
    ["content", { page: 1, sort: "changed", order: "asc", filters: { type: "", title: "hel" } }],
  ]);
});

test("list go refuses what the list does not offer, and goes nowhere", async () => {
  const { r, calls } = setup();
  const msg = async (input) => (await r.run("list go", input)).message;
  assert.equal(await msg({}), "list go: say what to change: --page, --sort, --order or --filter.");
  assert.equal(await msg({ page: 4 }), "list go: content has 3 pages.");
  assert.equal(await msg({ sort: "author" }), 'list go: content cannot be sorted by "author". Sorts: title, changed.');
  assert.equal(await msg({ filter: ["type=blog"] }), 'list go: filter type takes article, page, not "blog".');
  assert.equal(await msg({ filter: ["lang=en"] }), 'list go: content has no filter "lang". Filters: type, title.');
  assert.equal(await msg({ filter: ["type"] }), 'list go: write the filter as key=value: "type". Filters: type, title.');
  assert.equal(r.generation, 0);
  await tick();
  assert.deepEqual(calls, []);
});

test("bad lists from the adapter fail the command", async () => {
  assert.equal((await setup({}, null).r.run("list status")).message, "list: the app's adapter returned no lists object");
  const res = await setup({}, { x: { rows: [] } }).r.run("list status");
  assert.equal(res.message, 'list: the app\'s adapter describes list "x" without columns: [{ key, label }]');
});

test("completion: lists, sorts, filter keys and filter values", async () => {
  const { r } = setup();
  const values = async (line) => (await complete(r, line)).items.map((i) => i.value);
  assert.deepEqual(await values("list rows c"), ["content "]);
  assert.deepEqual(await values("list go content --sort=t"), ["--sort=title "]);
  // key= waits for its value: no space after it.
  assert.deepEqual(await values("list go content --filter=ty"), ["--filter=type="]);
  assert.deepEqual(await values("list go content --filter=type=a"), ["--filter=type=article "]);
  assert.deepEqual(await values("list go content --filter=title=x,type=p"), ["--filter=title=x,type=page "]);
});

test("lists refuses an incomplete adapter", () => {
  const r = createRegistry();
  assert.throws(() => lists({ lists: () => ({}), reloads: true }, { registry: r }), /needs a go\(list, state\) function/);
  assert.throws(() => lists({ lists: () => ({}), go() {} }, { registry: r }), /reloads: true or false/);
});
