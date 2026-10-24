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

test("exec follows the policy: nothing that needs the user runs without confirmed", async () => {
  const { r, items } = todos();
  await execLines("todo add a", { registry: r });
  const refused = await execLines("todo add b\ntodo clear", { registry: r });
  assert.equal(refused.code, EXIT.CANCELLED);
  assert.match(refused.text, /^exec contains consequential commands, so it did not run\. Ask the user .*todo clear.*confirmed: true/s);
  assert.deepEqual(items(), ["a"]);
  assert.equal((await execLines("todo add b\ntodo clear", { registry: r, confirmed: true })).code, 0);
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
  assert.equal((await execLines("man nope", { registry: r })).code, EXIT.FAILED);
  assert.equal((await execLines("  \n# only a comment", { registry: r })).code, EXIT.USAGE);
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
