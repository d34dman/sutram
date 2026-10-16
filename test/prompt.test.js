import { test } from "node:test";
import assert from "node:assert/strict";
import { agentPrompt } from "../src/index.js";

test("agentPrompt lists no commands: the assistant discovers them", () => {
  const p = agentPrompt("Buy filters", { title: "Brew & Co.", url: "https://example.com/" });
  assert.match(p, /first block is: help, then status/);
  assert.match(p, /fix that one command/);
  assert.match(p, /man <command>/);
  assert.match(p, /The page: Brew & Co\. \(https:\/\/example\.com\/\)/);
  assert.match(p, /My task: Buy filters$/);
});

test("agentPrompt without a page or task", () => {
  const p = agentPrompt();
  assert.doesNotMatch(p, /The page:/);
  assert.match(p, /My task: Show me what this page can do\.$/);
});
