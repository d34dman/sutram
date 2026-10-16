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
    "https://cdn.jsdelivr.net/npm/@d34dman/sutram@0.3/dist/sutram.js";

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

Open the browser's developer tools and run:

```js
Sutram.tools()
// → [
//     { name: "sutram_status", … },
//     { name: "sutram_batch", … },
//     {
//       name: "hello_world",
//       description: "Say hello.",
//       inputSchema: {…},
//       annotations: { readOnlyHint: true },
//     },
//   ]

await Sutram.call("hello_world", { who: "Ada" })
// → { code: 0, text: "Hello, Ada." }
```

That is the list an agent gets through WebMCP, and the call a headless
browser or a test makes. In a browser with WebMCP, the command is already
registered as a tool.

## 4. A chat assistant

No WebMCP and no browser automation? Copy a prompt for ChatGPT or Claude:

```js
copy(Sutram.agentPrompt("Greet Ada, then Grace."))
```

Paste it into the chat. The assistant answers with command lines; paste them
into the console, and paste what it prints back into the chat.

## Next

- [Write a provider](guides/write-a-provider.md): a real set of commands,
  with status, output schemas and a consequential command.
- [Why commands](why.md): why this is better than one big schema.
- [Install](install.md): npm and bundlers.
