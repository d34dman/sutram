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
  // Before the provider's first command in the batch.
  begin: () => history.startTransaction(),
  // Every command succeeded.
  commit: () => history.commitTransaction(),
  // One failed: undo the provider's earlier commands.
  rollback: () => history.cancelTransaction(),
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

Always finish a started batch with `commit()` or `rollback()`: batches run
one at a time, and the next one waits until you do.

## One at a time, and what was checked

- **Batches take turns.** A second batch waits until the first has committed
  or rolled back. A person's or an agent's command for a provider the running
  batch is changing waits too, so a rollback cannot undo their edit. App code
  calling `registry.run()` does not wait: it may be running inside one of the
  batch's own commands.
- **Each step runs the command that was checked.** If an earlier step
  replaces a later step's command (a command that comes and goes with page
  state), that step does not run (exit 130), and the batch rolls back.
  Clients pass the definition they asked the user about, so a command
  swapped in while the user was deciding does not run either:
  `registry.run(name, input, { expect: def })`, or `def` on a batch step.

## For agents

Through WebMCP, agents get a `sutram_batch` tool:
`{ calls: [{ tool: "cart_add", input: { sku: "V60" } }, …] }`. Use it for
edits that belong together; it saves round trips and asks the user once.
Add `quiet: true` when the results of the calls that work do not matter:
the answer is then `{ code, completed, total }`, with the result of the call
that failed as `failed`.
