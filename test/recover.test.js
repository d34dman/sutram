import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, EXIT } from "../src/index.js";
import { nav } from "../src/nav.js";
import { lists } from "../src/lists.js";
import { forms } from "../src/forms.js";
import { user } from "../src/user.js";
import { watchNavigation } from "../src/leave.js";

// A page whose commands are registered, a fake window, and fake timers.
function setup(t, { navigation = false } = {}) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const registry = createRegistry();
  registry.register({
    name: "go away", provider: "test", description: "Leave the page",
    annotations: { navigates: true },
    run: (_, { reinitializes }) => { reinitializes(); return "Going."; },
  });
  registry.register({
    name: "swap", provider: "test", description: "Swap the commands in place",
    annotations: { reinitializes: true },
    run: (_, { reinitializes }) => { reinitializes(); return "Swapped."; },
  });
  registry.register({
    name: "ping", provider: "test", description: "Say pong",
    annotations: { readOnly: true },
    run: () => "pong",
  });
  registry.initialized();
  const win = new EventTarget();
  // The Navigation API, where the browser has it.
  if (navigation) win.navigation = new EventTarget();
  const stop = watchNavigation(registry, win);
  t.after(stop);
  const pageshow = (persisted) => win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted }));
  return { registry, win, pageshow };
}

const ping = async (registry) => (await registry.run("ping")).code;

test("reinitialize events say whether the page is being left", async () => {
  const registry = createRegistry();
  registry.register({ name: "go away", provider: "test", description: "Leave", annotations: { navigates: true }, run: (_, { reinitializes }) => { reinitializes(); } });
  registry.register({ name: "swap", provider: "test", description: "Swap", annotations: { reinitializes: true }, run: (_, { reinitializes }) => { reinitializes(); } });
  registry.initialized();
  const seen = [];
  registry.onReinitialize((e) => seen.push(e));
  await registry.run("go away");
  registry.initialized();
  await registry.run("swap");
  registry.reinitialize();
  registry.reinitialize({ navigates: true });
  assert.deepEqual(seen, [
    { generation: 1, navigates: true },
    { generation: 2, navigates: false },
    { generation: 3, navigates: false },
    { generation: 4, navigates: true },
  ]);
});

test("no signal, no resume: time alone never starts Sutram on the old page", async (t) => {
  const { registry, win } = setup(t, { navigation: true });
  await registry.run("go away");
  // A slow form POST, or a link that downloads a file: the browser said it is going, and then nothing.
  win.navigation.dispatchEvent(new Event("navigate"));
  t.mock.timers.tick(10 * 60 * 1000);
  assert.equal(await ping(registry), EXIT.CANCELLED, "the old page does not answer while it may still go");
  registry.initialized(); // the app says the page stayed
  assert.equal(await ping(registry), EXIT.OK);
});

test("a same-document navigation (hashchange) starts Sutram again at once", async (t) => {
  const { registry, win } = setup(t);
  await registry.run("go away");
  win.dispatchEvent(new Event("hashchange"));
  assert.equal(await ping(registry), EXIT.OK);
  await registry.ready;
});

test("a page restored from the back/forward cache starts Sutram again", async (t) => {
  const { registry, win, pageshow } = setup(t);
  await registry.run("go away");
  win.dispatchEvent(new Event("pagehide"));
  assert.equal(await ping(registry), EXIT.CANCELLED);
  pageshow(false); // a first load is not a restore
  assert.equal(await ping(registry), EXIT.CANCELLED);
  pageshow(true);
  assert.equal(await ping(registry), EXIT.OK);
  await registry.ready;
});

for (const [end, what] of [["navigateerror", "stops, as after Stay on page"], ["navigatesuccess", "keeps in the document"]]) {
  test(`a navigation the browser ${what} (${end}) starts Sutram again at once`, async (t) => {
    const { registry, win } = setup(t, { navigation: true });
    await registry.run("go away");
    win.navigation.dispatchEvent(new Event("navigate"));
    win.navigation.dispatchEvent(new Event(end));
    assert.equal(await ping(registry), EXIT.OK);
  });
}

test("a single-page app's reinitialize is left to the app", async (t) => {
  const { registry, win } = setup(t, { navigation: true });
  await registry.run("swap");
  win.dispatchEvent(new Event("hashchange"));
  win.navigation.dispatchEvent(new Event("navigatesuccess"));
  assert.equal(await ping(registry), EXIT.CANCELLED);
  registry.initialized();
  assert.equal(await ping(registry), EXIT.OK);
});

