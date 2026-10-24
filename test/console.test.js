import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHotkey, matchHotkey, DEFAULT_HOTKEY, MESSAGES, SutramConsole } from "../src/console.js";
import { createRegistry } from "../src/index.js";
import { execLines } from "../src/webmcp.js";

const key = (code, keyValue, mods = {}) => ({ code, key: keyValue, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

test("the default hotkey is the key left of 1, by position, on every layout", () => {
  const bindings = parseHotkey(DEFAULT_HOTKEY);
  assert.ok(matchHotkey(key("Backquote", "`"), bindings));      // US English
  assert.ok(matchHotkey(key("Backquote", "Dead"), bindings));   // German ^, a dead key
  assert.ok(matchHotkey(key("Backquote", "²"), bindings));      // French
  assert.equal(matchHotkey(key("Equal", "Dead"), bindings), null); // German ´` key is elsewhere
  // Not in a text field without a modifier; Ctrl+` works everywhere.
  assert.equal(matchHotkey(key("Backquote", "`"), bindings, { inField: true }), null);
  assert.ok(matchHotkey(key("Backquote", "`", { ctrlKey: true }), bindings, { inField: true }));
  // Modifiers match exactly; Ctrl+Shift+K is no longer bound.
  assert.equal(matchHotkey(key("Backquote", "`", { ctrlKey: true, shiftKey: true }), bindings), null);
  assert.equal(matchHotkey(key("KeyK", "K", { ctrlKey: true, shiftKey: true }), bindings), null);
});

test("hotkeys can be set; letters follow the layout, other keys their position", () => {
  const [b] = parseHotkey("ctrl+k");
  assert.ok(matchHotkey(key("KeyK", "k", { ctrlKey: true }), [b]));
  // Dvorak: the K character sits on the QWERTY V key.
  assert.ok(matchHotkey(key("KeyV", "k", { ctrlKey: true }), [b]));
  assert.equal(matchHotkey(key("KeyK", "t", { ctrlKey: true }), [b]), null);
  // Alt+K on macOS types ˚; the position decides then.
  assert.ok(matchHotkey(key("KeyK", "˚", { altKey: true }), parseHotkey("alt+k")));
  assert.ok(matchHotkey(key("F2", "F2"), parseHotkey("f2")));
  assert.deepEqual(parseHotkey("none"), []);
  assert.throws(() => parseHotkey("hyper+k"), /unknown modifier "hyper"/);
  assert.throws(() => parseHotkey("ctrl+"), /has no key/);
});

// The history methods on a stand-in for the element: they touch no DOM.
const historyOf = (store) => {
  const c = Object.assign(Object.create(SutramConsole.prototype), { history: [], historyIndex: 0, ranHere: [], _historyStore: null });
  if (store !== undefined) c.historyStore = store;
  return c;
};

test("history stays on the page unless the app passes a store", () => {
  const c = historyOf();
  c.remember("help");
  assert.deepEqual(c.history, ["help"]);
  assert.equal(c.historyStore, null);
});

test("a history store gets every line run, and its lines go first", () => {
  let saved = ["form list"];
  const c = historyOf({ load: () => saved, save: (lines) => { saved = lines; } });
  assert.deepEqual(c.history, ["form list"]);
  assert.equal(c.historyIndex, 1);
  c.remember("help");
  assert.deepEqual(saved, ["form list", "help"]);
});

test("a store that fails or returns something else leaves history alone", () => {
  const broken = historyOf({ load: () => { throw new Error("blocked"); }, save: () => { throw new Error("full"); } });
  broken.remember("help");
  assert.deepEqual(broken.history, ["help"]);
  assert.deepEqual(historyOf({ load: () => "nope", save() {} }).history, []);
  assert.deepEqual(historyOf({ load: () => ["a", 2, null, "b"], save() {} }).history, ["a", "b"]);
});

test("a store may load later: its lines go before the ones run meanwhile", async () => {
  let resolve;
  const c = historyOf({ load: () => new Promise((r) => { resolve = r; }), save() {} });
  c.remember("status");
  resolve(["help"]);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(c.history, ["help", "status"]);
});

// Peek on a stand-in for the element: attributes in a Map, no DOM.
const peekOf = (attrs = {}) => {
  const a = new Map(Object.entries(attrs));
  return Object.assign(Object.create(SutramConsole.prototype), {
    peekTimer: null,
    hasAttribute: (n) => a.has(n),
    getAttribute: (n) => (a.has(n) ? a.get(n) : null),
    setAttribute: (n, v) => a.set(n, String(v)),
    removeAttribute: (n) => a.delete(n),
  });
};
const press = (c, type, keyValue, mods = {}) => {
  const e = { type, key: keyValue, isTrusted: true, repeat: false, defaultPrevented: false,
    ...key("", keyValue, mods), preventDefault() { this.defaultPrevented = true; }, ...mods };
  c.onPeekEvent(e);
  return e;
};

test("peek is off by default; holding the peek key alone fades the console", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  assert.equal(peekOf({ open: "" }).peekKey, null);
  assert.equal(peekOf({ peek: "" }).peekKey, "Alt");
  assert.equal(peekOf({ peek: "ctrl" }).peekKey, "Control");
  assert.equal(peekOf({ peek: "none" }).peekKey, null);

  const c = peekOf({ peek: "", open: "" });
  press(c, "keydown", "Alt", { altKey: true });
  assert.equal(c.peeking, false); // not at once: Alt+letter must not flicker
  t.mock.timers.tick(250);
  assert.equal(c.peeking, true);
  press(c, "keydown", "Alt", { altKey: true, repeat: true });
  assert.equal(c.peeking, true);
  const up = press(c, "keyup", "Alt");
  assert.equal(c.peeking, false);
  assert.equal(up.defaultPrevented, true); // no Firefox menu bar
});

test("another key, a click or a closed console means no peek", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const c = peekOf({ peek: "", open: "" });
  // Option+e on a Mac: the letter comes before the wait is over.
  press(c, "keydown", "Alt", { altKey: true });
  press(c, "keydown", "é", { altKey: true });
  t.mock.timers.tick(250);
  assert.equal(c.peeking, false);
  // With another modifier held it is a shortcut, not a peek.
  press(c, "keydown", "Alt", { altKey: true, shiftKey: true });
  t.mock.timers.tick(250);
  assert.equal(c.peeking, false);
  // Peeking ends on any other key and on a click.
  press(c, "keydown", "Alt", { altKey: true });
  t.mock.timers.tick(250);
  press(c, "keydown", "Tab", { altKey: true });
  assert.equal(c.peeking, false);
  press(c, "keydown", "Alt", { altKey: true });
  t.mock.timers.tick(250);
  c.onPeekEvent({ type: "pointerdown" });
  assert.equal(c.peeking, false);
  // Keys apps fire do not peek; a closed drop-down has nothing to fade.
  c.onPeekEvent({ type: "keydown", key: "Alt", altKey: true, isTrusted: false });
  t.mock.timers.tick(250);
  assert.equal(c.peeking, false);
  const closed = peekOf({ peek: "" });
  press(closed, "keydown", "Alt", { altKey: true });
  t.mock.timers.tick(250);
  assert.equal(closed.peeking, false);
});

