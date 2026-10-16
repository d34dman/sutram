---
title: Batches
description: Several commands as one change, checked first, asked once, rolled back on failure.
---

# Batches

A pasted block, a multi-line entry in the console and an agent's
`sutram_batch` call each run as one batch:

- Every line is checked before any runs, so a batch with a typo runs nothing.
- The user is asked at most once.
- The batch stops at the first command that fails.

## One change, one undo step

A provider can make a batch one change with batch hooks:

```js
registry.defineBatch("editor", {
  begin: () => history.startTransaction(),     // before the provider's first command in the batch
  commit: () => history.commitTransaction(),   // every command succeeded
  rollback: () => history.cancelTransaction(), // one failed: undo the provider's earlier commands
});
```

Providers without hooks keep what their earlier commands did, and the console
says so. That is often right: the form fields an agent already set stay set,
and it only has to fix the line that failed.

## From code

```js
await registry.batch([
  { name: "cart add", input: { sku: "V60-02", qty: 2 } },
  { name: "cart add", input: { sku: "FILTER-02" } },
]);
// → { code, results, completed, total, message?, rolledBack?, kept? }
```

Or run commands one at a time and decide at the end:

```js
const b = registry.startBatch();
await b.run("cart add", { sku: "V60-02" });
await b.run("cart add", { sku: "FILTER-02" });
await b.commit();   // or b.rollback()
```

## For agents

Through WebMCP, agents get a `sutram_batch` tool:
`{ calls: [{ tool: "cart_add", input: { sku: "V60" } }, …] }`. Use it for
edits that belong together; it saves round trips and asks the user once.
