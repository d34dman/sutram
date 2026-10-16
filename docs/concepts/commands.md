---
title: Commands and providers
description: What a command definition holds, who owns it, and when to register and remove it.
---

# Commands and providers

A command is a name, a JSON Schema for its input, annotations, and a
function. Sutram turns it into a tool for agents and a command line for
people and agents. Your function never knows who called it.

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
  annotations: {},                         // required, even when empty
  examples: ["cart add V60-02 --qty=2"],   // shown in man and given to agents
  seeAlso: ["cart status"],
  suggest: (key, partial) =>               // optional: values for Tab completion
    key === "sku" ? catalog.search(partial).map((p) => ({ value: p.sku, description: p.name })) : [],
  run: async ({ sku, qty }, { caller, signal }) => {
    await cart.add(sku, qty);              // your app's own code and endpoints
    return { text: `Added ${qty} × ${sku}.`, data: { count: cart.count, total: cart.total } };
  },
});
```

## The fields

| Field | Required | What it is for |
|---|---|---|
| `name` | yes | Lowercase words separated by single spaces. Start with the provider: `cart add`, `form node-article-form set`. |
| `provider` | yes | Who owns the command. `help <provider>` lists one group. |
| `description` | yes | One line: what it does. `help` shows it; agents read it. See [descriptions](../guides/descriptions.md). |
| `input` | yes | JSON Schema for the input. Use `{ type: "object", properties: {} }` for none. Input is checked before `run()`. |
| `annotations` | yes | Hints such as `readOnly` and `consequential`. See [annotations](annotations-and-policy.md). |
| `positional` | no | Input keys that can be given without `--name=`, in order. The last takes the rest of the line. |
| `output` | no | JSON Schema for `data`. Drives tables and `man`, and tells agents what comes back. Data that does not fit logs a warning. |
| `examples` | no | Command lines, shown by `man` and given to agents. |
| `seeAlso` | no | Related command names. |
| `confirm` | no | `(input) => "Place an order for 2 items?"`: the question when the policy asks. |
| `suggest` | no | `(key, partial, { input, signal })` returns values for completion. May be async. |
| `view` | no | `{ columns: [...] }`: the columns a table shows. `--wide` shows all. |
| `run` | yes | `(input, { caller, signal })`. Return `{ text?, data? }`; throw to fail. |

Names starting with `help`, `man`, `status` or `clear` are refused: those
words belong to clients. So are inputs named `help`, `json` or `wide`.

## Return data, not text

Return `data`, and optionally a short `text` for people. The console formats
the data (tables, trees, `key: value`); agents get it as it is. See
[Results](results.md).

## Register when it makes sense, remove when it does not

`register()` returns a function that removes the command. Register commands
when they make sense on the page, and remove them when they no longer do: a
`checkout` command only while the cart has something in it, a form's commands
only while the form is on the page. `help`, completion and the agent's tool
list follow along. This is how an agent finds out what is possible now,
without guessing.

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
