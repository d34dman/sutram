---
title: Results and exit codes
description: What every run returns, how the console shows it, and the options every command gets for free.
---

# Results and exit codes

Every run resolves to a result shaped like a process exit, whoever called
it: the console, an agent, a test or the app.

| Code | Means | Shape |
|---|---|---|
| `0` | Done | `{ code: 0, text?, data? }` |
| `1` | Ran, but failed | `{ code: 1, message }`. Throw an `Error`, or a `CommandError` with your own message. |
| `2` | Usage error: the input did not fit the schema | `{ code: 2, message }` |
| `127` | No such command | `{ code: 127, message }`, with "did you mean" when something is close |
| `130` | Cancelled, or not allowed to run without approval | `{ code: 130, message }` |

```js
import { CommandError, EXIT } from "@d34dman/sutram";

throw new CommandError("form request submit: email is required. For example: form request set email …", EXIT.FAILED);
```

See [Errors that help agents](../guides/errors.md) for how to word them.

## How results look

You return data; the console decides how to show it:

- a list of records becomes a table (pick columns with
  `view: { columns: [...] }`),
- a record becomes `key: value` lines,
- records with `children` become an indented tree,
- `text`, when you return it, comes first.

Agents always get `data` as it is.

## Options every command gets

| Option | Prints |
|---|---|
| `--json` | The data unchanged, exactly as an agent gets it |
| `--json=sku,price` | Only those fields |
| `--wide` | Every column, including those `view.columns` leaves out |
| `-h`, `--help` | The command's usage |

## Output schemas

An `output` schema is optional but worth it. It drives table columns and
`man`, tells agents what comes back (WebMCP tool descriptions include it),
and results are checked against it: data that does not fit logs a warning in
the browser console, so a provider that drifts from its schema is noticed.
`createRegistry({ checkResults: false })` turns the check off.
