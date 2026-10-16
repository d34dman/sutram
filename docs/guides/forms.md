---
title: Forms
description: Field-level commands for forms, progressive disclosure, and validation errors agents can fix.
---

# Forms

Forms are where commands pay off most. An agent sets one field at a time,
sees what the form asks for next, and fixes the one value that was wrong.
Read [Why commands](../why.md) for the argument; this guide is the how.

## The command set

Use the same names for every form, so an agent that has filled one knows
them all:

| Command | Does | Annotations |
|---|---|---|
| `form <id> status` | Unsaved changes, missing fields, errors | read-only |
| `form <id> fields` | Every field the form has now: name, label, type, required, value | read-only |
| `form <id> get <field>` | One field in full, with its allowed values or format | read-only |
| `form <id> set <field> <value>` | Change one field. Nothing is saved yet | |
| `form <id> save` (or `submit`) | Send it, the same as the form's button | consequential |
| `form <id> discard` | Undo the unsaved changes | consequential |

The provider is `form <id>`, so `help form <id>` lists one form, and two forms
on a page never collide. Drupal's
[form commands](../drupal.md) and the
[forms example](https://d34dman.github.io/sutram/example/forms.html) both
follow this.

## Set one field

```js
registry.register({
  name: `${base} set`,
  provider: base,
  description:
    "Change one field. Answers can add fields to the form: the result names them",
  input: {
    type: "object",
    properties: {
      field: {
        type: "string",
        enum: visibleFields(),
        description: `A field of the form now. ${base} fields lists them.`,
      },
      value: {
        type: "string",
        description:
          "The new value. Yes/no fields take true or false; " +
          "choices take a key or its label.",
      },
    },
    required: ["field", "value"],
  },
  positional: ["field", "value"],
  annotations: {},
  run: ({ field, value }) => {
    // Convert the value, write it into the real input, report what changed.
  },
});
```

- `field` is an `enum` of the fields that exist now: a typo is a usage error
  with the valid names, and completion works.
- `value` is a string, converted per field by your code. That keeps one
  `set` for every field type, and lets your messages explain each type.
- Write into the real input (and fire `input` and `change` events), so the
  form on screen and the commands always agree, and the app's own behaviour
  (conditional fields, summaries) runs as if a person typed.

## Progressive disclosure

When an answer changes which fields exist, do two things:

1. **Re-register the commands** whose `enum` lists the fields, so `help`,
   completion and the agent's tools follow.
2. **Say so in the result**, so the agent does not have to guess:

```
› form request set topic billing
topic set. The form now also asks for: invoice, amount.
› form request set topic bug
topic set. The form now also asks for: product, severity, steps. No longer asked: invoice, amount.
```

Return the lists in `data` too (`added`, `removed`), for agents that read
JSON. Re-register only when the set of fields really changed, not on every
keystroke.

## Validation errors

Check what you can in `set`, and say what a valid value looks like:

```
› form request set invoice 2024-17
form request set: "2024-17" is not a valid invoice number. Use INV- and at least four digits, such as INV-20417.
```

Check required fields before sending, and name all of them at once, with an
example of the next command:

```
› form request submit
form request submit: email, summary, product, phone are required. For example: form request set email …
```

Errors the server finds after `save` belong in `form <id> status`, by field.
See [Drafts and saving](drafts-and-saving.md).

## What the agent does

```sh
form request fields
form request set topic billing
form request fields
form request set invoice INV-20417
form request set email ada@example.com
form request set summary "Charged twice in May"
form request status
form request submit
```

Read, change one thing, read what changed, fix what failed, send. The fields
it set stay set when one line fails, so a correction is one line.
