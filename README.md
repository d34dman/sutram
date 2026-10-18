# Sutram

[![npm](https://img.shields.io/npm/v/@d34dman/sutram)](https://www.npmjs.com/package/@d34dman/sutram)
[![test](https://github.com/d34dman/sutram/actions/workflows/test.yml/badge.svg)](https://github.com/d34dman/sutram/actions/workflows/test.yml)
[![license: MIT OR GPL-2.0-or-later](https://img.shields.io/badge/license-MIT%20OR%20GPL--2.0--or--later-blue)](LICENSE)

**Let AI agents use your web app through commands, not clicks.**
[Try it live →](https://d34dman.github.io/sutram/)

Sutram turns what your web app can do into commands. Register a command
once, and it is there for everyone:

- **Agents** get it as a [WebMCP](https://github.com/webmachinelearning/webmcp)
  tool, or call it from JavaScript with `Sutram.call()`.
- **People** type it into a terminal-like console. Agents can type there too,
  so you watch every command they run.

```
› help
cart add <sku> [qty]   Add a product to the cart
cart status            Show what is in the cart          read-only
checkout               Place the order                    consequential
› cart add V60-02 --qty=2
Added 2 × V60 dripper, size 02. The cart has 2 items, €48.00.
› checkout
Place an order for 2 items, €48.00? Yes No
```

## Why use it

- **No clicking around.** An agent runs one short command instead of reading
  screenshots and hunting for buttons.
- **The user's own session.** Commands run in the browser, as the logged-in
  user. No new API, no new login, no new way into your server.
- **Asks before it matters.** Commands that are hard to undo ask the person
  first.
- **Feels like a terminal.** `help`, `man`, Tab completion, history and
  "did you mean". You write no help pages.
- **Small.** No dependencies, 31 kB minified and gzipped, TypeScript types
  included.

## Quick start

Save this as an HTML file, open it in a browser and press <kbd>`</kbd>
(the key left of <kbd>1</kbd>):

```html
<!doctype html>
<meta charset="utf-8">
<title>Hello, Sutram</title>
<p>Press <kbd>`</kbd> and type <code>help</code>.</p>

<script type="module">
  import Sutram from "https://cdn.jsdelivr.net/npm/@d34dman/sutram@0.5/dist/sutram.js";

  Sutram.register({
    name: "hello world",
    provider: "hello",
    description: "Say hello",
    input: {
      type: "object",
      properties: { who: { type: "string", default: "you", description: "Who to greet" } },
    },
    positional: ["who"],
    annotations: { readOnly: true },
    run: ({ who }) => ({ text: `Hello, ${who}.` }),
  });

  Sutram.mountConsole();
</script>
```

Then try:

```
› help
› hello world
› hello world Ada
› hello world --who="Grace Hopper"
› hello world -h
› man hello world
```

## Install

```sh
npm install @d34dman/sutram
```

Other ways in:

- **One file, no build:** load `dist/sutram.js` as a module from a CDN, as in
  the quick start. It sets up the console and WebMCP for you.
- **Drupal:** install the [`drupal/sutram`](https://www.drupal.org/project/sutram)
  module.

See [Install](docs/install.md) for the details.

## Why commands

Without Sutram, an agent reads the page (screenshots, snapshots, HTML), works
out what to click, then reads the page again to see whether it worked. With
Sutram, it reads a short list of commands and runs them:

```sh
form fields node-article-form
form set node-article-form title "Pour-over, step by step"
form save node-article-form
```

When something is wrong, the error names the field and the fix, so the agent
corrects one value instead of starting over.

On Drupal's article form, fixing one wrong value cost an agent about 3,300
tokens by reading the page, and 17 to 44 with Sutram. See
[Why commands](docs/why.md) and the [measurements](docs/measurements.md).

## Documentation

Read it at **[d34dman.github.io/sutram/docs](https://d34dman.github.io/sutram/docs/index.html)**
or in [`docs/`](docs/index.md). Most apps need only these four:

1. [Quick start](docs/quick-start.md): one command in five minutes
2. [Install](docs/install.md): a script tag, npm, or [Drupal](docs/drupal.md)
3. [Write a provider](docs/guides/write-a-provider.md): a real set of commands, with a checklist
4. [Descriptions](docs/guides/descriptions.md) and [errors](docs/guides/errors.md) agents can use

Later, when you need them: [forms](docs/guides/forms.md),
[batches](docs/concepts/batches.md), [formats](docs/concepts/formats.md),
[events](docs/concepts/events.md) and the [API reference](docs/reference/api.md).

## For AI agents

- **Docs as text:** [`llms.txt`](https://d34dman.github.io/sutram/llms.txt)
  and [`llms-full.txt`](https://d34dman.github.io/sutram/llms-full.txt). Every
  docs page is also published as Markdown.
- **Skills**, in [`skills/`](skills/):
  [use a Sutram page](skills/use-sutram-page/SKILL.md) for agents that drive
  a browser, and [add Sutram to an app](skills/add-sutram/SKILL.md) for
  coding agents.
- **A prompt:** `Sutram.agentPrompt(task)` hands a task to an agent that
  drives a browser. The agent opens the console and starts with `help`.

## Develop

```sh
git clone https://github.com/d34dman/sutram.git
cd sutram
npm test              # node --test, no dependencies to install
npm run example       # a todo list to play with, at http://localhost:8080/example/
npm run build         # dist/sutram.js
npm run site          # the website and docs, at http://localhost:8080/site/
npm run docs          # regenerate the generated docs (API, measurements, skill, llms.txt)
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Why "Sutram"

*Sūtram* (सूत्रम्) is Sanskrit for a short, exact rule. Pāṇini described all of
Sanskrit grammar in about 4,000 of them. In Malayalam, *sūtram* (സൂത്രം) is also
everyday speech for a knack, a clever little device. Each command is a sūtram:
one short line in place of clicks and screenshots.

## Status

Version 0.5, early. Until 1.0, the command contract may still change, and
breaking changes bump the minor version (0.5 → 0.6). See the
[changelog](CHANGELOG.md).

## License

Your choice of [MIT](LICENSE-MIT) or [GPL 2.0 or later](LICENSE-GPL-2.0)
(`MIT OR GPL-2.0-or-later`). MIT fits most JavaScript projects; GPL fits
Drupal and other GPL software. Version 0.2.0 on npm was GPL only.
