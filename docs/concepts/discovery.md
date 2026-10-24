---
title: "Discovery: help, man, status"
description: How people and agents find out what a page can do and what state it is in.
---

# Discovery: help, man, status

An agent that cannot find out what a page offers falls back to screenshots
and guessing. In Sutram, discovery is part of the contract, and all of it is
generated from your command definitions, so it always matches the page.

| Question | Ask | Answer |
|---|---|---|
| What can I do here? | `help`, `help <provider>` | One line per command: usage, description, annotation |
| How does this one work? | `man <command>`, `<command> -h` | Arguments, output, annotations, examples, related commands |
| What state is the page in? | `status` | Every provider's `<provider> status`, at once; `status form page` for only some |
| What values fit here? | <kbd>Tab</kbd>, a command's `suggest` | Completions for names, options and values |

```
› help cart
cart add <sku> [qty]   Add a product to the cart
cart status            Show what is in the cart          [read-only]
```

## Cheap first, details on demand

`help` costs one line per command. `man` is read only for the command the
agent is about to use. `--json=a,b` returns only the fields asked for. This
is why discovering a page through `help` costs about a third of the full tool
list on the Drupal demo (see [Measurements](../measurements.md)).

## Agents without the console

- Through WebMCP or `Sutram.tools()`, an agent gets every command as a tool
  with its schema, plus `sutram_status`. Start with `sutram_status`.
- [`agentPrompt()`](../guides/agent-prompt.md) sends an agent to the
  console and tells it to start with `help` and `status`.

## Look again when things change

Commands come and go with the page's state. A command that runs and changes
what is possible should say so in its result ("The form now also asks for:
invoice, amount"). Agents are told to look again when they expect something
new. The `help` output, the tool list and completion follow the registry
without any work from you.

## The integration ladder

How well a part of the page works with agents depends on how far up this
ladder it goes. Each step is useful on its own.

| Level | The provider… | People and agents get |
|---|---|---|
| 1 · Status | answers `<provider> status` with its current state | Agents can read the page without screenshots |
| 2 · Writable | gets and sets values through its own logic, so the UI stays in sync | Agents can fill it reliably |
| 3 · Commands | adds its own actions, with annotations | `cart add`, `editor clear` |
| 4 · Suggests | offers values for its arguments | Completion for people, real choices for agents |
