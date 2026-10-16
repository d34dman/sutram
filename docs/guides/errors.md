---
title: Errors that help agents
description: How to word failures so an agent fixes one thing instead of starting over.
---

# Errors that help agents

An agent reads your error message and decides what to do next. A good one
leads to one corrected command. A vague one leads to guessing, or to starting
over.

## What Sutram does for you

| Mistake | Exit | Message comes from |
|---|---|---|
| Unknown command | 127 | Sutram, with "did you mean" when a name is close |
| Unknown option or argument, wrong type, missing required input, a value outside the schema's limits | 2 | Sutram, from the input schema ([what is checked](../concepts/commands.md#how-input-is-checked)) |
| Needs approval it did not get | 130 | Sutram, with the question to ask |
| Anything your `run()` throws | 1, or the code of a `CommandError` | You |

So the schema is your first error message. A `minimum`, an `enum`, a
`maxLength`, a `pattern` or a `required` turns into a precise usage error without a line of code.

## Writing your own

Throw a `CommandError` with a message and an exit code:

```js
throw new CommandError(
  `${base} set: "${s}" is not a valid invoice number. ` +
    "Use INV- and at least four digits, such as INV-20417.",
  EXIT.USAGE,
);
```

A good message:

1. **Starts with the command**, so a failed line in a batch is obvious.
2. **Says what is wrong** with this input, not in general.
3. **Says what would work**: the format, the allowed values, an example.
4. **Names the next command** when there is one: "Set it first, for example:
   `form request set email …`".
5. **Lists everything at once.** "email, summary and phone are required" saves
   two round trips over naming one at a time.

Use `EXIT.USAGE` (2) when the input was wrong, `EXIT.FAILED` (1) when the
input was fine but it did not work, `EXIT.NOT_FOUND` (127) for a thing that
does not exist.

## Hints on success, too

Results guide agents as much as errors do:

- "The cart is empty. Try shop list, then cart add."
- "topic set. The form now also asks for: invoice, amount."
- "Saving. The page reloads; then status shows where it went."

## Batches stop at the first failure

A pasted block, a multi-line entry and `sutram_batch` stop at the first
command that fails, and the console says which line. Earlier commands keep
their effect unless the provider has [batch hooks](../concepts/batches.md).
So the agent's correction is the failed line and the ones after it.