// The line-running methods on a stand-in for the element: output is collected, not drawn.
const consoleOf = (registry) => {
  const out = [];
  const c = Object.assign(Object.create(SutramConsole.prototype), {
    registry, _messages: MESSAGES, history: [], historyIndex: 0, ranHere: [], _historyStore: null, pendingAsk: null,
    print: (text, kind) => { out.push(`${kind}: ${text}`); return { append() {} }; },
    echo: (line) => out.push(`› ${line}`),
    printBlocks: (blocks) => { for (const b of blocks) out.push(`${b.kind}: ${b.text}`); },
  });
  Object.defineProperty(c, "formatOptions", { value: {} });
  return { c, out };
};

test("the console reads lines as Sutram.exec() does: -h on the built-in words, usage errors for their options", async () => {
  const r = createRegistry();
  r.register({ name: "todo status", provider: "todo", description: "Count", annotations: { readOnly: true }, run: () => "0 todos" });
  r.initialized();
  for (const line of ["status -h", "help -h", "man -h"]) {
    const { c, out } = consoleOf(r);
    assert.equal(await c.submit(line), 0, line);
    assert.match(out.join("\n"), /text: usage: /, line);
    assert.equal((await execLines(line, { registry: r })).code, 0, line);
  }
  const { c, out } = consoleOf(r);
  assert.equal(await c.submit("status --wide"), 2);
  assert.match(out.join("\n"), /status: usage: status \[provider …\] \[--json\]/);
  assert.equal(await c.submit("status"), 0);
  assert.match(out.join("\n"), /text: todo {2}0 todos/);
});

test("a typed command whose question changed while the person was asked does not run", async () => {
  const r = createRegistry();
  let total = 1;
  const ran = [];
  r.register({
    name: "cart buy", provider: "cart", description: "Buy", annotations: { consequential: true },
    confirm: () => `Buy ${total} items?`, run: () => { ran.push(total); return "Bought."; },
  });
  r.initialized();
  const { c, out } = consoleOf(r);
  // Something else changes the cart while the question is open.
  c.ask = async () => { total = 2; return true; };
  assert.equal(await c.submit("cart buy"), 130);
  assert.match(out.join("\n"), /cart buy: the page changed while the user was asked, so it did not run/);
  c.ask = async () => true;
  assert.equal(await c.submit("cart buy"), 0);
  assert.deepEqual(ran, [2]);
});

// A stand-in that records what the console prints for agents' runs.
const watcher = (registry, { asks = true } = {}) => {
  const printed = [];
  const c = Object.assign(Object.create(SutramConsole.prototype), {
    registry,
    offAsker: asks ? () => {} : null,
    echo: (line, kind) => printed.push([kind, line]),
    fail: (text, code) => printed.push(["error", `${text} (exit ${code})`]),
    printResult: (result) => printed.push(["result", result.text]),
  });
  registry.onResult((run) => c.showAgentRun(run));
  return printed;
};

test("the console shows the commands agents run through tools, and their results", async () => {
  const registry = createRegistry();
  registry.register({ name: "cart add", provider: "cart", description: "Add", annotations: {}, input: { type: "object", properties: { item: { type: "string" } } }, positional: ["item"], run: ({ item }) => `Added ${item}.` });
  registry.register({ name: "cart fail", provider: "cart", description: "Fail", annotations: {}, run: () => { throw new Error("no cart"); } });
  const printed = watcher(registry);
  await execLines("cart add V60\ncart fail", { registry });
  assert.deepEqual(printed, [
    ["input agent", "cart add V60"], ["result", "Added V60."],
    ["input agent", "cart fail"], ["error", "no cart (exit 1)"],
  ]);
  // A person's own lines and app code are not repeated.
  printed.length = 0;
  await registry.run("cart add", { item: "filter" }, { caller: "console" });
  await registry.run("cart add", { item: "filter" });
  assert.deepEqual(printed, []);
});

test("only the console that asks for agents shows their runs", async () => {
  const registry = createRegistry();
  registry.register({ name: "cart add", provider: "cart", description: "Add", annotations: {}, run: () => "Added." });
  const printed = watcher(registry, { asks: false });
  await execLines("cart add", { registry });
  assert.deepEqual(printed, []);
});
