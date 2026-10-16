import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { DISCOVERY_RULES } from "../src/prompt.js";

const root = new URL("..", import.meta.url);

// The generated docs (API reference, measurements, the use-a-page skill,
// llms.txt) are committed; this fails when one is out of date.
test("generated docs are up to date (npm run docs)", () => {
  execFileSync(process.execPath, ["scripts/docs.mjs", "--check"], { cwd: root, stdio: "pipe" });
});

test("the use-a-page skill carries every discovery rule", () => {
  const skill = readFileSync(new URL("skills/use-sutram-page/SKILL.md", root), "utf8");
  for (const rule of DISCOVERY_RULES) assert.ok(skill.includes(rule), rule.slice(0, 40));
});
