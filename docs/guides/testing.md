---
title: Test with Playwright
description: Drive a page's commands from a headless browser, in tests or in an agent, with Sutram.tools() and Sutram.call().
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
