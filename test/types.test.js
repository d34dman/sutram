import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Every runtime export has a declaration, so types/ cannot fall behind src/.
const declared = (file) => new Set([...readFileSync(new URL(`../types/${file}`, import.meta.url), "utf8")
  .matchAll(/^export declare (?:function|const|class) (\w+)/gm)].map((m) => m[1]));

for (const [entry, file] of [["index", "index.d.ts"], ["client", "client.d.ts"], ["internals", "internals.d.ts"], ["console", "console.d.ts"], ["webmcp", "webmcp.d.ts"], ["events", "events.d.ts"]]) {
  test(`types/${file} declares every export of src/${entry}.js`, async () => {
    const mod = await import(`../src/${entry}.js`);
    const names = declared(file);
    assert.deepEqual(Object.keys(mod).filter((k) => !names.has(k)), []);
  });
}
