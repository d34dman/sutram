---
title: Test with Playwright
description: Drive a page's commands from a headless browser, in tests or in an agent, with Sutram.tools(), Sutram.call() and Sutram.exec().
---

# Test with Playwright

Code that can run JavaScript in the page gets the same tools as a WebMCP
agent from `window.Sutram`, with no console and no WebMCP. That covers
Playwright, Puppeteer, raw Chrome DevTools Protocol, and agents that drive a
browser.

```js
// Playwright; Puppeteer and CDP work the same way.
const tools = await page.evaluate(() => Sutram.tools());
// → [
//     { name: "sutram_status", … },
//     { name: "cart_add", description, inputSchema, annotations },
//     …
//   ]

await page.evaluate(() =>
  Sutram.call("cart_add", { sku: "V60-02", qty: 2 }),
);
// → { code: 0, text: "Added 2 × V60 dripper…", data: { count: 2, total: 48 } }

await page.evaluate(() => Sutram.call("checkout"));
// → { code: 130,
//     message: "checkout is consequential, so it did not run. Ask the user …" }

await page.evaluate(() =>
  Sutram.call("checkout", {}, { confirmed: true }),
);
```

- `tools()` is the list a WebMCP agent gets.
- `call()` takes the tool name (underscores) and follows the page's policy
  like a careful host: a call that needs approval runs only with
  `{ confirmed: true }`, which says the user agreed.
- Strings are converted to the declared types, as in the console, so
  `call(name, Sutram.client.parse(line).input)` works. WebMCP calls are
  checked strictly.
- Results and exit codes are the same as everywhere else.

## Across pages

A command that leaves the page, or otherwise starts Sutram again, takes
every command, event and answer of the page with it: Sutram keeps nothing
from before. Its result says so. Wait for `Sutram.ready`, then look again.
Remember yourself what you need from before, and compare. Until then, calls
on the old page are refused (exit 130), never answered from it.

With the user commands of the Drupal module's user demo:

```js
const before = await page.evaluate(() => Sutram.call("user_status"));
await page.evaluate(() => Sutram.call("user_login"));
await page.waitForURL("**/user/login**");
// … the person logs in; the page comes back …
await page.waitForFunction(() => window.Sutram);
await page.evaluate(() => Sutram.ready);
const after = await page.evaluate(() => Sutram.call("user_status"));
// Compare before.data.name with after.data.name yourself.
```

`Sutram.ready` resolves once the page's scripts have run: providers that
register when their script loads are there by then. See
[starting again](../concepts/annotations-and-policy.md#starting-again).

## A test

```js
import { test, expect } from "@playwright/test";

test("an agent can fill the cart and check out", async ({ page }) => {
  await page.goto("/");
  const add = await page.evaluate(() =>
    Sutram.call("cart_add", { sku: "V60-02", qty: 2 }),
  );
  expect(add.code).toBe(0);
  expect(add.data.count).toBe(2);

  const tools = await page.evaluate(() => Sutram.tools().map((t) => t.name));
  expect(tools).toContain("checkout");

  const refused = await page.evaluate(() => Sutram.call("checkout"));
  expect(refused.code).toBe(130);
});
```

This tests the commands an agent will use, not the pixels. The same calls
make good smoke tests for the app itself.

## Several commands in one call

`Sutram.exec()` takes command lines, the way a person pastes them into the
console, and answers with what the console would print. One
`page.evaluate()` does a whole task, and the answer is usually shorter than
the results as JSON:

```js
const { code, text } = await page.evaluate(() => Sutram.exec(`
form set contact name "Ada Lovelace"
form set contact topic billing
form status contact
`));
// text:
// › form set contact name "Ada Lovelace"
// name: (empty) → "Ada Lovelace". Not sent yet.
// › form set contact topic billing
// …
```

- Several lines run as one [batch](../concepts/batches.md): every line is
  checked first, so a typo runs nothing; the batch stops at the first line
  that fails, and providers that support it undo the lines before.
- `help`, `man`, `status`, `-h` and `--json` work as in the console. Add
  `--json` or `--json=a,b` to a line when you need its data.
- It follows the page's policy like `call()`: when a line needs the user,
  nothing runs and the text says what to ask. Ask, then run the same lines
  with `{ confirmed: true }`.
- A line that leaves the page or starts Sutram again must be the last one.
- The result is `{ code, text, completed, total }`. `exec` is also exported
  as `execLines(text, { registry })` from `@d34dman/sutram/webmcp`.

## Command lines in tests

To test what a person types, parse a line and run it:

```js
await page.evaluate(async () => {
  const { registry, client } = Sutram;
  const p = client.parse(registry, 'cart add V60-02 --qty=2');
  return registry.run(p.def.name, p.input);
});
```

`registry.run()` is the app's own way in: it is never asked for approval.

## Unit tests without a browser

The core has no DOM. In Node, create a registry and call it:

```js
import { createRegistry } from "@d34dman/sutram";
const registry = createRegistry();
registry.register(/* … */);
const result = await registry.run("cart add", { sku: "V60-02" });
```
