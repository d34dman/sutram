import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, parse, tokenize, EXIT, commandLine } from "../src/index.js";

const r = createRegistry();
r.register({
  name: "cart add", provider: "cart", description: "Add",
  input: { type: "object", properties: { sku: { type: "string" }, qty: { type: "integer" }, gift: { type: "boolean" } }, required: ["sku"] },
  positional: ["sku", "qty"], annotations: {}, run: () => ({}),
});
r.register({
  name: "nav find", provider: "nav", description: "Find",
  input: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  positional: ["query"], annotations: { readOnly: true }, run: () => ({}),
});

test("tokenize follows shell quoting", () => {
  assert.deepEqual(tokenize(`a "b c" 'd "e"' f\\ g`).map((t) => t.value), ["a", "b c", 'd "e"', "f g"]);
  assert.throws(() => tokenize(`"open`), /unclosed double quote/);
});

test("positional and long options give the same input", () => {
  const want = { sku: "V60", qty: "2" };
  assert.deepEqual(parse(r, "cart add V60 2").input, want);
  assert.deepEqual(parse(r, "cart add --sku=V60 --qty=2").input, want);
  assert.deepEqual(parse(r, "cart add V60 --qty 2").input, want);
});

test("booleans, --no-, -- and client options", () => {
  assert.equal(parse(r, "cart add V60 --gift").input.gift, true);
  assert.equal(parse(r, "cart add V60 --no-gift").input.gift, false);
  assert.equal(parse(r, "cart add -- --V60").input.sku, "--V60");
  assert.equal(parse(r, "cart add V60 --json").json, true);
  assert.equal(parse(r, "cart add -h").help, true);
  assert.equal(parse(r, "cart add V60 --wide").wide, true);
  const picked = parse(r, "cart add V60 --json=sku,qty");
  assert.equal(picked.json, true);
  assert.deepEqual(picked.fields, ["sku", "qty"]);
  assert.throws(() => parse(r, "cart add V60 --json="), (e) => e.code === EXIT.USAGE);
});

test("the last positional takes the rest of the line", () => {
  assert.equal(parse(r, "nav find pour over").input.query, "pour over");
  assert.equal(parse(r, 'nav find "--weird"').input.query, "--weird");
});

test("usage errors and did-you-mean", () => {
  assert.throws(() => parse(r, "cart add V60 --colour=red"), (e) => e.code === EXIT.USAGE && /unknown option --colour/.test(e.message));
  assert.throws(() => parse(r, "cart ad V60"), (e) => e.code === EXIT.NOT_FOUND && /most similar command is: cart add/.test(e.message));
});

test("commandLine writes input back as the line a person would type, and parses to the same input", () => {
  const def = r.get("cart add");
  assert.equal(commandLine(def, { sku: "V60", qty: 2, gift: true }), "cart add V60 2 --gift");
  assert.equal(commandLine(def, { sku: 'say "hi"', gift: false }), 'cart add "say \\"hi\\"" --no-gift');
  assert.equal(commandLine(r.get("nav find"), { query: "pour over" }), 'nav find "pour over"');
  for (const input of [{ sku: "V60", qty: "2" }, { sku: "a b", qty: "3" }, { sku: "--x" }]) {
    assert.deepEqual(parse(r, commandLine(def, input)).input, input);
  }
});
