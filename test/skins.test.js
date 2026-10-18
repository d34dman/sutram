import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const declarations = (css) => Object.fromEntries([...css.matchAll(/(--sutram-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

// The colour tokens the console sets on :host; a skin sets every one of them.
const hostCss = read("src/console.js").match(/:host \{([^}]*)\}/)[1];
const colours = Object.keys(declarations(hostCss)).filter((k) => !/font|radius/.test(k));

test("the light skin sets every colour token of the console", () => {
  const light = declarations(read("skins/light.css"));
  assert.deepEqual(colours.filter((k) => !(k in light)), []);
});

test("the system skin is the light skin, for a light system", () => {
  assert.deepEqual(declarations(read("skins/system.css")), declarations(read("skins/light.css")));
  assert.match(read("skins/system.css"), /@media \(prefers-color-scheme: light\)/);
});
