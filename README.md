# Sutram

[![npm](https://img.shields.io/npm/v/@d34dman/sutram)](https://www.npmjs.com/package/@d34dman/sutram)
[![test](https://github.com/d34dman/sutram/actions/workflows/test.yml/badge.svg)](https://github.com/d34dman/sutram/actions/workflows/test.yml)
[![license: MIT OR GPL-2.0-or-later](https://img.shields.io/badge/license-MIT%20OR%20GPL--2.0--or--later-blue)](LICENSE)

**One set of commands for your web app: people type them, AI agents call them.**
[Try it live →](https://d34dman.github.io/sutram/)

Sutram turns what your web app can do into commands. WebMCP is how a page
hands tools to an agent; Sutram decides what those tools are. Every part of
the app (a form, the navigation, a module) registers its commands in one
registry, the same way. Register a command once, and it is there for
everyone:

- **Agents** get it as a [WebMCP](https://github.com/webmachinelearning/webmcp)
  tool, or call it from JavaScript with `Sutram.call()`.
- **People** type it into a terminal-like console. Agents can type there too,
  so you watch every command they run.

```text
› help
cart add <sku> [qty]  Add a product to the cart
cart status           Show what is in the cart  [read-only]
checkout              Place the order  [consequential]

› cart add V60-02 --qty=2
Added 2 × V60 dripper, size 02. The cart has 2 items, €48.00.

› checkout
Place an order for 2 items, €48.00? [Yes] [No]
```

## Why use it

- **No clicking around.** An agent runs one short command instead of reading
  screenshots and hunting for buttons.
- **The user's own session.** Commands run in the browser, as the logged-in
  user. No new API, no new login, no new way into your server.
- **Asks before it matters.** Commands that are hard to undo ask the person
  first. (An agent typing into the console could answer for them: see
  [the console](docs/guides/console.md).)
- **Feels like a terminal.** `help`, `man`, Tab completion, history and
  "did you mean". You write no help pages.
- **Small.** No dependencies, about 37 kB minified and gzipped, TypeScript types
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
  import Sutram from "https://cdn.jsdelivr.net/npm/@d34dman/sutram@0.8/dist/sutram.js";

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

```text
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

```text
form fields node-article-form
form set node-article-form title "Pour-over, step by step"
form submit node-article-form
```

When something is wrong, the error names the field and the fix, so the agent
corrects one value instead of starting over.

On the Drupal demo, Claude Code built a Canvas page with half the task
tokens and 7 fewer calls (21 instead of 28) than the same agent without
Sutram, and edited an article in 11 calls instead of 14. One run each, so a
direction, not a benchmark. See [Why commands](docs/why.md) and the
[measurements](docs/measurements.md).

## Why not just WebMCP?

WebMCP lets a page hand tools to an agent. It does not say which tools, how
they are named, or how many parts of an app share one page. Sutram is that
layer, and WebMCP is one of the ways out of it.

- **Many providers, one page.** On a Drupal page a dozen modules may each want
  to expose something. With plain WebMCP each registers its own tools, with
  its own names. With Sutram they share one registry and one command grammar.
- **People see what agents see.** WebMCP tools are invisible to people. Every
  Sutram command is also a line in the console, so you can type exactly what
  the agent would call, watch what it runs, and paste it into a bug report.
- **Few tools, stable list.** One command takes the thing on the page as an
  argument: `form set <form> …` is the tool `form_set` for every form, not one
  tool per form. Commands look up their target when they run and answer "not
  on this page" when it is gone, so the tool list stays put.
- **What WebMCP leaves out.** Discovery (`help`, `man`, status), errors that
  name the fix, changes to wait for (`events wait`) or poll (`events recent`), and app-defined formats.
  What WebMCP has no field for, like what a command returns or that it leaves
  the page, goes into the tool description.
- **Works before WebMCP does.** Browser agents, tests and Claude Code use the
  commands today through `Sutram.call()` or the console. Browsers with WebMCP
  get native tools, and your code does not change when support arrives.

Sutram registers its tools through WebMCP's own `registerTool()`, and it never
reads or changes the page's HTML: your app's JavaScript says what the commands
are. It does not replace Playwright or browser agents either. They drive the
browser; Sutram gives them commands to call instead of buttons to click.

For one app with a few fixed actions, plain WebMCP is enough. Sutram earns its
place when several parts of an app share a page, or when people should use the
same commands as the agent.

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

## Status and versions

Version 0.8, early. Sutram follows [semantic versioning](https://semver.org/)
for its JavaScript API: `register()` and command definitions, the kits'
adapters, annotations, the policy, exit codes, the result envelope
(`{ code, text, data }` or `{ code, message }`), the entry points and their
types. Until 1.0, a breaking change there bumps the minor version (0.8 → 0.9).

The commands themselves are not part of that promise: the kits' command
names, their parameters, what they print and return in `data`, and the
WebMCP tool descriptions. Agents learn them on every page (`help`, `man`, the
tool list), so they may change in any release when that makes them work
better. We try not to, and the [changelog](CHANGELOG.md) lists every change
under *Commands*. Code that hard-codes command lines, such as tests that use
`Sutram.call()` or `Sutram.exec()`, should pin a version.

## License

Your choice of [MIT](LICENSE-MIT) or [GPL 2.0 or later](LICENSE-GPL-2.0)
(`MIT OR GPL-2.0-or-later`). MIT fits most JavaScript projects; GPL fits
Drupal and other GPL software. Version 0.2.0 on npm was GPL only.
