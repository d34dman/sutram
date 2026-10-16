---
title: Documentation
description: Sutram lets AI agents use your web app through commands. Start here.
---

# Sutram documentation

Sutram lets a web app expose what it can do as commands. Register a command
once, and agents reach it however they reach the page: as a WebMCP tool, from
JavaScript in a headless browser, typed into the page's console, or through a
chat assistant and a person pasting command lines. People can use the same
console.

## Start

- [Why commands](why.md): why small commands beat one big schema, with
  [measurements](measurements.md).
- [Quick start](quick-start.md): one command, the console, and an agent's view
  of it, in five minutes.
- [Install](install.md): npm, one script tag, or Drupal.

## Concepts

- [Commands and providers](concepts/commands.md)
- [Discovery: help, man, status](concepts/discovery.md)
- [Annotations and the policy](concepts/annotations-and-policy.md)
- [Batches](concepts/batches.md)
- [Results and exit codes](concepts/results.md)
- [Formats](concepts/formats.md)
- [Events](concepts/events.md)

## Guides

- [Write a provider](guides/write-a-provider.md)
- [Forms](guides/forms.md)
- [Drafts and saving](guides/drafts-and-saving.md)
- [Errors that help agents](guides/errors.md)
- [Write descriptions agents can use](guides/descriptions.md)
- [Test with Playwright](guides/testing.md)
- [Chat assistants without browser access](guides/chat-assistants.md)
- [WebMCP](guides/webmcp.md)
- [The console](guides/console.md)

## Reference

- [API](reference/api.md), generated from the TypeScript declarations
- [The command line](reference/command-line.md): grammar, options, exit codes,
  reserved words

## More

- [Drupal](drupal.md)
- [Design notes](https://d34dman.github.io/sutram/docs/design.md), for contributors
- For agents: [llms.txt](https://d34dman.github.io/sutram/llms.txt), and the
  skills in the package's `skills/` folder
