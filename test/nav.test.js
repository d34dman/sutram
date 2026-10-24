import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, EXIT } from "../src/index.js";
import { complete } from "../src/client.js";
import { nav } from "../src/nav.js";

const MENUS = {
  admin: {
    label: "Administration",
    items: [
      { id: "system.admin_content", title: "Content", url: "/admin/content", description: "Find and manage content" },
      {
        id: "system.admin_structure", title: "Structure", url: "/admin/structure", description: "Administer blocks, content types and menus",
        children: [
          { id: "entity.node_type.collection", title: "Content types", url: "/admin/structure/types", description: "Create and manage fields, forms and display settings" },
          { id: "entity.menu.collection", title: "Menus", url: "/admin/structure/menu", description: "Manage menus and menu links" },
        ],
      },
    ],
  },
  footer: { label: "Footer", items: [{ title: "About", url: "/about" }, { title: "Contact", url: "/contact" }] },
  main: { label: "Main", items: [{ title: "About", url: "/company/about" }, { title: "Home", url: "/" }] },
};

/** A registry with the nav kit over a fake adapter that records what it was asked. */
function setup(over = {}) {
  const r = createRegistry();
  const calls = { menus: 0, go: [] };
  let menus = MENUS;
  const adapter = {
    menus: () => { calls.menus++; return menus; },
    go: (url) => calls.go.push(url),
    reloads: true,
    here: () => "/admin/structure/types",
    ...over,
  };
  const off = nav(adapter, { registry: r });
  return { r, calls, off, setMenus: (m) => { menus = m; } };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("registers the four commands under the nav provider, with fixed names and titles", () => {
  const { r, off } = setup();
  const names = ["nav status", "nav menu", "nav search", "nav go"];
  for (const name of names) {
    assert.equal(r.get(name).provider, "nav");
    assert.ok(r.get(name).title, name);
  }
  off();
  for (const name of names) assert.equal(r.get(name), undefined);
});

test("refuses an adapter without menus, go or a reloads boolean", () => {
  const r = createRegistry();
  const ok = { menus: () => ({}), go: () => {}, reloads: true };
  assert.throws(() => nav({ ...ok, menus: undefined }, { registry: r }), /menus\(\)/);
  assert.throws(() => nav({ ...ok, go: "x" }, { registry: r }), /go\(url\)/);
  assert.throws(() => nav({ ...ok, reloads: undefined }, { registry: r }), /reloads: true or false/);
  assert.throws(() => nav({ ...ok, here: "/" }, { registry: r }), /here must be a function/);
  assert.equal(r.get("nav go"), undefined);
});

test("leaves nothing registered when a name is already taken", () => {
  const r = createRegistry();
  r.register({ name: "nav go", provider: "mine", description: "Mine", annotations: {}, run: () => ({}) });
  assert.throws(() => nav({ menus: () => ({}), go: () => {}, reloads: true }, { registry: r }), /already belongs to mine/);
  assert.equal(r.get("nav status"), undefined);
  assert.equal(r.get("nav go").provider, "mine");
});

test("reloads picks the annotation of nav go: navigates or reinitializes", () => {
  assert.deepEqual(setup().r.get("nav go").annotations, { navigates: true });
  assert.deepEqual(setup({ reloads: false }).r.get("nav go").annotations, { reinitializes: true });
});

test("asks the adapter for the menus every time a command runs", async () => {
  const { r, calls, setMenus } = setup();
  assert.equal(calls.menus, 0);
  await r.run("nav menu");
  await r.run("nav menu");
  assert.equal(calls.menus, 2);
  setMenus({ extra: { label: "Extra", items: [{ title: "New", url: "/new" }] } });
  assert.deepEqual((await r.run("nav menu")).data, { menus: [{ menu: "extra", label: "Extra", links: 1 }] });
});

test("an async adapter works the same", async () => {
  const r = createRegistry();
  nav({ menus: async () => MENUS, go: () => {}, reloads: true, here: () => "/about" }, { registry: r });
  const res = await r.run("nav status");
  assert.equal(res.data.trail, "About");
  assert.equal(res.data.menu, "footer");
});

test("nav status: the deepest link to this page, with or without the query", async () => {
  const { r } = setup();
  const res = await r.run("nav status");
  assert.equal(res.code, 0);
  assert.deepEqual(res.data, { path: "/admin/structure/types", trail: "Structure › Content types", menu: "admin", menus: ["admin", "footer", "main"] });
  assert.match(res.text, /^On Structure › Content types \(Administration\)\. 8 links in admin, footer, main; see nav menu\.$/);

  const q = setup({ here: () => "/admin/content?type=page" }).r;
  assert.equal((await q.run("nav status")).data.trail, "Content");

  const none = setup({ here: () => "/user/1" }).r;
  const off = await none.run("nav status");
  assert.deepEqual(off.data, { path: "/user/1", trail: "", menu: "", menus: ["admin", "footer", "main"] });
  assert.match(off.text, /^On \/user\/1, which is in none of the menus\./);
});

test("nav menu lists the menus, or shows one to a depth", async () => {
  const { r } = setup();
  const list = await r.run("nav menu");
  assert.deepEqual(list.data.menus, [
    { menu: "admin", label: "Administration", links: 4 },
    { menu: "footer", label: "Footer", links: 2 },
    { menu: "main", label: "Main", links: 2 },
  ]);
  assert.match(list.text, /^3 menus\./);

  const one = (await r.run("nav menu", { menu: "admin", depth: 1 })).data.items;
  assert.deepEqual(one.map((i) => i.title), ["Content", "Structure"]);
  assert.equal(one[1].children, undefined);
  const two = (await r.run("nav menu", { menu: "admin" })).data.items;
  assert.deepEqual(two[1].children.map((i) => i.url), ["/admin/structure/types", "/admin/structure/menu"]);
  // A menu by its label too.
  assert.deepEqual((await r.run("nav menu", { menu: "footer" })).data, (await r.run("nav menu", { menu: "Footer" })).data);
});

test("nav menu names the menus there are when one is unknown", async () => {
  const { r } = setup();
  const res = await r.run("nav menu", { menu: "sidebar" });
  assert.equal(res.code, EXIT.FAILED);
  assert.equal(res.message, 'nav menu: no menu "sidebar". Menus: admin, footer, main.');
});

test("nav search: every word in the title or description", async () => {
  const { r } = setup();
  const res = await r.run("nav search", { query: "content TYPES" });
  assert.deepEqual(res.data.matches.map((m) => m.url), ["/admin/structure", "/admin/structure/types"]);
  assert.deepEqual(res.data.matches[1], {
    trail: "Structure › Content types", url: "/admin/structure/types", menu: "admin",
    title: "Content types", description: "Create and manage fields, forms and display settings",
  });
  const none = await r.run("nav search", { query: "nowhere" });
  assert.equal(none.code, 0);
  assert.deepEqual(none.data.matches, []);
  assert.equal(none.text, 'No menu link matches "nowhere".');
});

test("nav go finds a link by path, id, title or breadcrumb, then goes after answering", async () => {
  const { r, calls } = setup();
  for (const [target, url] of [
    ["/admin/content", "/admin/content"],
    ["entity.menu.collection", "/admin/structure/menu"],
    ["content types", "/admin/structure/types"],
    ["Structure › Menus", "/admin/structure/menu"],
    ["Administration › Structure › Menus", "/admin/structure/menu"],
    ["Footer › About", "/about"],
    ["main › about", "/company/about"],
  ]) {
    const res = await r.run("nav go", { target });
    assert.equal(res.code, 0, target);
    assert.equal(res.data.url, url, target);
    // The new page would say so; here the test does.
    r.initialized();
  }
  // Each run started Sutram again; the adapter's go came later, once per run.
  assert.equal(r.generation, 7);
  assert.deepEqual(calls.go, []);
  await tick();
  assert.equal(calls.go.length, 7);
});

test("nav go takes any path on this site, and refuses other targets clearly", async () => {
  const { r, calls } = setup();
  const res = await r.run("nav go", { target: "/node/5/edit" });
  assert.deepEqual(res.data, { url: "/node/5/edit", title: "/node/5/edit" });
  assert.equal(res.text, "Going to /node/5/edit (/node/5/edit).");
  r.initialized();

  const ambiguous = await r.run("nav go", { target: "About" });
  assert.equal(ambiguous.code, EXIT.FAILED);
  assert.equal(ambiguous.message, 'nav go: "About" matches 2 links: Footer › About; Main › About. Use the path or the breadcrumb, with its menu if need be.');

  const missing = await r.run("nav go", { target: "Blocks layout" });
  assert.equal(missing.message, 'nav go: no menu link "Blocks layout". Try nav search Blocks.');
  // A breadcrumb with its menu: search for the link, not the menu.
  assert.equal((await r.run("nav go", { target: "Footer › Blocks layout" })).message, 'nav go: no menu link "Footer › Blocks layout". Try nav search Blocks.');
  assert.equal((await r.run("nav go", { target: "https://evil.example/x" })).code, EXIT.USAGE);
  assert.equal(r.generation, 1);
  await tick();
  assert.deepEqual(calls.go, ["/node/5/edit"]);
});

test("nav go refuses a path that the URL parser reads as another site", async () => {
  const { r, calls } = setup();
  for (const target of ["https://evil.example/x", "javascript:alert(1)", "//evil.example/x", "/\\evil.example/?d=SECRET", "/\t/evil.example/", "/\n/evil.example/", "/\\/evil.example/"]) {
    const res = await r.run("nav go", { target });
    assert.equal(res.code, EXIT.USAGE, JSON.stringify(target));
    assert.equal(res.message, `nav go: "${target}" leads off this site. Only paths on this site are taken, such as /admin/content.`);
  }
  assert.equal(r.generation, 0);

  // A path on this site goes, query and fragment kept.
  const ok = await r.run("nav go", { target: "/admin/content?x=1#y" });
  assert.equal(ok.code, 0);
  assert.equal(ok.data.url, "/admin/content?x=1#y");
  await tick();
  assert.deepEqual(calls.go, ["/admin/content?x=1#y"]);

  // This site's own URL in full is a path on this site.
  r.initialized();
  assert.equal((await r.run("nav go", { target: "http://localhost/admin/people" })).data.url, "/admin/people");
});

test("nav menu and nav search mark their output as untrusted content", () => {
  const { r } = setup();
  for (const name of ["nav menu", "nav search"]) assert.deepEqual(r.get(name).annotations, { readOnly: true, untrustedContent: true });
  assert.deepEqual(r.get("nav status").annotations, { readOnly: true });
});

test("a link reachable twice is not ambiguous", async () => {
  const r = createRegistry();
  const twice = { a: { items: [{ title: "Docs", url: "/docs" }] }, b: { items: [{ title: "Docs", url: "/docs" }] } };
  nav({ menus: () => twice, go: () => {}, reloads: true }, { registry: r });
  assert.equal((await r.run("nav go", { target: "Docs" })).data.url, "/docs");
});

test("bad menus from the adapter fail the command, not the page", async () => {
  const r = createRegistry();
  let menus = null;
  nav({ menus: () => menus, go: () => {}, reloads: true }, { registry: r });
  assert.equal((await r.run("nav menu")).message, "nav: the app's adapter returned no menus object");
  menus = { main: { items: [{ title: "No url" }] } };
  assert.equal((await r.run("nav search", { query: "x" })).message, 'nav: a link in menu "main" has no title or url');
  menus = {};
  assert.match((await r.run("nav status")).text, /There are no menus\.$/);
});

test("completion offers menu names and link targets from the adapter", async () => {
  const { r } = setup();
  const menuItems = (await complete(r, "nav menu f")).items.map((i) => i.value);
  assert.deepEqual(menuItems, ["footer "]);
  const go = (await complete(r, "nav go cont")).items;
  assert.deepEqual(go.map((i) => i.value), ["Content ", '"Content types" ', "Contact "]);
  assert.equal(go[1].label, "Structure › Content types");
  assert.equal(go[1].description, "/admin/structure/types");
  // By path too.
  assert.deepEqual((await complete(r, "nav go /admin/structure/m")).items.map((i) => i.value), ["Menus "]);
});

test("completion stays quiet when the adapter fails", async () => {
  const r = createRegistry();
  nav({ menus: () => { throw new Error("down"); }, go: () => {}, reloads: true }, { registry: r });
  assert.deepEqual((await complete(r, "nav go c")).items, []);
});
