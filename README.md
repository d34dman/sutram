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
- **Small and dependency-free.** Plain ES modules, about 110 kB unminified
  (32 kB gzipped), no runtime dependencies, TypeScript declarations included.

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

TypeScript declarations ship with the package (`types/`), for every entry
point and for `globalThis.Sutram`.

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
| `@d34dman/sutram/console` | `<sutram-console>`, the console, as a web component: a drop-down for the page, or inline in your own panel | yes |
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
  suggest: (key, partial) =>               // optional: values for Tab completion
    key === "sku" ? catalog.search(partial).map((p) => ({ value: p.sku, description: p.name })) : [],
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

`suggest(key, partial, { input, signal })` offers values for an argument
when someone presses <kbd>Tab</kbd>. It may be async, and returns strings or
`{ value, label?, description? }`. Sutram completes command names, options,
`enum` values, booleans and JSON Schema `examples` by itself.

### Tell people where things stand: `<provider> status`

Give each provider a read-only `<provider> status` command that returns a
one-line `text`. A bare `status` runs all of them, so a person or an agent
can see the state of the whole page with one word.

### Annotations

Annotations are hints. Clients decide what to do with them.

| Annotation | Means | The console | Agents |
|---|---|---|---|
| *(none)* | An ordinary change | Runs it | Can call it, unless the page asks first (see below) |
| `readOnly: true` | Changes nothing | Runs it; marks it read-only | Get `readOnlyHint` |
| `consequential: true` | Significant or hard to undo | Asks first (a pasted batch asks once) | Get `consequentialHint`; the page asks the user first |
| `navigates: true` | Leaves the page | Runs it | Told in the description that the page reloads |
| `untrustedContent: true` | Its output contains text from outside, such as user content | | Get `untrustedContentHint` |

Use `confirm: (input) => "Place an order for 2 items?"` to word the question
for a consequential command.

### Who is asked first: the policy

Annotations describe a command; the page's policy decides who has to agree
before it runs. There are two kinds of caller, a person at the console and
an agent, and three levels:

| Level | Asks before |
|---|---|
| `"none"` | nothing |
| `"consequential"` (the default for both) | consequential commands |
| `"changes"` | every command that is not read-only |

```js
// An editor where an agent never changes the document unseen,
// while people at the console are only asked about consequential commands:
getRegistry().policy.set({ agent: "changes" });
```

When an agent needs approval, the console shows the commands it wants to run
and asks. With `"changes"`, the user can answer *Yes, and stop asking*,
which lowers that caller to `"consequential"` for the rest of the page's
life; it never covers a consequential command. To ask in your own dialog,
call `policy.setAsker(async ({ who, steps }) => true | false | "always")`.
Without a console or an asker, the browser's `confirm()` asks. App code that
calls `registry.run()` is never asked.

### Batches: several commands as one change

A pasted block, a multi-line entry and an agent's `sutram_batch` call each
run as one batch. Every line is checked before any runs, so a batch with a
typo runs nothing; the user is asked at most once; and the batch stops at the
first command that fails. A provider can make a batch one change, such as
one undo step, with batch hooks:

```js
registry.defineBatch("editor", {
  begin: () => history.startTransaction(),    // before the provider's first command in the batch
  commit: () => history.commitTransaction(),  // every command succeeded
  rollback: () => history.cancelTransaction(), // one failed: undo the provider's earlier commands
});
```

Providers without hooks keep what their earlier commands did, and the
console says so. App code can run a batch too:
`registry.batch([{ name: "cart add", input: { sku: "V60" } }, …])`, or
`registry.startBatch()` to run commands one by one and `commit()` or
`rollback()` at the end.

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
`<provider> status` at once, so an agent can start there, and
`sutram_batch` runs several tools as one change:
`{ calls: [{ tool: "cart_add", input: { sku: "V60" } }, …] }`.

