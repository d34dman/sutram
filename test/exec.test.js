import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, EXIT } from "../src/index.js";
import { execLines, REINITIALIZED_NOTE } from "../src/webmcp.js";

/** A todo list with batch hooks, a consequential clear and a navigating go. */
function todos() {
  const r = createRegistry();
  let items = [];
  let saved = [];
  r.defineBatch("todo", { begin: () => { saved = [...items]; }, rollback: () => { items = saved; } });
  r.register({
    name: "todo add", provider: "todo", description: "Add a todo",
    input: { type: "object", properties: { text: { type: "string", minLength: 1 }, done: { type: "boolean" } }, required: ["text"] },
    positional: ["text"], annotations: {},
    run: ({ text }) => { if (text === "boom") throw new Error("todo add: boom"); items.push(text); return { text: `Added ${text}.`, data: { count: items.length } }; },
  });
  r.register({
    name: "todo status", provider: "todo", description: "Count todos",
    input: { type: "object", properties: {} }, output: { type: "object", properties: { count: { type: "integer" } } },
    annotations: { readOnly: true }, run: () => ({ text: `${items.length} todos`, data: { count: items.length } }),
  });
  r.register({
    name: "todo clear", provider: "todo", description: "Remove every todo",
    input: { type: "object", properties: {} }, annotations: { consequential: true },
    run: () => { items = []; return "Cleared."; },
  });
  r.register({
    name: "nav go", provider: "nav", description: "Go somewhere",
    input: { type: "object", properties: { to: { type: "string" } }, required: ["to"] }, positional: ["to"],
    annotations: { navigates: true }, run: (_, { reinitializes }) => { reinitializes(); return "Going."; },
  });
  return { r, items: () => items };
}

test("exec runs lines as one batch and answers with the console's text", async () => {
  const { r, items } = todos();
  const res = await execLines("todo add milk\n# a comment\n› todo add 'oat bread'\ntodo status --json", { registry: r });
  assert.equal(res.code, 0);
  assert.equal(res.completed, 3);
  assert.equal(res.total, 3);
  assert.equal(res.text, "› todo add milk\nAdded milk.\n› todo add 'oat bread'\nAdded oat bread.\n› todo status --json\n{\n  \"count\": 2\n}");
  assert.deepEqual(items(), ["milk", "oat bread"]);
});

test("a mistake in any line runs nothing; a failing line stops the batch and undoes the earlier ones", async () => {
  const { r, items } = todos();
  const typo = await execLines("todo add a\ntodo ad b", { registry: r });
  assert.equal(typo.code, EXIT.NOT_FOUND);
  assert.match(typo.text, /^› todo ad b\n.*\(exit 127\)\nLine 2 of 2 has a mistake, so nothing ran\.$/s);
  assert.deepEqual(items(), []);

  const usage = await execLines("todo add ''", { registry: r });
  assert.equal(usage.code, EXIT.USAGE);
  assert.match(usage.text, /Try todo add -h\. \(exit 2\)$/);

  const boom = await execLines("todo add a\ntodo add boom\ntodo add c", { registry: r });
  assert.equal(boom.code, EXIT.FAILED);
  assert.equal(boom.completed, 1);
  assert.match(boom.text, /todo add: boom \(exit 1\)\nStopped at line 2 of 3\. The earlier lines were undone, so nothing changed\.$/);
  assert.deepEqual(items(), []);
});

test("exec follows the policy: nothing that needs the user runs until the person says yes", async () => {
  const { r, items } = todos();
  await execLines("todo add a", { registry: r });
  const refused = await execLines("todo add b\ntodo clear", { registry: r });
  assert.equal(refused.code, EXIT.CANCELLED);
  assert.equal(refused.text, "exec contains consequential commands, and this page has no way to ask the user, so it did not run.");
  assert.deepEqual(items(), ["a"]);
  r.policy.setAsker(() => true);
  assert.equal((await execLines("todo add b\ntodo clear", { registry: r })).code, 0);
  assert.deepEqual(items(), []);
});

