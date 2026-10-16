---
title: Quick start
description: Register one command, use it in the console, and call it the way an agent does.
---

# Quick start

## 1. One command

Save this as an HTML file and open it in a browser:

```html
<!doctype html>
<meta charset="utf-8">
<title>Hello, Sutram</title>
<p>Press <kbd>`</kbd> and type <code>help</code>.</p>

<script type="module">
  import Sutram from
    "https://cdn.jsdelivr.net/npm/@d34dman/sutram@0.4/dist/sutram.js";

  Sutram.register({
    name: "hello world",
    provider: "hello",
    description: "Say hello",
    input: {
      type: "object",
      properties: {
        who: { type: "string", default: "you", description: "Who to greet" },
      },
    },
    positional: ["who"],
    annotations: { readOnly: true },
    run: ({ who }) => ({ text: `Hello, ${who}.` }),
  });

  Sutram.mountConsole();
</script>
```

A command is a name, a JSON Schema for its input, annotations, and a function.
`provider` says who owns it; `help` groups commands by it.

## 2. The console

Press <kbd>`</kbd> (backtick) and try:

```
› help
› hello world
› hello world Ada
› hello world --who="Grace Hopper"
› hello world -h
› man hello world
```

You wrote no help text and no parser. `help`, `man`, `-h`, option parsing,
completion with <kbd>Tab</kbd>, and "did you mean" come from the definition.

## 3. What an agent sees

There is nothing more to set up. In a browser with WebMCP, `hello_world` is
already a tool. To see it the way an agent does, open the browser's developer
tools and run:

```js
await Sutram.call("hello_world", { who: "Ada" })
// → { code: 0, text: "Hello, Ada." }

Sutram.tools()
// → [ …, { name: "hello_world", description: "Say hello.",
//          inputSchema: {…}, annotations: { readOnlyHint: true } } ]
```

`Sutram.call()` is also how a headless browser, a browser agent or a test
calls your commands. The list starts with two tools of Sutram's own,
`sutram_status` and `sutram_batch`; you don't need to do anything for them.

## Next

- Write the commands for one part of your app:
  [Write a provider](guides/write-a-provider.md).
- Using npm and a bundler: [Install](install.md). On Drupal: [Drupal](drupal.md).
- Hand a task to Claude Code or another agent that drives a browser:
  [Hand a task to a browser agent](guides/agent-prompt.md).
