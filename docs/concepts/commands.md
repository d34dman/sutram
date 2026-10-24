---
title: Commands and providers
description: What a command definition holds, who owns it, and when to register and remove it.
---

# Commands and providers

A command is a name, a JSON Schema for its input, annotations, and a
function. Sutram turns it into a tool for agents and a command line for
people and agents. Your function never knows who called it.

## What you decide

Most commands need only these:

- **`name`**: lowercase words, starting with the part of the app that owns
  it: `cart add`, `cart status`. Agents get it as `cart_add`.
- **`description`**: one line that says what it does. Agents choose
  commands by it, so [write it for them](../guides/descriptions.md).
- **`input`**: a JSON Schema, checked before your function runs. Leave it
  out when there are no arguments.
- **`annotations`**: does it change anything? `{ readOnly: true }` if not,
  `{ consequential: true }` if it is hard to undo (the person is asked
  first), `{}` for an ordinary change.
- **`run`**: your function. Return `{ text, data }`, or throw to fail.

`provider` names the owner too, usually the first word of the name; `help`
groups commands by it. Everything else below is optional.

## Every field

```js
import { getRegistry } from "@d34dman/sutram";

const remove = getRegistry().register({
  // "<provider> <verb>", lowercase words.
  name: "cart add",
  // Who owns it; help groups by this.
  provider: "cart",
  // Optional: a short name for people, in approval prompts and tool lists.
  title: "Add to the cart",
  description: "Add a product to the cart",

  // JSON Schema, checked before run() is called.
  input: {
    type: "object",
    properties: {
      sku: { type: "string", description: "Product code" },
      qty: { type: "integer", minimum: 1, default: 1 },
    },
    required: ["sku"],
  },
  // cart add V60-02 2  is the same as  cart add --sku=V60-02 --qty=2
  positional: ["sku", "qty"],

  // Optional: drives tables, man and agents.
  output: {
    type: "object",
    properties: {
      count: { type: "integer" },
      total: { type: "number" },
    },
  },

  // Required, even when empty.
  annotations: {},
  // Shown in man and given to agents.
  examples: ["cart add V60-02 --qty=2"],
  seeAlso: ["cart status"],

  // Optional: values for Tab completion.
  suggest: (key, partial) => {
    if (key !== "sku") return [];
    return catalog.search(partial).map((p) => ({
      value: p.sku,
      description: p.name,
    }));
  },

  run: async ({ sku, qty }, { caller, signal }) => {
    // Your app's own code and endpoints.
    await cart.add(sku, qty);
    return {
      text: `Added ${qty} × ${sku}.`,
      data: { count: cart.count, total: cart.total },
    };
  },
});
```

## Field reference

| Field | Required | What it is for |
|---|---|---|
| `name` | yes | Lowercase words separated by single spaces. Start with the provider: `cart add`, `form set`. |
| `provider` | yes | Who owns the command. `help <provider>` lists one group. |
| `title` | no | A short name for people, such as "Save a form". WebMCP shows it as the tool's title, and the generic approval question uses it: "Save a form? (form save)". One line. |
| `description` | yes | What it does, in one line first. `help` shows the first line, `man` all of it; agents read all of it. See [descriptions](../guides/descriptions.md). |
| `input` | no | JSON Schema for the input, checked before `run()`. Leave it out for a command with no arguments. Name parameters with one lowercase word (`target`, `limit`), or words joined by `_` (`per_page`); `register()` warns about other names. |
| `annotations` | yes | Hints such as `readOnly` and `consequential`. See [annotations](annotations-and-policy.md). |
| `positional` | no | Input keys that can be given without `--name=`, in order. The last takes the rest of the line. |
| `output` | no | JSON Schema for `data`. Drives tables and `man`, and tells agents what comes back. Data that does not fit logs a warning. |
| `examples` | no | Command lines, shown by `man` and given to agents. |
| `seeAlso` | no | Related command names. |
| `confirm` | no | `(input) => "Place an order for 2 items?"`: the question when the policy asks. It gets the checked input (converted, defaults filled), the same value `run()` gets. If it throws, the generic question is asked. |
| `suggest` | no | `(key, partial, { input, signal })` returns values for completion. May be async. |
| `view` | no | `{ columns: [...] }`: the columns a table shows. `--wide` shows all. |
| `run` | yes | `(input, { caller, signal })`. Return `{ text?, data? }`, or a string for text only; throw to fail. |

Use one verb for one meaning across your commands: `search` for finding,
`add` and `remove` for what goes into or out of something, `go` for going
to another page, `status` for the state. Agents pick tools by name; two
verbs for the same thing make them guess.

Names starting with `help`, `man`, `status` or `clear` are refused: those
words belong to clients. So are inputs named `help`, `json` or `wide`.

## How input is checked

Sutram checks input against the JSON Schema keywords that apply to one value,
before `run()` is called:

- `type`, `required`, `enum`, `const`, `format`;
- numbers: `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`;
- strings: `minLength`, `maxLength` (in characters), `pattern`;
- arrays: `items` (one level), `minItems`, `maxItems`, `uniqueItems`;
- `type: ["string", "null"]` and the like, for a value that may be left out.

Keywords that combine schemas (`oneOf`, `anyOf`, `allOf`, `if`, `$ref`,
properties of a nested object, …) are not checked, and `register()` warns
about them once. Check those in `run()`. Arguments the schema does not
declare are refused.

Text typed in the console is converted to the declared type: `"2"` becomes
`2`, `yes` becomes `true`, `a,b` becomes a list. Values that arrive typed,
from an agent or from code, are not converted: `true` for an integer is a
usage error, not `1`.

`null` and a missing value mean "not given": the `default` applies, or a
`required` key is reported. An empty string is a value for a string
property, so `--title=""` clears a title and counts as present for
`required`, as in JSON Schema. If your command needs non-empty text, add
`minLength: 1`, or check it in `run()`. For numbers, booleans and lists, an
empty value (`--qty=`) means "not given".

## Return data, not text

Return `data`, and optionally a short `text` for people. The console formats
the data (tables, trees, `key: value`); agents get it as it is. See
[Results](results.md).

## Register when it makes sense, remove when it does not

`register()` returns a function that removes the command. A provider can
register commands when its own state makes them possible, and remove them when
it no longer does: a `checkout` command only while the cart has something in
it. `help`, completion and the agent's tool list follow along. This is how an
agent finds out what is possible now, without guessing.

Content that other code loads and removes (a form in a dialog, a step loaded
by AJAX, a rebuilt form) is different: register its commands once, with the
content as an argument (`form set <form> <field> <value>`), and look the
content up when the command runs. A command that holds on to content can
otherwise act on something that is no longer on the page. See
[Forms](../guides/forms.md).

## A status command per provider

Give each provider a read-only `<provider> status` command that returns a
one-line `text` and the state as `data`. A bare `status` runs all of them,
and agents get `sutram_status`, so one word shows the state of the whole page.

## Providers

A provider is the part of the app that owns some commands: the cart, a form,
the menu, an editor. Sutram itself holds no app state and knows no domain. It
has no idea what a cart or a node is; providers do. Several providers on one
page share one registry, so their commands sit side by side in `help` and in
the tool list.
