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

  const bundle = await import(join(dir, "dist/sutram.js"));
  assert.deepEqual(Object.keys(api).filter((k) => !(k in bundle)), []);
  for (const entry of ["events", "webmcp", "console"]) {
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
  const result = await bundle.default.run("build check", {});
  assert.equal(result.text, "hello");
  assert.ok(bundle.default.tools().some((t) => t.name === "build_check"));
  assert.equal((await bundle.default.call("build_check")).text, "hello");
});
