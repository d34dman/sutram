import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Every runtime export has a declaration, so types/ cannot fall behind src/.
const declared = (file) => new Set([...readFileSync(new URL(`../types/${file}`, import.meta.url), "utf8")
  .matchAll(/^export declare (?:function|const|class) (\w+)/gm)].map((m) => m[1]));

for (const [entry, file] of [["index", "index.d.ts"], ["client", "client.d.ts"], ["internals", "internals.d.ts"], ["console", "console.d.ts"], ["webmcp", "webmcp.d.ts"], ["events", "events.d.ts"], ["nav", "nav.d.ts"], ["page", "page.d.ts"], ["user", "user.d.ts"], ["messages", "messages.d.ts"]]) {
  test(`types/${file} declares every export of src/${entry}.js`, async () => {
    const mod = await import(`../src/${entry}.js`);
    const names = declared(file);
    assert.deepEqual(Object.keys(mod).filter((k) => !names.has(k)), []);
  });
}

test("types/dist.d.ts covers what the dist bundle exports, and package.json maps both bundles to it", async () => {
  const text = readFileSync(new URL("../types/dist.d.ts", import.meta.url), "utf8");
  const reexported = [...text.matchAll(/^export \* from "\.\/(\w+)\.js";/gm)].map((m) => m[1]);
  assert.deepEqual(reexported, ["index", "client", "events", "webmcp", "console"]);
  assert.match(text, /^export \{ default \} from "\.\/browser\.js";/m);
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  for (const entry of ["./dist/sutram.js", "./dist/sutram.min.js"]) assert.equal(pkg.exports[entry].types, "./types/dist.d.ts");
  // The bundle exports exactly the entries' exports, plus the default.
  const names = new Set();
  for (const entry of reexported) for (const k of Object.keys(await import(`../src/${entry}.js`))) names.add(k);
  const declared = (file) => [...readFileSync(new URL(`../types/${file}`, import.meta.url), "utf8").matchAll(/^export declare (?:function|const|class) (\w+)/gm)].map((m) => m[1]);
  const covered = new Set(reexported.flatMap((e) => declared(`${e}.d.ts`)));
  assert.deepEqual([...names].filter((k) => !covered.has(k)), []);
});