WebMCP decides which sites' tools an agent may see, not whether a call may
change the user's page, so every call goes through the page's policy first
(see [Who is asked first](#who-is-asked-first-the-policy)).

Agents cannot be notified, so they poll for what changed:
`events recent --since=<id>` returns the events after an id. The page keeps
the last 50 and forgets older ones when a `navigates` command leaves the page.
Single-page apps that change page without such a command call
`getEvents().clear()` themselves.

### Without WebMCP: headless browsers, tests and scripts

Code that can run JavaScript in the page gets the same tools from
`window.Sutram`, with no console and no WebMCP. That covers Playwright,
Puppeteer, raw Chrome DevTools Protocol, and agents that drive a browser:

```js
// Playwright; Puppeteer and CDP work the same way
const tools = await page.evaluate(() => Sutram.tools());
// → [{ name: "sutram_status", … }, { name: "cart_add", description, inputSchema, annotations }, …]

await page.evaluate(() => Sutram.call("cart_add", { sku: "V60-02", qty: 2 }));
// → { code: 0, text: "Added 2 × V60 dripper…", data: { count: 2, total: 48 } }

await page.evaluate(() => Sutram.call("checkout"));
// → { code: 130, message: "checkout is consequential, so it did not run. Ask the user …" }
await page.evaluate(() => Sutram.call("checkout", {}, { confirmed: true }));
```

`tools()` is the list a WebMCP agent gets. `call()` takes the tool name and
follows the page's policy like a careful host: a tool that needs approval
(by default, a consequential one) runs only with `{ confirmed: true }`,
which says the user agreed. Results and exit codes are
the same as everywhere else. App code that needs no asking, such as the
page's own buttons, calls `Sutram.registry.run("cart add", …)` with the
command name.

### Without browser access: a chat assistant

An assistant such as ChatGPT or Claude can still drive the page through a
person. Give it `Sutram.agentPrompt(task)`, paste the command lines it
answers with into the console, and paste the output back:

```js
const prompt = Sutram.agentPrompt("Buy two V60 drippers, then check out.");
// → "You are helping me use a web page through Sutram, … My task: Buy two V60 drippers, then check out."
```

The prompt is generic, like a skill: it lists no commands. The assistant
starts with `help` and `status`, reads `man <command>` when it needs more,
and runs `help` again when the page's state changes. One text works on
every page and never goes out of date. In the browser it names the page
(`document.title` and `location.href`). Pass `{ title, url }` as the second
argument to name it yourself, or import `agentPrompt` from the package,
which has no DOM. [The website](https://d34dman.github.io/sutram/#assist)
uses it.

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
| <kbd>Tab</kbd> | Complete a command, an option or a value; with several choices, a list opens (<kbd>Tab</kbd> or ↑ / ↓ to choose, <kbd>Enter</kbd> to take one, <kbd>Esc</kbd> to close it) |
| ↑ / ↓ | Walk through history |
| <kbd>Enter</kbd> inside quotes | Start a new line of the value, for multi-line text such as a prompt |
| <kbd>Shift</kbd>+<kbd>Enter</kbd> | Start a new line; several lines run as one batch |
| Paste several lines | Run them as one batch (see [Batches](#batches-several-commands-as-one-change)). Pasted inside open quotes, they become part of the value instead. |
| *Copy* (top bar) | Copy the output as text, for example to paste back to a chat assistant |

`mountConsole({ greeting, locale })` sets a first line and the locale values
are shown in. Restyle it with CSS custom properties on `sutram-console`:

```css
sutram-console {
  --sutram-bg: #11131c;  --sutram-fg: #e6e8f0;  --sutram-dim: #8c93a8;
  --sutram-accent: #9aa2ff;  --sutram-option: #7dcfff;  --sutram-string: #c3e88d;
  --sutram-ok: #6fd69a;  --sutram-warn: #f5a35c;  --sutram-err: #ff7b7b;
  --sutram-font: ui-monospace, monospace;  --sutram-font-size: 13px;  --sutram-height: 55vh;
}
```

Parts can be styled with `::part()`: `panel`, `header`, `output`, `menu` and
`prompt`. For example, `sutram-console::part(header) { display: none; }`
hides the top bar.

### In your own panel

Give `mountConsole()` a container, and it adds an inline console there
instead of the drop-down: it fills the container, has no hotkey and no close
button, and the app decides when to show it.

```js
const el = mountConsole({ greeting: "Type help." }, document.querySelector("#editor-console"));
```

### In other languages

Every text the console shows of its own is in `MESSAGES`. Assign the ones you
translate; texts that take values are functions:

```js
el.messages = {
  placeholder: "Befehl eingeben oder help",
  count: (n) => `${n} Befehle auf dieser Seite`,
  yes: "Ja", no: "Nein",
};
```

What commands print is theirs to translate. `help` and `man` are still in
English.

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

Version 0.3: early. The command contract may still change before 1.0; breaking
changes bump the minor version until then.

## License

Dual-licensed: use Sutram under the [MIT License](LICENSE-MIT) or the
[GNU GPL, version 2 or later](LICENSE-GPL-2.0), whichever suits your project
(`MIT OR GPL-2.0-or-later`). MIT fits most JavaScript projects; GPL fits
Drupal and other GPL software. Version 0.2.0 on npm was published under
GPL-2.0-or-later only.
