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

The prompt tells the agent to:

- open the page and use the first of these it has: the page's WebMCP
  tools, `Sutram.exec()` with command lines, or the console. Tools answer
  as text; the console has to be read off the screen, which costs an agent
  far more. The person sees the commands it runs in the console either way;
- use the page's commands, which the prompt lists as `help` prints them, run
  `status` for the page's state, and ask (`man <command>`, `<command> -h`)
  whenever it is unsure;
- leave hard-to-undo commands to the person: the page asks them, or the
  answer tells the agent to ask first.

In the browser, `Sutram.agentPrompt(task)` names the page with
`document.title` and `location.href` and lists the page's commands. Pass
`{ title, url }` as the second argument to name it yourself. `agentPrompt`
from `@d34dman/sutram` has no DOM: pass `{ title, url, commands }`, where
`commands` is the page's help text, or leave it out and the prompt tells
the agent to start with `help`.

## Your own prompt

A site can ship its own prompt. `Sutram.defineAgentPrompt()` takes a
function of the task and the page, and gets the default prompt as
`page.prompt`, to wrap or to replace:

```js
Sutram.defineAgentPrompt((task, page) =>
  `${page.prompt}\n\nHouse rules: never order more than 100 € without asking me.`);

// or a prompt of its own
Sutram.defineAgentPrompt((task, { url, commands }) =>
  `Open ${url} and use its commands:\n${commands}\n\nTask: ${task}`);
```

The console's prompt button and `Sutram.agentPrompt()` both use it. It
returns a function that brings back the default; a function that throws or
returns no text falls back to the default too.

## From the console

The console's top bar has an *Agent prompt* button. It copies the same
prompt for the page it is on, title and URL filled in, with the task "Show
me what this page can do." The person pastes it into their agent and
changes the task. No code is needed; hide the button with
`sutram-console::part(agent-prompt) { display: none; }`.

## Why the prompt lists the commands

An evaluation on the Drupal demo (October 2026) found that
agents given only "start with help" spent several calls learning the
console before their first change, and that an agent typing into the
console through a browser used more tokens than one that never heard of
Sutram. The prompt now carries the page's `help` (every command with its
usage, and how to write a line) and sends the agent to tools first. `man`
and the errors cover the rest.

## Agents that already know Sutram

An agent that works with Sutram pages often can load the "use a Sutram
page" skill from the package's `skills/` folder instead. It covers the same
ground in more depth, built from `DISCOVERY_RULES` in `src/prompt.js`.
