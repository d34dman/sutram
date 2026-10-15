# Sutram

A standard way for JavaScript apps to expose their commands, so their authors
never have to build or ship a console of their own.

An app registers its commands once. Anyone on the page can then run them: a
person in the Sutram console, or an AI agent such as Claude through WebMCP.
It borrows its behaviour from the command line, so anyone who has used a
terminal already knows their way around.

```
› help
› cart add V60-02 --qty=2
Added 2 × V60 dripper, size 02. The cart has 2 items, €48.00.
› cart status
2 items, €48.00.
SKU     NAME                  QTY   PRICE
V60-02  V60 dripper, size 02    2  €24.00
› cart status --json
› man cart add
› checkout
Place an order for 2 items, €48.00? Yes No
```

## Install

```sh
npm install sutram
```

No build step: the package is plain ES modules. Until it is on npm, install it
from GitHub: `npm install git+ssh://git@github.com/d34dman/sutram.git#main`.

| Import | What it is | DOM |
|---|---|---|
| `sutram` | The registry, the command line parser, and the formatter (`help`, `man`, tables) | no |
| `sutram/events` | Declared events, plus the `events list` and `events recent` commands | no |
| `sutram/webmcp` | Mirrors the registry into `document.modelContext` as WebMCP tools | no |
| `sutram/console` | `<sutram-console>`, a drop-down console as a web component | yes |
| `sutram/browser` | All of the above for pages without a bundler, exposed as `globalThis.Sutram` | yes |

## Register a command

```js
import { getRegistry } from "sutram";

getRegistry().register({
  name: "cart add",                 // <provider> <verb>
  provider: "cart",
  description: "Add a product to the cart",
  input: {                          // JSON Schema
    type: "object",
    properties: {
      sku: { type: "string" },
      qty: { type: "integer", minimum: 1, default: 1 },
    },
    required: ["sku"],
  },
  output: {                         // JSON Schema, for man, tables and agents
    type: "object",
    properties: { count: { type: "integer" }, total: { type: "number", format: "money" } },
  },
  positional: ["sku", "qty"],       // cart add V60-02 2  ==  cart add --sku=V60-02 --qty=2
  annotations: {},                  // readOnly, consequential, untrustedContent, navigates
  examples: ["cart add V60-02 --qty=2"],
  seeAlso: ["cart status"],
  run: ({ sku, qty }, { caller, signal }) => {
    cart.add(sku, qty);
    return { text: `Added ${qty} × ${sku}.`, data: { count: cart.count, total: cart.total } };
  },
});
```

`register()` returns a function that removes the command again. Register
commands when they make sense on the page, and remove them when they no longer
do; every client sees the change.

Each provider should also register a read-only `<provider> status` that
returns a one-line `text`. A bare `status` runs all of them.

### Results

`run()` always resolves to a result that looks like a process exit:

| Code | Means |
|---|---|
| 0 | Done: `{ code: 0, text?, data? }` |
| 1 | Ran, but failed: `{ code: 1, message }`. Throw an error, or a `CommandError` with your own code. |
| 2 | Usage error: input did not match the schema |
| 127 | Command not found |
| 130 | Cancelled through the `AbortSignal` |

Return data, not formatted text. The console formats `data` for people: a
table for a list of records, `key: value` lines for a record, an indented tree
for records with `children`. `--json` prints it unchanged, which is exactly
what an agent gets. `title` and `format` (such as `money` or `date-time`) in
the output schema, and `view: { columns }` on the command, tune the tables.

## Use it on a page

With a bundler:

```js
import { getRegistry } from "sutram";
import { getEvents } from "sutram/events";
import { connectWebMCP } from "sutram/webmcp";
import { mountConsole } from "sutram/console";

connectWebMCP(getRegistry());
mountConsole({ currency: "EUR" });
```

Without one:

```html
<script type="module" src="/libraries/sutram/src/browser.js"></script>
<script type="module">
  Sutram.register({ /* … */ });
  Sutram.mountConsole();
</script>
```

Open the console with <kbd>`</kbd> (outside text fields) or
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>.

Every copy of Sutram on a page shares one registry and one event bus, through
`Symbol.for("sutram.registry@1")` and `Symbol.for("sutram.events@1")`, so
providers that bundle their own copy still meet in one place.

## Try it

```sh
npm test
npm run example   # then open http://localhost:8080/example/
```

## Drupal

The Drupal integration (menus as a `nav` provider, the console for users with
permission, WebMCP) is being built in
[drupal-sutram-demo](https://github.com/d34dman/drupal-sutram-demo), as the
custom module `sutram`. It moves to drupal.org as `drupal/sutram` once it
settles. The earlier Drupal module skeleton is on the `1.0.x` branch.

## Design

- [docs/design.md](docs/design.md): the first design note.
- The [package design page](https://claude.ai/artifact/38pXuBgupPRgDegkiZrZyR)
  (private) supersedes parts of it: `describe` became `status`, `help` and
  `man`; arguments use GNU long options; results have exit codes and declared
  output.

## Why "Sutram"

*Sūtram* (सूत्रम्) is Sanskrit for a short, exact rule. Pāṇini described all of
Sanskrit grammar in about 4,000 of them. In Malayalam, *sūtram* (സൂത്രം) is also
everyday speech for a knack, a clever little device.

## Status

0.1.0, early. The contract may still change. Not published to npm yet.
