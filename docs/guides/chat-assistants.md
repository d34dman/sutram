---
title: Chat assistants without browser access
description: Let ChatGPT or Claude drive a page through a person, with agentPrompt() and the console.
---

# Chat assistants without browser access

An assistant such as ChatGPT or Claude can drive a page even when it cannot
see it. It answers with command lines; a person pastes them into the console
and pastes the output back. The [home page](https://d34dman.github.io/sutram/#assist)
does this with the coffee shop.

## The prompt

```js
const prompt = Sutram.agentPrompt("Buy two V60 drippers, then check out.");
```

The prompt is generic, like a skill: it lists no commands. It tells the
assistant to:

- start with `help` and `status`, and read `man <command>` when it needs
  more;
- answer with one code block of command lines;
- read before changing, and expect to be asked about consequential commands;
- look again when commands or fields should have appeared;
- fix the one command that failed instead of starting over.

One text works on every page and never goes out of date as commands come and
go.

In the browser, `Sutram.agentPrompt(task)` names the page with
`document.title` and `location.href`. Pass `{ title, url }` as the second
argument to name it yourself, or import `agentPrompt` from
`@d34dman/sutram`, which has no DOM.

## A button for it

```js
const url = `https://claude.ai/new?q=${encodeURIComponent(Sutram.agentPrompt(task))}`;
// or https://chatgpt.com/?q=…
```

## The loop

1. **Send the prompt.** The assistant starts with `help` and `status`.
2. **Paste its commands into the console.** Press <kbd>`</kbd>, then paste.
   All lines run in order, stop at the first error, and anything
   consequential asks once.
3. **Send back what the console printed.** *Copy* in the console's top bar
   copies the output. Repeat until it is done.

## The same rules for browser agents

Agents that drive a browser get the same rules from the "use a Sutram page"
skill in the package's `skills/` folder. Both are built from one list,
`DISCOVERY_RULES` in `src/prompt.js`, so they never disagree.
