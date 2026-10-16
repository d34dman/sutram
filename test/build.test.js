import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as api from "../src/index.js";

test("the build bundles browser.js into one module with the same API", async () => {
  // Build in a temporary copy so the test never touches dist/.
  const dir = mkdtempSync(join(tmpdir(), "sutram-build-"));
  for (const part of ["src", "scripts", "package.json"]) cpSync(part, join(dir, part), { recursive: true });
  execFileSync(process.execPath, [join(dir, "scripts/build.mjs")]);
  // Both bundles keep the banner with the license notice.
  const { readFileSync } = await import("node:fs");
  for (const file of ["sutram.js", "sutram.min.js"]) {
    const [title, notice] = readFileSync(join(dir, "dist", file), "utf8").split("\n");
    assert.match(title, /^\/\/ @d34dman\/sutram \d+\.\d+\.\d+/, file);
    assert.match(notice, /^\/\/ https:\/\/.* · \(MIT OR GPL-2\.0-or-later\)$/, file);
  }

  const bundle = await import(join(dir, "dist/sutram.js"));
  assert.deepEqual(Object.keys(api).filter((k) => !(k in bundle)), []);
  for (const entry of ["client", "events", "webmcp", "console"]) {
    const mod = await import(`../src/${entry}.js`);
    assert.deepEqual(Object.keys(mod).filter((k) => !(k in bundle)), [], `${entry} exports`);
  }
  assert.equal(bundle.default, globalThis.Sutram);

  bundle.default.register({
    name: "build check", provider: "build", description: "Say hello",
    input: { type: "object", properties: {} },
    annotations: { readOnly: true },
    run: () => ({ text: "hello" }),
  });
  assert.equal(bundle.default.run, undefined);
  assert.ok(bundle.default.tools().some((t) => t.name === "build_check"));
  assert.equal((await bundle.default.call("build_check")).text, "hello");
});

test("the stripped build keeps every string, template and regex as written", () => {
  const dir = mkdtempSync(join(tmpdir(), "sutram-min-"));
  for (const part of ["src", "scripts", "package.json"]) cpSync(part, join(dir, part), { recursive: true });
  execFileSync(process.execPath, [join(dir, "scripts/build.mjs")]);
  // Each bundle sets globalThis.Sutram once, so each runs in its own process.
  const probe = (file) => execFileSync(process.execPath, ["--input-type=module", "-e", `
    const m = await import(${JSON.stringify(join(dir, "dist", file))});
    const { client } = m.default;
    const r = m.createRegistry();
    r.register({ name: "note set", provider: "n", description: "Set a note", positional: ["field", "value"], annotations: {},
      input: { type: "object", properties: { field: { type: "string", pattern: "^[a-z]+$" }, value: { type: "string" } } }, run: (i) => ({ data: i }) });
    const line = 'note set title --value <<END\\n<p class="a">// not a comment /* nor this */ \\\`x\\\` \${y}</p>\\nEND';
    const out = {
      prompt: m.agentPrompt("Fix the title", { title: "Page", url: "https://example.org/a//b" }),
      parsed: client.parse(r, line).input,
      line: m.commandLine(r.get("note set"), { field: "title", value: "a // b\\n/* c */" }),
      spans: client.highlight(r, "note set ti\\\\\\ntle --value='x // y'"),
      checked: await r.run("note set", { field: "Ti" }),
      messages: Object.keys(m.MESSAGES).length,
      hotkey: m.parseHotkey(m.DEFAULT_HOTKEY),
    };
    console.log(JSON.stringify(out));
  `], { encoding: "utf8" });
  const full = probe("sutram.js");
  assert.equal(probe("sutram.min.js"), full);
  assert.match(full, /Fix the title/);
});

test("the minifier keeps regular expressions after keywords and with escaped slashes", async () => {
  const { strip } = await import("../scripts/strip.mjs");
  const run = (code) => new Function(strip(code))();
  assert.equal(run("return /a  b/.test('a  b'); // comment"), true);
  assert.equal(run("const x = 1;\nreturn typeof /a/;"), "object");
  assert.equal(run("return /\\/\\/*b/.source; /* c */"), "\\/\\/*b");
  assert.equal(run("const t = 4, g = 2;\nreturn t / g / 2;"), 1);
  assert.equal(run("const s = `a ${ 1 + 1 } b`; // x\nreturn s"), "a 2 b");
  assert.equal(strip("if (a)  {\n    b();   // c\n}\n"), "if (a) {\nb();\n}\n");
});

test("the modules that set up the page are marked as side effects, so bundlers keep them", async () => {
  const { readFileSync } = await import("node:fs");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(pkg.sideEffects, ["./src/browser.js", "./dist/sutram.js", "./dist/sutram.min.js"]);
});
