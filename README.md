# Sutram

[![npm](https://img.shields.io/npm/v/@d34dman/sutram)](https://www.npmjs.com/package/@d34dman/sutram)
[![test](https://github.com/d34dman/sutram/actions/workflows/test.yml/badge.svg)](https://github.com/d34dman/sutram/actions/workflows/test.yml)
[![license](https://img.shields.io/github/license/d34dman/sutram)](LICENSE)

**Give your web app a command line, for people and for AI agents.**
[Try it live →](https://d34dman.github.io/sutram/)

Register your app's commands once. Sutram gives people a drop-down console to
run them, and gives AI agents the same commands as tools through
[WebMCP](https://github.com/webmachinelearning/webmcp). You write no console,
no help pages and no agent integration.

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
  history with ↑, "did you mean", and syntax highlighting as you type.
- **Agents see what people see.** Every command is also a WebMCP tool, with
  its JSON Schema and hints such as "read-only" or "ask first".
- **No new way into your server.** Commands run in the browser with the
  user's own session, so they can do exactly what the user could already do.
- **Small and dependency-free.** Plain ES modules, about 60 kB unminified,
  no runtime dependencies.

## Quick start

Save this as an HTML file, open it, and press <kbd>`</kbd> (backtick):

```html
<!doctype html>
<meta charset="utf-8">
<title>Hello, Sutram</title>
<p>Press <kbd>`</kbd> and type <code>help</code>.</p>

<script type="module">
  import Sutram from "https://cdn.jsdelivr.net/npm/@d34dman/sutram@0.2/dist/sutram.js";

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

With a bundler, import what you need:

```js
import { getRegistry } from "@d34dman/sutram";
import { mountConsole } from "@d34dman/sutram/console";
import { connectWebMCP } from "@d34dman/sutram/webmcp";

const registry = getRegistry();
registry.register({ /* a command, see below */ });

mountConsole();              // the console for people
connectWebMCP(registry);     // the same commands as WebMCP tools, where the browser supports it
```

Without a bundler, load one file: `dist/sutram.js` from the package (or from
the CDN, as in the quick start). It sets up the console and WebMCP and exposes
everything as `globalThis.Sutram`:

```html
<script type="module" src="/path/to/sutram.js"></script>
<script type="module">
  Sutram.register({ /* … */ });
  Sutram.mountConsole();
</script>
```

| Import | What it is | Needs a DOM |
|---|---|---|
| `@d34dman/sutram` | The registry, the command line parser and the formatter | no |
| `@d34dman/sutram/console` | `<sutram-console>`, the drop-down console, as a web component | yes |
| `@d34dman/sutram/webmcp` | Mirrors the registry into `document.modelContext` as WebMCP tools | no |
| `@d34dman/sutram/events` | Events your app declares and emits, and the `events list` and `events recent` commands | no |
| `@d34dman/sutram/browser` | All of the above, as `globalThis.Sutram` | yes |
| `@d34dman/sutram/dist/sutram.js` | The same as `browser`, bundled into one file | yes |

## Write a command

A command is a name, a JSON Schema for its input, and a function.

```js
import { getRegistry } from "@d34dman/sutram";

const remove = getRegistry().register({
  name: "cart add",                        // "<provider> <verb>", lowercase words
  provider: "cart",                        // who owns it; help groups by this
  description: "Add a product to the cart",
  input: {                                 // JSON Schema: checked before run() is called
    type: "object",
    properties: {
      sku: { type: "string", description: "Product code" },
      qty: { type: "integer", minimum: 1, default: 1 },
    },
    required: ["sku"],
  },
  positional: ["sku", "qty"],              // cart add V60-02 2  ==  cart add --sku=V60-02 --qty=2
  output: {                                // optional: drives tables, man and agents
    type: "object",
    properties: { count: { type: "integer" }, total: { type: "number" } },
  },
  annotations: {},                         // see "Annotations"
  examples: ["cart add V60-02 --qty=2"],   // shown in man and given to agents
  seeAlso: ["cart status"],
  run: async ({ sku, qty }, { caller, signal }) => {
    await cart.add(sku, qty);              // your app's own code and endpoints
    return { text: `Added ${qty} × ${sku}.`, data: { count: cart.count, total: cart.total } };
  },
});

// Later, when the command no longer makes sense on this page:
remove();
```

Register commands when they make sense on the page, and remove them when they
no longer do. The console, `help` and the agent's tool list follow along.

`run()` gets the checked input, and a context with `caller` (`"console"`,
`"agent"`, …) and an `AbortSignal`. Return `data` (and optionally a short
`text`); the console formats the data for people and agents get it as is.
Throw an error to fail.

### Tell people where things stand: `<provider> status`

Give each provider a read-only `<provider> status` command that returns a
one-line `text`. A bare `status` runs all of them, so a person or an agent
can see the state of the whole page with one word.

### Annotations

Annotations are hints. Clients decide what to do with them.

| Annotation | Means | The console | Agents |
|---|---|---|---|
| *(none)* | An ordinary change | Runs it | Can call it |
| `readOnly: true` | Changes nothing | Runs it; marks it read-only | Get `readOnlyHint` |
| `consequential: true` | Significant or hard to undo | Asks first (a pasted batch asks once) | Get `consequentialHint`; hosts can ask the user |
| `navigates: true` | Leaves the page | Runs it | Told in the description that the page reloads |
| `untrustedContent: true` | Its output contains text from outside, such as user content | | Get `untrustedContentHint` |

Use `confirm: (input) => "Place an order for 2 items?"` to word the question
for a consequential command.

### Results and exit codes

Every run resolves to a result shaped like a process exit, whoever called it:

| Code | Means |
|---|---|
| `0` | Done: `{ code: 0, text?, data? }` |
| `1` | Ran, but failed: `{ code: 1, message }`. Throw an `Error`, or a `CommandError` with your own message. |
| `2` | Usage error: the input did not match the schema |
| `127` | No such command |
| `130` | Cancelled |

### How results look

You return data; the console decides how to show it:

- a list of records becomes a table (pick columns with `view: { columns: [...] }`),
- a record becomes `key: value` lines,
- records with `children` become an indented tree.

Every command also gets these options for free:

| Option | Prints |
|---|---|
| `--json` | The data unchanged, exactly as an agent gets it |
| `--json=sku,price` | Only those fields |
| `--wide` | Every column, including those `view.columns` leaves out |
| `-h`, `--help` | The command's usage |

### Formats: money, sizes, durations

`format` in a schema works as in JSON Schema, where apps define their own
formats. Sutram defines no domain formats; the app that owns the data defines
them, and the console uses them to check input and show values:

```js
import { getFormats } from "@d34dman/sutram";

getFormats().define("money", {
  type: "number",
  description: "an amount in euros",       // for man and agents
  validate: (v) => Number.isFinite(v),     // bad input is a usage error
  display: (v, { locale }) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(v),
  align: "right",                          // in tables
});

// then, in an output schema: total: { type: "number", format: "money" }
```

A format nobody defined is left alone. Names can be defined only once per page,
so two modules cannot disagree about what `money` means. `date-time` and
`date` are shown in the console's locale out of the box.

## For AI agents

`connectWebMCP()` (or loading `dist/sutram.js`) registers every command as a
WebMCP tool in browsers that support it, and keeps the tool list in step with
the registry. Tool names are command names with underscores
(`cart_add`). Each tool gets the input schema and the annotation hints, and
its description says what it returns, whether it leaves the page, and what
any app-defined formats mean. A `sutram_status` tool runs every
`<provider> status` at once, so an agent can start there.

Agents cannot be notified, so they poll for what changed:
`events recent --since=<id>` returns the events after an id. The page keeps
the last 50 and forgets older ones when a `navigates` command leaves the page.
Single-page apps that change page without such a command call
`getEvents().clear()` themselves.

## The console

Open it with <kbd>`</kbd> (outside text fields) or
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>; close it with <kbd>Esc</kbd>.

| Type | To |
|---|---|
| `help`, `help <provider>` | See the commands on this page |
| `man <command>` | Read a command's full manual |
| `<command> -h` | See a command's usage |
| `status` | See every provider's status |
| `clear` | Clear the screen |
| ↑ / ↓ | Walk through history |

`mountConsole({ greeting, locale })` sets a first line and the locale values
are shown in. Restyle it with CSS custom properties on `sutram-console`:

```css
sutram-console {
  --sutram-bg: #11131c;  --sutram-fg: #e6e8f0;  --sutram-dim: #8c93a8;
  --sutram-accent: #9aa2ff;  --sutram-option: #7dcfff;  --sutram-string: #c3e88d;
  --sutram-ok: #6fd69a;  --sutram-warn: #f5a35c;  --sutram-err: #ff7b7b;
}
```

### Several copies on one page

If two scripts each bundle their own copy of Sutram, they still share one
registry, one format registry and one event bus, so every command ends up in
the same console.

## Drupal

The Drupal integration is being built in
[drupal-sutram-demo](https://github.com/d34dman/drupal-sutram-demo) as the
module `sutram`: menus as `nav` commands (access-checked on the server), page
information, and `form <form-id> set/save` commands for node forms. It will
move to drupal.org as `drupal/sutram`.

## Develop

```sh
git clone https://github.com/d34dman/sutram.git
cd sutram
npm test              # node --test, no dependencies to install
npm run example       # a todo list to play with, at http://localhost:8080/example/
npm run build         # dist/sutram.js
npm run site          # the website, at http://localhost:8080/site/
```

[docs/design.md](docs/design.md) is the first design note. Parts of it have
changed since: `describe` became `status`, `help` and `man`; arguments use GNU
long options only; results have exit codes; and formats are defined by apps.

## Why "Sutram"

*Sūtram* (सूत्रम्) is Sanskrit for a short, exact rule. Pāṇini described all of
Sanskrit grammar in about 4,000 of them. In Malayalam, *sūtram* (സൂത്രം) is also
everyday speech for a knack, a clever little device. Each command is a sūtram:
one short line in place of clicks and screenshots.

## Status

Version 0.2: early. The command contract may still change before 1.0; breaking
changes bump the minor version until then.

## License

[MIT](LICENSE). Version 0.2.0 on npm was published under GPL-2.0-or-later;
later versions are MIT.
