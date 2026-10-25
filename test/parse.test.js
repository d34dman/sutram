import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, EXIT, commandLine } from "../src/index.js";
import { parse, tokenize, splitLines, openQuote, highlight, checkInput } from "../src/client.js";

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

test("an option's value may be quoted; a quoted word is never an option", () => {
  assert.deepEqual(parse(r, `cart add --sku="V60 02" --qty=2`).input, { sku: "V60 02", qty: "2" });
  assert.deepEqual(parse(r, `cart add --sku='V60 02'`).input, { sku: "V60 02" });
  assert.deepEqual(parse(r, `nav find "--qty=2"`).input, { query: "--qty=2" });
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

test("commandLine writes any checked value so that it reads back the same", () => {
  const r2 = createRegistry();
  const def = {
    name: "doc set", provider: "doc", description: "Set", annotations: {}, positional: ["title"],
    input: { type: "object", properties: {
      title: { type: "string" }, n: { type: "number" }, on: { type: "boolean" }, maybe: { type: ["boolean", "null"] },
      tags: { type: "array", items: { type: "string" } }, ids: { type: "array", items: { type: "integer" } },
      meta: { type: "object" }, rows: { type: "array", items: { type: "object" } }, note: { type: "string" },
    } },
    run: () => ({}),
  };
  r2.register(def);
  const values = [
    { title: "x", meta: { a: 1, b: [true, "c"] } },
    { title: "it's", meta: { q: "it's \"so\"" } },
    { tags: ["a,b", "c"], ids: [1, 2] },
    { tags: [" padded", ""], rows: [{ a: 1 }] },
    { tags: [], on: false, maybe: true, n: -1.5 },
    { title: "-dash", note: "[not a list]" },
  ];
  for (const value of values) {
    const line = commandLine(def, value);
    const { errors, value: back } = checkInput(def.input, parse(r2, line).input);
    assert.deepEqual(errors, [], line);
    assert.deepEqual(back, value, line);
  }
  assert.equal(commandLine(def, { title: "x", meta: { a: 1 } }), `doc set x --meta='{"a":1}'`);
  assert.equal(commandLine(def, { title: null, n: undefined, on: null }), "doc set");
  assert.equal(commandLine(def, { tags: ["a,b"] }), `doc set --tags='["a,b"]'`);
  // A value of the wrong type is written as given, not as a flag.
  assert.equal(commandLine(def, { on: "false", note: true }), "doc set --on=false --note=true");
});

test("highlight covers every character and names each part of the line", () => {
  const kinds = (line) => highlight(r, line).filter((s) => s.kind !== "space").map((s) => `${s.kind}:${s.text}`);
  for (const line of [`cart add "V60 02" --qty=2 --no-gift -- --x`, `nav find "half`, "  help  cart ", "", "x\\ y"]) {
    assert.equal(highlight(r, line).map((s) => s.text).join(""), line);
  }
  assert.deepEqual(kinds(`cart add "V60 02" --qty=2 --nope --json=sku`),
    ["command:cart", "command:add", 'string:"V60 02"', "option:--qty=", "value:2", "bad-option:--nope", "option:--json=", "value:sku"]);
  assert.deepEqual(kinds("cart add V60 -- --gift"), ["command:cart", "command:add", "arg:V60", "option:--", "arg:--gift"]);
  assert.deepEqual(kinds("help cart"), ["client:help", "arg:cart"]);
  // While a name is being typed it is not marked unknown yet.
  assert.deepEqual(kinds("car"), ["command:car"]);
  assert.deepEqual(kinds("cart "), ["command:cart"]);
  assert.deepEqual(kinds("cark add"), ["unknown:cark", "arg:add"]);
});

const html = `<p class="lead">Don't escape "this".</p>\n<p>a \\ b</p>`;

test("a heredoc takes the lines up to its closing word, exactly as written", () => {
  assert.equal(parse(r, `nav find <<END\n${html}\nEND`).input.query, html);
  assert.equal(parse(r, `nav find <<'EOF'\n${html}\n  EOF  `).input.query, html);
  assert.equal(parse(r, `nav find --query <<"X"\n\nkeeps blank lines\n\nX`).input.query, "\nkeeps blank lines\n");
  assert.equal(parse(r, `nav find --query=<<END\none\nEND`).input.query, "one");
  assert.equal(parse(r, "nav find <<END\r\none\r\ntwo\r\nEND").input.query, "one\ntwo");
  assert.equal(parse(r, "nav find <<END\nEND").input.query, "");
  // A line that only contains the word, or starts with it, does not close it.
  assert.equal(parse(r, "nav find <<END\nEND of story\nEND").input.query, "END of story");
  // Only at the end of a line, and not when quoted or escaped.
  assert.equal(parse(r, "nav find <<END x").input.query, "<<END x");
  assert.equal(parse(r, 'nav find "<<END"').input.query, "<<END");
  assert.equal(parse(r, "nav find a<<END").input.query, "a<<END");
  // A heredoc word is never an option.
  assert.equal(parse(r, "nav find <<END\n--qty=2\nEND").input.query, "--qty=2");
  assert.throws(() => parse(r, "nav find <<END\nno end"), (e) => e.code === EXIT.USAGE && /unclosed heredoc.*END/.test(e.message));
});

test("commandLine writes a multi-line value as a heredoc, last, and it parses back", () => {
  const set = createRegistry();
  set.register({
    name: "form f set", provider: "form", description: "Set",
    input: { type: "object", properties: { field: { type: "string" }, value: { type: "string" }, draft: { type: "boolean" } } },
    positional: ["field", "value"], annotations: {}, run: () => ({}),
  });
  const def = set.get("form f set");
  assert.equal(commandLine(def, { field: "body.value", value: "<p>a</p>\n<p>b</p>", draft: true }),
    "form f set body.value --draft --value <<END\n<p>a</p>\n<p>b</p>\nEND");
  assert.match(commandLine(def, { field: "x", value: "a\nEND\nb" }), /<<END2\na\nEND\nb\nEND2$/);
  for (const input of [{ field: "body.value", value: html }, { field: "x", value: "a\nEND\nb\n" }, { value: "one\ntwo", field: "first\nsecond" }]) {
    assert.deepEqual(parse(set, commandLine(def, input)).input, input);
  }
});

test("highlight marks a heredoc as a string", () => {
  const kinds = (line) => highlight(r, line).filter((s) => s.kind !== "space").map((s) => `${s.kind}:${s.text}`);
  for (const line of ["nav find <<END\n<p>x</p>\nEND", "nav find --query=<<END\nopen", "nav find <<END"]) {
    assert.equal(highlight(r, line).map((s) => s.text).join(""), line);
  }
  assert.deepEqual(kinds("nav find <<END\n<p>\"x\"</p>\nEND"), ["command:nav", "command:find", 'string:<<END\n<p>"x"</p>\nEND']);
  assert.deepEqual(kinds("nav find --query=<<END\na\nEND"), ["command:nav", "command:find", "option:--query=", "string:<<END\na\nEND"]);
});

test("positional words fill the keys not given as options, and none is dropped", () => {
  const r = createRegistry();
  r.register({
    name: "note set", provider: "note", description: "Set", positional: ["field", "value"], annotations: {}, run: () => {},
    input: { type: "object", properties: { field: { type: "string" }, value: { type: "string" }, n: { type: "integer" } } },
  });
  assert.deepEqual(parse(r, "note set --field=t hello there").input, { field: "t", value: "hello there" });
  assert.deepEqual(parse(r, "note set title some words").input, { field: "title", value: "some words" });
  assert.throws(() => parse(r, "note set a --value=v b"), /note set: unexpected argument "b"/);
  assert.throws(() => parse(r, "note set --field=a --value=v b"), /unexpected argument "b"/);
  assert.throws(() => parse(r, "note set t --constructor=x"), /unknown option --constructor/);
});

test("a backslash at the end of a line joins the next line", () => {
  const r = createRegistry();
  r.register({
    name: "note set", provider: "note", description: "Set", positional: ["field", "value"], annotations: {}, run: () => {},
    input: { type: "object", properties: { field: { type: "string" }, value: { type: "string" }, on: { type: "boolean" } } },
  });
  assert.deepEqual(splitLines("note set title \\\n  --value=hi\nnote set x y"), ["note set title \\\n  --value=hi", "note set x y"]);
  assert.deepEqual(parse(r, "note set title \\\r\n  --value=hi").input, { field: "title", value: "hi" });
  assert.deepEqual(parse(r, "note set ti\\\ntle v").input, { field: "title", value: "v" });
  assert.deepEqual(tokenize("'a\\\nb'").map((t) => t.value), ["a\\\nb"]);
  assert.equal(openQuote("note set title \\"), "\\");
  assert.equal(openQuote("note set title \\\\"), null);
});

test("quote and boolean mistakes say how to fix them", () => {
  const r = createRegistry();
  r.register({
    name: "note set", provider: "note", description: "Set", positional: ["field", "value"], annotations: {}, run: () => {},
    input: { type: "object", properties: { field: { type: "string" }, value: { type: "string" }, on: { type: "boolean" } } },
  });
  assert.throws(() => parse(r, "note set title don't panic"), /unclosed single quote in don't: put text with an apostrophe in double quotes/);
  assert.throws(() => parse(r, 'note set title "oops'), /unclosed double quote in "oops/);
  assert.throws(() => parse(r, "note set t --on false"), /--on takes no value. Write --on or --no-on, or --on=false/);
  assert.deepEqual(parse(r, "note set t --on=false").input, { field: "t", on: "false" });
});

test("splitLines is linear on a long paste", () => {
  const html = "<p>" + "word <b>bold</b> # not a comment ".repeat(4000) + "</p>";
  const text = `doc set --value=${JSON.stringify(html)}\n# a comment\ndoc set --value <<END\n${html}\nEND\n${"x<".repeat(30000)}`;
  const started = performance.now();
  const lines = splitLines(text);
  // About 100 ms alone; quadratic work on this input takes seconds. The margin is for a busy test run.
  assert.ok(performance.now() - started < 1000, `took ${Math.round(performance.now() - started)} ms`);
  assert.equal(lines.length, 4);
  assert.equal(lines[1], "# a comment");
  assert.match(lines[2], /<<END\n<p>word/);
});