test("a signal for an older leave does not end a newer reinitialize", async (t) => {
  const { registry, win } = setup(t);
  await registry.run("go away");
  registry.reinitialize(); // a single-page app takes over before the page stays
  win.dispatchEvent(new Event("hashchange"));
  assert.equal(await ping(registry), EXIT.CANCELLED);
  registry.initialized();
  await registry.run("go away");
  registry.initialized(); // the adapter or the app answered first
  await registry.run("swap");
  win.dispatchEvent(new Event("hashchange"));
  assert.equal(await ping(registry), EXIT.CANCELLED, "the answered leave no longer listens");
});

test("nav go to a #hash of this page: nav status works again", async (t) => {
  const registry = createRegistry();
  const win = new EventTarget();
  nav({ menus: () => ({ main: { items: [{ title: "Top", url: "/page#top" }] } }), go: () => { win.dispatchEvent(new Event("hashchange")); }, reloads: true }, { registry });
  registry.initialized();
  t.after(watchNavigation(registry, win));
  assert.equal((await registry.run("nav go", { target: "Top" })).code, EXIT.OK);
  assert.equal((await registry.run("nav status")).code, EXIT.CANCELLED);
  await new Promise((resolve) => setTimeout(resolve, 5)); // adapter.go runs and the hash changes
  assert.equal((await registry.run("nav status")).code, EXIT.OK);
});

// The kits: the adapter answers whether the page stayed.

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

const KITS = [
  {
    kit: "nav", leave: ["nav go", { target: "Top" }], check: "nav status",
    make: (registry, go) => nav({ menus: () => ({ main: { items: [{ title: "Top", url: "/top" }] } }), go, reloads: true }, { registry }),
  },
  {
    kit: "lists", leave: ["listing go", { list: "content", page: 2 }], check: "listing status",
    make: (registry, go) => lists({ lists: () => ({ content: { label: "Content", columns: [{ key: "title", label: "Title" }], rows: [], page: 1, pages: 3 } }), go, reloads: true }, { registry }),
  },
  {
    kit: "forms", leave: ["form submit", { form: "contact" }], check: "form list",
    make: (registry, submit) => forms({
      forms: () => [{ id: "contact", label: "Contact", fields: [{ field: "name", label: "Name", type: "string", value: "" }], errors: [] }],
      read: () => "", write: () => {}, submit, reloads: true,
    }, { registry }),
  },
  {
    kit: "user login", leave: ["user login", {}], check: "user status",
    make: (registry, login) => user({ user: () => ({ authenticated: false }), login, logout: () => {}, reloads: true }, { registry }),
  },
  {
    kit: "user logout", leave: ["user logout", {}], check: "user status",
    make: (registry, logout) => user({ user: () => ({ authenticated: true, id: 1, name: "ada" }), login: () => {}, logout, reloads: true }, { registry }),
  },
];

for (const { kit, leave, check, make } of KITS) {
  const start = (answer) => {
    const registry = createRegistry();
    make(registry, answer);
    registry.initialized();
    return registry;
  };

  test(`${kit}: the adapter answers false, and Sutram resumes on this page at once`, async () => {
    for (const answer of [() => false, async () => false]) {
      const registry = start(answer);
      assert.equal((await registry.run(...leave)).code, EXIT.OK);
      assert.equal((await registry.run(check)).code, EXIT.CANCELLED);
      await flush();
      assert.equal((await registry.run(check)).code, EXIT.OK);
    }
  });

  test(`${kit}: the adapter rejects, and Sutram resumes and logs it`, async (t) => {
    const logged = t.mock.method(console, "error", () => {});
    for (const answer of [() => { throw new Error("blocked"); }, async () => { throw new Error("blocked"); }]) {
      const registry = start(answer);
      await registry.run(...leave);
      await flush();
      assert.equal((await registry.run(check)).code, EXIT.OK);
    }
    assert.equal(logged.mock.callCount(), 2);
    assert.match(String(logged.mock.calls[0].arguments[0]), /blocked/);
  });

  test(`${kit}: any other answer leaves Sutram waiting for the next page`, async () => {
    for (const answer of [() => {}, async () => true]) {
      const registry = start(answer);
      await registry.run(...leave);
      await flush();
      assert.equal((await registry.run(check)).code, EXIT.CANCELLED);
    }
  });
}

test("a stale answer after a newer reinitialize does nothing", async () => {
  let answer;
  const registry = createRegistry();
  nav({ menus: () => ({ main: { items: [{ title: "Top", url: "/top" }] } }), go: () => new Promise((resolve) => { answer = resolve; }), reloads: true }, { registry });
  registry.initialized();
  await registry.run("nav go", { target: "Top" });
  await flush();
  registry.reinitialize(); // the app starts again before the adapter answers
  answer(false);
  await flush();
  assert.equal((await registry.run("nav status")).code, EXIT.CANCELLED);
});