test("exec answers help, man, status and -h as the console does", async () => {
  const { r } = todos();
  const res = await execLines("help todo\nman todo add\nstatus\ntodo add -h\nclear", { registry: r });
  assert.equal(res.code, 0);
  assert.match(res.text, /› help todo\n.*todo add/s);
  assert.match(res.text, /› man todo add\n.*Add a todo/s);
  assert.match(res.text, /› status\ntodo {2}0 todos/);
  assert.match(res.text, /› todo add -h\n.*todo add/s);
  const man = await execLines("man todo ad", { registry: r });
  assert.equal(man.code, EXIT.NOT_FOUND);
  assert.match(man.text, /No manual entry for todo ad\. See help\. Try man todo add\./);
  const help = await execLines("help tod", { registry: r });
  assert.equal(help.code, EXIT.NOT_FOUND);
  assert.match(help.text, /help: nothing called "tod" on this page\. Try help todo\./);
  assert.match((await execLines("help nope", { registry: r })).text, /on this page\. See help\./);
  assert.equal((await execLines("  \n# only a comment", { registry: r })).code, EXIT.USAGE);
});

test("a group's name alone names its commands", async () => {
  const { r } = todos();
  const res = await execLines("todo", { registry: r });
  assert.equal(res.code, EXIT.NOT_FOUND);
  assert.match(res.text, /todo: command not found\. todo has: todo add, todo clear, todo status\. Try help todo\./);
});

test("a command's own question is asked again before exec runs it: a page that changed meanwhile runs nothing", async () => {
  const r = createRegistry();
  r.initialized();
  let total = 1;
  let paid = null;
  r.register({
    name: "shop pay", provider: "shop", description: "Pay", annotations: { consequential: true },
    confirm: () => `Pay €${total}?`, run: () => { paid = total; return "Paid."; },
  });
  r.policy.setAsker(async () => { total = 9999; return true; });
  const changed = await execLines("shop pay", { registry: r });
  assert.equal(changed.code, EXIT.CANCELLED);
  assert.match(changed.text, /the page changed while the user was asked/);
  assert.equal(paid, null);
  r.policy.setAsker(async () => true);
  assert.equal((await execLines("shop pay", { registry: r })).code, 0);
  assert.equal(paid, 9999);
});

test("--json= with a field the result lacks still answers 0, with everything it returned: the command ran", async () => {
  const { r } = todos();
  const res = await execLines("todo add a --json=nope", { registry: r });
  assert.equal(res.code, 0);
  assert.doesNotMatch(res.text, /exit 2/);
  assert.match(res.text, /unknown field "nope"\. Available: count\. It ran; here is all it returned\.\n\{\n {2}"count": 1\n\}/);
});

test("a line that leaves the page goes last, and the answer says to wait", async () => {
  const { r } = todos();
  const early = await execLines("nav go /a\ntodo add a", { registry: r });
  assert.equal(early.code, EXIT.USAGE);
  assert.match(early.text, /nav go may start Sutram again, so it must be the last line/);
  const last = await execLines("todo add a\nnav go /a", { registry: r });
  assert.equal(last.code, 0);
  assert.ok(last.text.endsWith(REINITIALIZED_NOTE));
});

test("status takes provider names, as in the console", async () => {
  const { r } = todos();
  assert.equal((await execLines("status todo", { registry: r })).text, "› status todo\ntodo  0 todos");
  const unknown = await execLines("status cart", { registry: r });
  assert.equal(unknown.code, EXIT.USAGE);
  assert.match(unknown.text, /status: cart reports no status on this page; these do: todo\. \(exit 2\)$/);
  assert.equal((await execLines("status --wide", { registry: r })).code, EXIT.USAGE);
});

test("-h works on help, man, status and clear too, and their other options are usage errors", async () => {
  const { r } = todos();
  for (const word of ["help", "man", "status", "clear"]) {
    const res = await execLines(`${word} -h`, { registry: r });
    assert.equal(res.code, 0, word);
    assert.ok(res.text.startsWith(`› ${word} -h\nusage: ${word}`), res.text);
    assert.ok(res.text.endsWith(`See man ${word} for more.`), res.text);
  }
  const bad = await execLines("help --json", { registry: r });
  assert.equal(bad.code, EXIT.USAGE);
  assert.match(bad.text, /help: usage: help \[provider\] \(exit 2\)$/);
});

test("a single line that needs the user is refused in its own name", async () => {
  const { r } = todos();
  const res = await execLines("todo clear", { registry: r });
  assert.equal(res.code, EXIT.CANCELLED);
  assert.match(res.text, /^todo_clear is consequential, and this page has no way to ask the user, so it did not run\.$/);
});

test("status inside a batch runs in the batch, instead of waiting for it to end", async () => {
  const { r } = todos();
  const res = await Promise.race([
    execLines("todo add a\nstatus todo", { registry: r }),
    new Promise((resolve) => setTimeout(() => resolve("waited for itself"), 1000)),
  ]);
  assert.equal(res.code, 0);
  assert.equal(res.text, "› todo add a\nAdded a.\n› status todo\ntodo  1 todos");
});
