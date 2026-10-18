---
title: Write a provider
description: Build a small set of commands step by step, the way the coffee shop on the website does.
---

# Write a provider

A provider is the part of your app that owns some commands. This guide
builds the cart from the [coffee shop demo](https://d34dman.github.io/sutram/#demo):
status first, then reading, then changing, then the one command that needs a
person's yes. The full code is in `site/app.js`.

## 1. Status first

Start with what an agent needs before anything else: what state is this in?

```js
const NONE = { type: "object", properties: {} };

Sutram.register({
  name: "cart status",
  provider: "cart",
  description: "Show what is in the cart",
  input: NONE,
  output: {
    type: "object",
    required: ["count", "total", "items"],
    properties: {
      count: { type: "integer" },
      total: { type: "number", format: "money" },
      items: { type: "array", items: LINE },
    },
  },
  view: { columns: ["sku", "name", "qty", "price"] },
  annotations: { readOnly: true },
  seeAlso: ["cart add", "checkout"],
  run: () => {
    if (!cart.size) {
      return {
        text: "The cart is empty. Try shop list, then cart add.",
        data: { count: 0, total: 0, items: [] },
      };
    }
    return {
      text: `${summary()}.`,
      data: { count: count(), total: total(), items: items() },
    };
  },
});
```

- It is read-only, so nobody is ever asked before it runs.
- `text` is one line for people; `data` is the state, for agents and for
  `--json`.
- The empty case says what to do next. Agents follow hints like that.
- A bare `status` (and the agent's `sutram_status`) now includes the cart.

## 2. A change

```js
Sutram.register({
  name: "cart add",
  provider: "cart",
  description: "Add a product to the cart",
  input: {
    type: "object",
    properties: {
      sku: {
        type: "string",
        enum: products.map((p) => p.sku),
        description: "Product code, from shop list",
      },
      qty: {
        type: "integer",
        minimum: 1,
        maximum: 20,
        default: 1,
        description: "How many",
      },
    },
    required: ["sku"],
  },
  positional: ["sku", "qty"],
  output: {
    type: "object",
    required: ["count", "total"],
    properties: {
      count: { type: "integer" },
      total: { type: "number", format: "money" },
    },
  },
  annotations: {},
  examples: [
    "cart add V60-02",
    "cart add GUJI-250 2",
    "cart add SCALE --qty=1",
  ],
  seeAlso: ["cart remove", "cart status", "checkout"],
  run: ({ sku, qty }, { caller }) => {
    cart.set(sku, (cart.get(sku) || 0) + qty);
    changed(caller);
    return {
      text: `Added ${qty} × ${bySku.get(sku).name}. The cart has ${summary()}.`,
      data: { count: count(), total: total() },
    };
  },
});
```

- The schema does the checking. `cart add V61` fails with exit 2 before
  `run()` is called, and the message lists the valid codes.
- `enum` also gives completion with <kbd>Tab</kbd> for free.
- `positional` makes `cart add V60-02 2` work, as well as
  `--sku=V60-02 --qty=2`.
- `run()` calls the app's own code. The shop's buttons call the same command,
  so people, the console and agents all go one way.

## 3. A command that only exists when it makes sense

```js
let removeCheckout = null;
function toggleCheckout() {
  if (cart.size && !removeCheckout) {
    removeCheckout = Sutram.register({
      name: "checkout",
      provider: "cart",
      description: "Place the order for everything in the cart",
      input: NONE,
      annotations: { consequential: true },
      confirm: () => `Place an order for ${summary()}?`,
      run: () => { /* … */ },
    });
  } else if (!cart.size && removeCheckout) {
    removeCheckout();
    removeCheckout = null;
  }
}
```

- `checkout` appears in `help` and in the agent's tools once the cart has
  something in it, and disappears when it is empty. Nobody calls a command
  that cannot work.
- `consequential: true` means the policy asks first. `confirm` words the
  question with the real numbers.

## 4. Failures that help

```js
run: ({ sku }) => {
  if (!cart.has(sku)) {
    const message = `cart remove: ${sku} is not in the cart.`;
    throw new CommandError(message, EXIT.FAILED);
  }
  // …
},
```

Say which command failed and why, in words the caller can act on. See
[Errors that help agents](errors.md).

## 5. Check it

```
› help cart
› man cart add
› cart add V61
› cart add V60-02 2
› status
› checkout
```

Then the agent's view: `Sutram.tools()` in the developer tools, and
`await Sutram.call("cart_add", { sku: "V60-02" })`. See
[Test with Playwright](testing.md) to make that a test.

## Checklist

- [ ] A read-only `<provider> status` with one line of `text`
- [ ] Names start with the provider: `cart add`, not `add to cart`
- [ ] Descriptions say what the command does, in one line
- [ ] Every input property has a type, and a `description` where the name is
      not obvious
- [ ] `annotations` set on purpose: read-only, consequential, navigates or
      reinitializes (and `reinitializes()` called where it happens)
- [ ] Commands registered only while they make sense
- [ ] Failures name the command and say what to do instead
- [ ] `examples` for anything with more than one argument
