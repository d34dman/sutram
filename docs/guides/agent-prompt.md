---
title: Hand a task to a browser agent
description: One generic prompt, agentPrompt(), that sends an agent with a browser to the page's console.
---

# Hand a task to a browser agent

Sutram's commands run in the page, so an agent needs a browser it can drive:
Claude Code or Codex with Playwright MCP, Claude Desktop, Claude in Chrome,
or a browser with WebMCP. Fetching the URL is not enough. A chat with no
browser tool cannot use the page.
`agentPrompt()` writes the prompt that hands such an agent a task.

## The prompt

```js
const prompt = Sutram.agentPrompt("Buy two V60 drippers, then check out.");
```

The prompt is generic, like a skill: it lists no commands. It tells the
agent to:

- open the page and type into its console, so the person sees every command
  run (WebMCP tools, `Sutram.exec()` and `Sutram.call()` are the fallback);
- start with `help` and `status` instead of guessing, and ask the console
  (`man <command>`, `<command> -h`) whenever it is unsure;
- leave hard-to-undo commands to the person, who is asked to confirm them.

In the browser, `Sutram.agentPrompt(task)` names the page with
`document.title` and `location.href`. Pass `{ title, url }` as the second
argument to name it yourself, or import `agentPrompt` from
`@d34dman/sutram`, which has no DOM.

## From the console

The console's top bar has an *Agent prompt* button. It copies the same
prompt for the page it is on, title and URL filled in, with the task "Show
me what this page can do." The person pastes it into their agent and
changes the task. No code is needed; hide the button with
`sutram-console::part(agent-prompt) { display: none; }`.

## Why the prompt is short

The prompt only says the console exists and to ask it for help. `help`
prints every command and, under them, how to write a line: options,
quoting, multi-line text, what the annotations mean. `man` and the
console's errors cover the rest. So the same prompt works on any page and
does not change when the console does.

## Agents that already know Sutram

An agent that works with Sutram pages often can load the "use a Sutram
page" skill from the package's `skills/` folder instead. It covers the same
ground in more depth, built from `DISCOVERY_RULES` in `src/prompt.js`.
