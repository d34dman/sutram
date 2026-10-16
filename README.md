# Sutram

[![npm](https://img.shields.io/npm/v/@d34dman/sutram)](https://www.npmjs.com/package/@d34dman/sutram)
[![test](https://github.com/d34dman/sutram/actions/workflows/test.yml/badge.svg)](https://github.com/d34dman/sutram/actions/workflows/test.yml)
[![license: MIT OR GPL-2.0-or-later](https://img.shields.io/badge/license-MIT%20OR%20GPL--2.0--or--later-blue)](LICENSE)

**Let AI agents use your web app through commands, not clicks.**
[Try it live →](https://d34dman.github.io/sutram/)

Sutram is a standard way for a web app to expose what it can do as commands.
Register them once, and agents reach them however they reach the page:

- as tools through [WebMCP](https://github.com/webmachinelearning/webmcp), in
  browsers that have it;
- from JavaScript, with `Sutram.tools()` and `Sutram.call()`, in a headless
  browser, a test, or an agent that drives a browser;
- by typing into a terminal-like console, which people can use too;
- through a chat assistant, which answers with command lines a person pastes
  into the console.

You write no console, no help pages and no agent integration.

```
› help
cart add <sku> [qty]   Add a product to the cart
cart status            Show what is in the cart          read-only
checkout               Place the order                    consequential
› cart add V60-02 --qty=2
Added 2 × V60 dripper, size 02. The cart has 2 items, €48.00.
› cart status
SKU     NAME                  QTY   PRICE
V60-02  V60 dripper, size 02    2  €24.00
› checkout
Place an order for 2 items, €48.00? Yes No
```

- **Feels like a terminal.** `help`, `man`, `--json`, GNU-style options,
  history with ↑, Tab completion, "did you mean", and syntax highlighting
  as you type.
- **Agents see what people see.** Every command is also a tool, with its JSON
  Schema and hints such as "read-only" or "ask first", with or without WebMCP.
- **No new way into your server.** Commands run in the browser with the
  user's own session, so they can do exactly what the user could already do.
- **Small and dependency-free.** Plain ES modules, or one file of about
  148 kB (45 kB gzipped; minified 107 kB, 31 kB gzipped), no runtime
  dependencies, TypeScript declarations included.

## Quick start

Save this as an HTML file, open it, and press <kbd>`</kbd> (backtick):

```html
<!doctype html>
<meta charset="utf-8">
<title>Hello, Sutram</title>
<p>Press <kbd>`</kbd> and type <code>help</code>.</p>

<script type="module">
  import Sutram from "https://cdn.jsdelivr.net/npm/@d34dman/sutram@0.3/dist/sutram.js";

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

Or load one file, `dist/sutram.js`, as a module: it sets up the console and
WebMCP and exposes everything as `globalThis.Sutram`. For Drupal, use the
[`drupal/sutram`](https://www.drupal.org/project/sutram) module. TypeScript
declarations are included. See [Install](docs/install.md).

## Why commands

Without Sutram, an agent reads the page (screenshots, snapshots, HTML), works
out which elements to click, and reads the page again to see whether it
worked. Sutram gives every part of the app (forms, navigation, editors,
modules) one standard way to hook in, and gives agents one short list of
commands:

```sh
form node-article-form fields
form node-article-form set title "Pour-over, step by step"
form node-article-form set status false
form node-article-form save
```

- **In the user's session:** the person logs in, the agent takes over, and
  it can do exactly what the person could. No new API, no extra login.
- **The same everywhere:** headless browser, WebMCP, JavaScript in the page,
  or a chat assistant: the same commands, the same answers.
- **Errors to act on:** a failure names the field and the fix. The agent
  corrects one value, whether it sent one field or the whole form at once.
- **Forms that change:** `fields` lists fields the page hides behind toggles,
  and results say which fields appeared.

Measured on Drupal's article form: reading the page costs a browser agent
2.5 to 5 times more than reading Sutram's commands, and correcting one wrong
value costs about 3,300 tokens without Sutram against 17 to 44 with it. Read
[Why commands](docs/why.md) and the [measurements](docs/measurements.md).

## Documentation

**[d34dman.github.io/sutram/docs](https://d34dman.github.io/sutram/docs/index.html)**, also in [`docs/`](docs/index.md):

- Start: [Why commands](docs/why.md) · [Quick start](docs/quick-start.md) · [Install](docs/install.md)
- Concepts: [Commands and providers](docs/concepts/commands.md) ·
  [Discovery](docs/concepts/discovery.md) ·
  [Annotations and the policy](docs/concepts/annotations-and-policy.md) ·
  [Batches](docs/concepts/batches.md) · [Results and exit codes](docs/concepts/results.md) ·
  [Formats](docs/concepts/formats.md) · [Events](docs/concepts/events.md)
- Guides: [Write a provider](docs/guides/write-a-provider.md) · [Forms](docs/guides/forms.md) ·
  [Drafts and saving](docs/guides/drafts-and-saving.md) · [Errors](docs/guides/errors.md) ·
  [Descriptions agents can use](docs/guides/descriptions.md) · [Testing](docs/guides/testing.md) ·
  [Chat assistants](docs/guides/chat-assistants.md) · [WebMCP](docs/guides/webmcp.md) ·
  [The console](docs/guides/console.md)
- Reference: [API](docs/reference/api.md) · [The command line](docs/reference/command-line.md) · [Drupal](docs/drupal.md)

## For AI agents

- [`llms.txt`](https://d34dman.github.io/sutram/llms.txt) and
  [`llms-full.txt`](https://d34dman.github.io/sutram/llms-full.txt); every
  docs page is also published as Markdown.
- Skills, in the package's [`skills/`](skills/) folder:
  [use a Sutram page](skills/use-sutram-page/SKILL.md) (for agents that drive
  a browser) and [add Sutram to an app](skills/add-sutram/SKILL.md) (for
  coding agents).
- `Sutram.agentPrompt(task)`: a generic prompt for a chat assistant without
  browser access. It lists no commands; the assistant finds them with `help`.

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

See [CONTRIBUTING.md](CONTRIBUTING.md). [docs/design.md](docs/design.md) is
the first design note; parts of it have changed since.

## Why "Sutram"

*Sūtram* (सूत्रम्) is Sanskrit for a short, exact rule. Pāṇini described all of
Sanskrit grammar in about 4,000 of them. In Malayalam, *sūtram* (സൂത്രം) is also
everyday speech for a knack, a clever little device. Each command is a sūtram:
one short line in place of clicks and screenshots.

## Status

Version 0.3: early. See the [changelog](CHANGELOG.md). The command contract may still change before 1.0; breaking
changes bump the minor version until then.

## License

Dual-licensed: use Sutram under the [MIT License](LICENSE-MIT) or the
[GNU GPL, version 2 or later](LICENSE-GPL-2.0), whichever suits your project
(`MIT OR GPL-2.0-or-later`). MIT fits most JavaScript projects; GPL fits
Drupal and other GPL software. Version 0.2.0 on npm was published under
GPL-2.0-or-later only.
