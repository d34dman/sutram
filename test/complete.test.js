import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry } from "../src/index.js";
import { complete, splitLines, openQuote, parse } from "../src/client.js";

const r = createRegistry();
r.register({
  name: "flow connect", provider: "flow", description: "Connect two ports",
  input: {
    type: "object",
    properties: {
      from: { type: "string", description: "Output port" },
      to: { type: "string", description: "Input port" },
      mode: { type: "string", enum: ["data", "trigger"] },
      strict: { type: "boolean" },
    },
    required: ["from", "to"],
  },
  positional: ["from", "to"],
  annotations: {},
  suggest: (key, partial, { input }) => {
    const ports = key === "from" ? ["llm.1:out", "chat.2:reply"] : key === "to" ? ["chat.2:in", "note.3:text with space"] : [];
    return ports.filter((p) => p.startsWith(partial)).map((p) => ({ value: p, description: `after ${input.from || "-"}` }));
  },
  run: () => ({}),
});
r.register({ name: "flow list nodes", provider: "flow", description: "List nodes", input: { type: "object" }, annotations: { readOnly: true }, run: () => ({}) });
r.register({ name: "flow list edges", provider: "flow", description: "List edges", input: { type: "object" }, annotations: { readOnly: true }, run: () => ({}) });

const values = async (line) => (await complete(r, line)).items.map((i) => i.value);

test("completes command names word by word, with the words clients own", async () => {
  assert.deepEqual(await values("fl"), ["flow "]);
  assert.deepEqual(await values("flow "), ["connect ", "list "]);
  assert.deepEqual(await values("flow l"), ["list "]);
  assert.deepEqual(await values("flow list "), ["edges ", "nodes "]);
  assert.deepEqual(await values("he"), ["help "]);
  assert.deepEqual(await values("man flow list n"), ["nodes "]);
  const { start, items } = await complete(r, "flow list e");
  assert.equal(start, 10);
  assert.equal(items[0].description, "List edges");
  assert.equal((await complete(r, "flow ")).items.find((i) => i.label === "list").description, "2 commands");
});

test("completes positional values from suggest, quoting where needed", async () => {
  assert.deepEqual(await values("flow connect "), ["llm.1:out ", "chat.2:reply "]);
  assert.deepEqual(await values("flow connect llm.1:out "), ["chat.2:in ", '"note.3:text with space" ']);
  assert.equal((await complete(r, "flow connect llm.1:out c")).items[0].description, "after llm.1:out");
});

test("completes options, and option values from enum and suggest", async () => {
  assert.deepEqual(await values("flow connect --m"), ["--mode="]);
  assert.deepEqual(await values("flow connect --mode="), ["--mode=data ", "--mode=trigger "]);
  assert.deepEqual(await values("flow connect --mode t"), ["trigger "]);
  assert.deepEqual(await values("flow connect --from=llm"), ["--from=llm.1:out "]);
  assert.deepEqual(await values("flow connect --st"), ["--strict "]);
  // Options already given are not offered again.
  assert.ok(!(await values("flow connect --strict --")).includes("--strict "));
  assert.ok((await values("flow connect --")).includes("--json"));
});

test("nothing is suggested where nothing fits, and suggest errors are contained", async () => {
  assert.deepEqual(await values("zzz"), []);
  assert.deepEqual(await values("help "), ["flow "]);
  const r2 = createRegistry();
  r2.register({ name: "x go", provider: "x", description: "d", input: { type: "object", properties: { a: { type: "string" } } }, positional: ["a"], annotations: {}, suggest: () => { throw new Error("boom"); }, run: () => ({}) });
  const warn = console.warn;
  console.warn = () => {};
  // With no values to offer, an empty word gets the options instead.
  try {
    assert.ok((await complete(r2, "x go ")).items.every((i) => i.value.startsWith("--")));
    assert.deepEqual((await complete(r2, "x go q")).items, []);
  } finally { console.warn = warn; }
});

test("register refuses a suggest that is not a function", () => {
  const r2 = createRegistry();
  assert.throws(() => r2.register({ name: "x go", provider: "x", description: "d", input: { type: "object" }, annotations: {}, suggest: ["a"], run: () => ({}) }), /suggest that is not a function/);
});

test("multi-line values: line breaks inside quotes belong to the value", () => {
  assert.deepEqual(splitLines("a 1\nb 2\r\nc"), ["a 1", "b 2", "c"]);
  assert.deepEqual(splitLines('set --prompt="one\ntwo"\nnext'), ['set --prompt="one\ntwo"', "next"]);
  assert.deepEqual(splitLines("# don't\nnext 'x'"), ["# don't", "next 'x'"]);
  assert.equal(openQuote('flow connect --from="a b'), '"');
  assert.equal(openQuote('flow connect --from="a b"'), null);
  assert.deepEqual(parse(r, 'flow connect "a\nb" c').input, { from: "a\nb", to: "c" });
});

test("heredocs: their lines stay one command, and Enter inside one starts a new line", async () => {
  const text = `flow connect a <<END\n<p class="x">Don't</p>\n# not a comment\nEND\nnext 'x'`;
  assert.deepEqual(splitLines(text), [`flow connect a <<END\n<p class="x">Don't</p>\n# not a comment\nEND`, "next 'x'"]);
  assert.deepEqual(splitLines("a <<END\nopen"), ["a <<END\nopen"]);
  assert.deepEqual(splitLines("a <<END\r\nx\r\nEND\r\nb"), ["a <<END\nx\nEND", "b"]);
  assert.equal(openQuote("flow connect a <<END"), "<<END");
  assert.equal(openQuote("flow connect a <<'EOF'\n<p>"), "<<EOF");
  assert.equal(openQuote("flow connect a <<END\n<p>\nEND"), null);
  assert.equal(openQuote("flow connect a --to=<<END\n'"), "<<END");
  assert.deepEqual((await complete(r, "flow connect a <<END\n--")).items, []);
});
