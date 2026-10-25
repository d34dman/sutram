import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry } from "../src/index.js";
import { user } from "../src/user.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(over = {}) {
  const r = createRegistry();
  r.initialized();
  const calls = { login: 0, logout: 0 };
  let who = { authenticated: true, id: 7, name: "ada", roles: [{ id: "editor", label: "Editor" }, "admin"] };
  const off = user({
    user: () => who,
    login: () => { calls.login++; },
    logout: () => { calls.logout++; },
    reloads: true,
    ...over,
  }, { registry: r });
  return { r, calls, off, set: (u) => { who = u; } };
}

test("registers user status, login and logout with titles; reloads picks the annotations", () => {
  const { r, off } = setup();
  assert.equal(r.get("user status").title, "Show who is logged in");
  // Names and role labels are the site's text.
  assert.deepEqual(r.get("user status").annotations, { readOnly: true, untrustedContent: true });
  assert.deepEqual(r.get("user login").annotations, { navigates: true, untrustedContent: true });
  assert.deepEqual(r.get("user logout").annotations, { navigates: true, untrustedContent: true, consequential: true });
  off();
  assert.equal(r.get("user login"), undefined);
  const spa = setup({ reloads: false }).r;
  assert.deepEqual(spa.get("user login").annotations, { reinitializes: true, untrustedContent: true });
  assert.deepEqual(spa.get("user logout").annotations, { reinitializes: true, untrustedContent: true, consequential: true });
});

test("user status: who, with role labels in the text and ids in the data", async () => {
  const { r, set } = setup();
  const res = await r.run("user status");
  assert.equal(res.text, "Logged in as ada (user 7, roles: Editor, admin).");
  assert.deepEqual(res.data, { authenticated: true, id: "7", name: "ada", roles: ["editor", "admin"] });
  set({ authenticated: false });
  const anon = await r.run("user status");
  assert.equal(anon.text, "Not logged in. Run user login to log in.");
  assert.deepEqual(anon.data, { authenticated: false });
});

test("user login opens the app's login after answering, unless already logged in", async () => {
  const { r, calls, set } = setup();
  const already = await r.run("user login");
  assert.equal(already.text, "Already logged in as ada.");
  assert.equal(r.generation, 0);
  set({ authenticated: false });
  const res = await r.run("user login");
  assert.deepEqual(res.data, { authenticated: false });
  assert.equal(r.generation, 1);
  assert.equal(calls.login, 0);
  await tick();
  assert.equal(calls.login, 1);
});

test("user logout logs out after answering, unless nobody is logged in", async () => {
  const { r, calls, set } = setup();
  const res = await r.run("user logout");
  assert.equal(res.text, "Logging out ada.");
  assert.equal(r.generation, 1);
  await tick();
  assert.equal(calls.logout, 1);
  r.initialized();
  set({ authenticated: false });
  assert.equal((await r.run("user logout")).text, "Not logged in.");
  await tick();
  assert.equal(calls.logout, 1);
});

test("user refuses an incomplete adapter", () => {
  const r = createRegistry();
  const ok = { user: () => ({}), login: () => {}, logout: () => {}, reloads: true };
  assert.throws(() => user({ ...ok, login: undefined }, { registry: r }), /needs a login\(\) function/);
  assert.throws(() => user({ ...ok, reloads: "yes" }, { registry: r }), /reloads: true or false/);
  assert.equal(r.get("user status"), undefined);
});
