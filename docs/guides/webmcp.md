---
title: WebMCP
description: What agents see when Sutram registers your commands as WebMCP tools, and how approval works.
---

# WebMCP

[WebMCP](https://github.com/webmachinelearning/webmcp) lets a page offer
tools to an agent in the browser. `connectWebMCP()`, or loading
`dist/sutram.js`, registers every command as a tool in browsers that support
it, and keeps the list in step with the registry.

```js
import { connectWebMCP, findModelContext } from "@d34dman/sutram/webmcp";
connectWebMCP(registry, findModelContext());
```

## What agents get

- **One tool per command.** The name is the command name with underscores:
  `cart add` becomes `cart_add`.
- **The input schema**, and the annotations as hints: `readOnlyHint`,
  `consequentialHint`, `untrustedContentHint`.
- **A description** that says what the command does, what it returns (from
  the output schema), whether it leaves the page, and what any app-defined
  formats mean.
- **`sutram_status`**, which runs every `<provider> status` at once and
  returns `{ code: 0, data: { providers: [{ provider, code, text?, data? }] } }`.
  Agents should call it first.
- **`sutram_batch`**, which runs several tools as one change:
  `{ calls: [{ tool: "cart_add", input: { sku: "V60" } }, …] }`.

When commands are added or removed, the tools follow. If you change a
definition in place, register it again (`registry.register(def)`) so the
tool's hints follow too; otherwise the tool is refreshed at its next call.
A tool the browser refuses is skipped with a warning; the others still
register.

An agent's input is checked strictly: its JSON arrives typed, so `"off"`
for a boolean or `"2"` for an integer is a usage error, not converted as
text typed in the console would be.

## Approval

WebMCP decides which sites' tools an agent may see, not whether a call may
change the user's page. So every call goes through the page's
[policy](../concepts/annotations-and-policy.md) first. When a call needs
approval, the console shows what the agent wants to run and asks the person.
Without a console, the page's asker or the browser's `confirm()` asks. That includes
`sutram_status`: its commands are read-only, but a page may mark one
consequential. When the agent's host cancels a call while the person is
deciding, the question is withdrawn and nothing runs.

## Without WebMCP

Browsers without WebMCP still have every tool: `Sutram.tools()` and
`Sutram.call()` for agents that run JavaScript in the page (see
[Test with Playwright](testing.md)), and the console for agents that type.
[`agentPrompt()`](agent-prompt.md) hands a task to any of them.
