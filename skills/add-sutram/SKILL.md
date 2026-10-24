---
name: add-sutram
description: Add Sutram commands to a web app so AI agents (and people) can use it through commands instead of clicks. Use when asked to make an app agent-ready, expose actions to WebMCP, add a command console, or register Sutram commands in JavaScript or a Drupal module.
---

# Add Sutram to an app

Sutram (`@d34dman/sutram`, or `drupal/sutram` for Drupal) turns command
definitions into WebMCP tools, `Sutram.tools()`/`Sutram.call()` for browser
automation, and a console. You write the commands; Sutram writes the help,
the parser, the tool list and the approval prompts.

Docs: https://d34dman.github.io/sutram/llms.txt

## Steps

1. **Install.** `npm install @d34dman/sutram`, or load `dist/sutram.js`
   as a module (`globalThis.Sutram`). In Drupal, depend on the
   `sutram/sutram` library.
2. **Find the providers.** The parts of the app that own state and actions:
   a cart, a form, an editor, the navigation. Each becomes a provider, and
   its commands are named `<provider> <verb>`.
3. **Status first.** For each provider, a read-only `<provider> status` that
   returns one line of `text` and the state as `data`.
4. **Then reading commands** (`list`, `search`, `get`), all
   `annotations: { readOnly: true }`.
5. **Then changes**, one thing per command (`add`, `set`, `remove`). For
   forms: `form list`, then `form status | fields | get | set | save | discard`
   with the form's id first, and `set` taking one field and one value.
   Register commands once and look content up when they run, so content
   that comes and goes needs no re-registering.
6. **Mark what matters.** `consequential: true` for anything hard to undo
   (orders, deletes, publishing, sending), with a `confirm` question.
   `navigates: true` when the page reloads or leaves.
7. **Register while it makes sense.** `register()` returns a remover. Add a
   command when it can work (checkout once the cart has items) and remove it
   when it cannot. When a command changes what exists (new form fields), say
   so in its result.
8. **Mount the console** (`Sutram.mountConsole()`), and connect WebMCP
   (automatic with `dist/sutram.js`).

## A command

```js
Sutram.register({
  name: "cart add",
  title: "Add to the cart",
  provider: "cart",
  description: "Add a product to the cart",
  input: {
    type: "object",
    properties: {
      sku: { type: "string", description: "Product code, from shop list" },
      qty: { type: "integer", minimum: 1, default: 1 },
    },
    required: ["sku"],
  },
  positional: ["sku", "qty"],
  output: { type: "object", properties: { count: { type: "integer" }, total: { type: "number" } } },
  annotations: {},
  examples: ["cart add V60-02 2"],
  run: async ({ sku, qty }) => {
    await cart.add(sku, qty);             // the app's own code; the UI's buttons should call the same
    return { text: `Added ${qty} × ${sku}.`, data: { count: cart.count, total: cart.total } };
  },
});
```

## Rules

- Call the app's existing code and endpoints from `run()`. Add no new server
  routes just for agents; commands run with the user's session and can do
  only what the user can do. Access checks stay on the server.
- Return `data` (and a short `text`); do not return formatted tables.
- Fail with `throw new CommandError("<command>: what is wrong. What to do instead.", EXIT.USAGE or EXIT.FAILED)`.
  Name every missing field at once.
- One verb per meaning across the app: `search` to find, `add` and `remove`
  for what goes in or out, `go` to another page, `status` for the state.
- Give each command a short `title` for people ("Add to the cart"); hosts show
  it and the approval question uses it.
- Every input property has a `type`; use `enum` for closed lists and a
  `description` when the name is not enough. Name properties with one
  lowercase word (`target`, `limit`), or words joined by `_` (`per_page`).
- `annotations` is required. Decide `readOnly` and `consequential` for each
  command.
- Names cannot start with `help`, `man`, `status` or `clear`; inputs cannot be
  named `help`, `json` or `wide`.
- Put no markup and no domain logic into Sutram itself; providers own both.

## Check

- `help`, `man <command>`, `status` in the console read well to someone who
  has never seen the app.
- `Sutram.tools()` lists what you expect; `await Sutram.call("cart_add", {...})`
  returns `{ code: 0, ... }`; a consequential call returns 130 without
  `{ confirmed: true }`.
- Add a Playwright test with `Sutram.call()` (see the testing guide).
