import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHotkey, matchHotkey, DEFAULT_HOTKEY, SutramConsole } from "../src/console.js";

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
