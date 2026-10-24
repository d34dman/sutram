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

test("dist/nav.js uses the page's Sutram and adds itself to Sutram.kits", () => {
  const dir = mkdtempSync(join(tmpdir(), "sutram-kit-"));
  for (const part of ["src", "scripts", "package.json"]) cpSync(part, join(dir, part), { recursive: true });
  execFileSync(process.execPath, [join(dir, "scripts/build.mjs")]);
  // The kit file alone refuses to load; after sutram.js it registers on the page's registry.
  const run = (code) => execFileSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
  for (const file of ["nav.js", "nav.min.js"]) {
    const kit = JSON.stringify(join(dir, "dist", file));
    assert.throws(() => run(`await import(${kit});`), /load dist\/sutram\.js \d+\.\d+\.\d+ before the nav kit/, file);
    const out = JSON.parse(run(`
      const { default: Sutram } = await import(${JSON.stringify(join(dir, "dist/sutram.js"))});
      const { nav } = await import(${kit});
      Sutram.kits.nav({ menus: () => ({ main: { label: "Main", items: [{ title: "Docs", url: "/docs" }] } }), go: () => {}, reloads: true, here: () => "/docs" });
      const res = await Sutram.registry.run("nav status");
      console.log(JSON.stringify({ same: nav === Sutram.kits.nav, tools: Sutram.tools().map((t) => t.name), trail: res.data.trail }));
    `));
    assert.equal(out.same, true, file);
    assert.equal(out.trail, "Docs", file);
    for (const tool of ["nav_status", "nav_menu", "nav_search", "nav_go"]) assert.ok(out.tools.includes(tool), `${file}: ${tool}`);
  }
});

test("dist/page.js, user.js, messages.js, lists.js and forms.js register on the page's Sutram", () => {
  const dir = mkdtempSync(join(tmpdir(), "sutram-kits-"));
  for (const part of ["src", "scripts", "package.json"]) cpSync(part, join(dir, part), { recursive: true });
  execFileSync(process.execPath, [join(dir, "scripts/build.mjs")]);
  const run = (code) => execFileSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
  for (const min of ["", ".min"]) {
    const kit = (name) => JSON.stringify(join(dir, "dist", `${name}${min}.js`));
    const out = JSON.parse(run(`
      const { default: Sutram } = await import(${JSON.stringify(join(dir, "dist/sutram.js"))});
      await import(${kit("page")}); await import(${kit("user")}); await import(${kit("messages")}); await import(${kit("lists")}); await import(${kit("forms")});
      Sutram.kits.page({ page: () => ({ title: "Docs" }), here: () => "/docs" });
      Sutram.kits.user({ user: () => ({ authenticated: true, name: "ada" }), login() {}, logout() {}, reloads: true });
      Sutram.kits.messages({ messages: () => [{ type: "status", text: "Saved." }] });
      Sutram.kits.lists({ lists: () => ({ content: { columns: [{ key: "title" }], rows: [{ title: "Hello" }] } }), go() {}, reloads: true });
      const okFields = [{ field: "ok", type: "boolean", value: false }];
      Sutram.kits.forms({ forms: () => [{ id: "contact", fields: okFields }], read: (f, x) => x.now ?? false, write(f, x, v) { x.now = v; }, submit() {}, reloads: false });
      Sutram.initialized();
      const rows = await Sutram.registry.run("listing rows");
      const set = await Sutram.registry.run("form set", { form: "contact", field: "ok", value: "yes" });
      const page = await Sutram.registry.run("page status");
      const user = await Sutram.registry.run("user status");
      const messages = await Sutram.registry.run("messages status");
      const events = await Sutram.registry.run("events recent");
      const exec = await Sutram.exec("page status\\nform get contact ok --json=value");
      console.log(JSON.stringify({ exec: exec.text, page: page.text, user: user.text, messages: messages.data.messages, rows: rows.data.rows, set: set.data.to, events: events.data.events.map((e) => e.name) }));
    `));
    assert.equal(out.exec, '› page status\n"Docs".\n› form get contact ok --json=value\n{\n  "value": true\n}', min);
    assert.equal(out.page, '"Docs".', min);
    assert.equal(out.user, "Logged in as ada.", min);
    assert.deepEqual(out.messages, [{ type: "status", text: "Saved." }], min);
    assert.deepEqual(out.events, ["message.shown"], min);
    assert.deepEqual(out.rows, [{ title: "Hello" }], min);
    assert.equal(out.set, true, min);
  }
});

test("package.json: side effects bundlers must keep, and the changelog ships", async () => {
  const { readFileSync } = await import("node:fs");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const kits = ["nav", "page", "user", "messages", "lists", "forms"].flatMap((k) => [`./dist/${k}.js`, `./dist/${k}.min.js`]);
  assert.deepEqual(pkg.sideEffects, ["./src/browser.js", "./dist/sutram.js", "./dist/sutram.min.js", ...kits]);
  assert.ok(pkg.files.includes("CHANGELOG.md"), "the changelog ships");
});

test("scripts avoid import.meta.dirname, which Node 20 before 20.11 lacks", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  for (const file of readdirSync(new URL("../scripts/", import.meta.url)).filter((f) => f.endsWith(".mjs"))) {
    assert.doesNotMatch(readFileSync(new URL(`../scripts/${file}`, import.meta.url), "utf8"), /import\.meta\.(dirname|filename)/, file);
  }
});
