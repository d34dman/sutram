---
title: Documentation
description: Sutram lets AI agents use your web app through commands. Start here.
---

# Sutram documentation

Sutram lets a web app expose what it can do as commands. You register a
command once: a name, a JSON Schema for its input, and a function. Agents
can then call it as a WebMCP tool, from JavaScript in a headless browser, or
by typing into the page's console, and people can use the same console.

```js
Sutram.register({
  name: "cart add",
  provider: "cart",
  description: "Add a product to the cart",
  input: {
    type: "object",
    properties: { sku: { type: "string" }, qty: { type: "integer", default: 1 } },
    required: ["sku"],
  },
  annotations: {},
  run: ({ sku, qty }) => cart.add(sku, qty),
});
```

That is all most apps need to write. Help pages, the console, the WebMCP
tools and input checking come from the definition.

## Your path

1. [Quick start](quick-start.md): one command, in an HTML file, in five
   minutes.
2. [Install](install.md): a script tag or npm. On Drupal, use the
   [module](drupal.md).
3. [Write a provider](guides/write-a-provider.md): a real set of commands for
   one part of your app, with a checklist at the end.
4. [Write descriptions agents can use](guides/descriptions.md) and
   [errors that help agents](guides/errors.md): the two things that make the
   biggest difference to how well agents do.

When you want the details of a definition, read
[Commands and providers](concepts/commands.md). To decide which commands ask
the person first, read [Annotations and the policy](concepts/annotations-and-policy.md).

## How agents reach your commands

You don't set these up one by one; loading Sutram does. Read these to see
what agents get.

- [WebMCP](guides/webmcp.md): tools in browsers that support it.
- [The console](guides/console.md): for people, and for agents that type.
- [Chat assistants without browser access](guides/chat-assistants.md).
- [Discovery: help, man, status](concepts/discovery.md).
- [Test with Playwright](guides/testing.md): call your commands the way a
  headless browser does.

## Going further

Only when you need it:

| When | Read |
|---|---|
| Your app has forms an agent should fill in | [Forms](guides/forms.md), [Drafts and saving](guides/drafts-and-saving.md) |
| Several changes should run as one, with one question | [Batches](concepts/batches.md) |
| You want to know what a result looks like, or what an exit code means | [Results and exit codes](concepts/results.md) |
| A value has a domain format, such as money or a date range | [Formats](concepts/formats.md) |
| Agents should hear about things that happen in the app | [Events](concepts/events.md) |

## Reference

- [API](reference/api.md), generated from the TypeScript declarations
- [The command line](reference/command-line.md): grammar, options, exit codes,
  reserved words

## About

- [Why commands](why.md): why small commands beat reading the page, with
  [measurements](measurements.md).
- [Design notes](https://d34dman.github.io/sutram/docs/design.md), for contributors.
- For agents: [llms.txt](https://d34dman.github.io/sutram/llms.txt), and the
  skills in the package's `skills/` folder.
