---
title: Forms
description: Field-level commands for forms, progressive disclosure, and validation errors agents can fix.
---

# Forms

Forms are where commands pay off most. An agent sets one field at a time,
sees what the form asks for next, and fixes the one value that was wrong.
Read [Why commands](../why.md) for the argument; this guide is the how.

## The command set

Use the same commands for every form, with the form as the first argument,
so an agent that has filled one knows them all:

| Command | Does | Annotations |
|---|---|---|
| `form list` | The forms on the page now | read-only, `untrustedContent` |
| `form status <form>` | Unsaved changes, missing fields, errors | read-only, `untrustedContent` |
| `form fields <form>` | Every field the form has now: name, label, type, required, value | read-only, `untrustedContent` |
| `form get <form> <field>` | One field in full, with its allowed values or format | read-only, `untrustedContent` |
| `form set <form> <field> <value>` | Change one field. Nothing is saved yet | `untrustedContent` |
| `form submit <form>` | Send it, the same as the form's button | consequential |
| `form discard <form>` | Undo the unsaved changes | consequential |

The [forms kit](forms-kit.md) registers exactly these, with `form add`,
`remove`, `search` and `upload` where your app has them; give it an adapter
instead of writing them yourself. The rest of this guide is how they behave.

Register these once, when your script loads, and look the form up each time a
command runs. Forms come and go (a dialog opens, a step loads, a form is
rebuilt), but the commands stay the same, so agents see one tool list for the
whole page and no command can act on a form that is gone. Drupal's
[form commands](../drupal.md) and the
[forms example](https://d34dman.github.io/sutram/example/forms.html) both
follow this.

## Set one field

```js
registry.register({
  name: "form set",
  provider: "form",
  description:
    "Change one field. Answers can add fields to the form: the result names them",
  input: {
    type: "object",
    properties: {
      form: { type: "string", description: "The form's id. form list shows them." },
      field: { type: "string", description: "A field of the form now. form fields <form> lists them." },
      value: {
        type: "string",
        description:
          "The new value. Yes/no fields take true or false; " +
          "choices take a key or its label.",
      },
    },
    required: ["form", "field", "value"],
  },
  positional: ["form", "field", "value"],
  annotations: {},
  // Completion: the forms on the page, then the fields of the form typed.
  suggest: (key, partial, { input }) =>
    (key === "form" ? formIds() : key === "field" ? fieldsOf(input.form) : [])
      .filter((v) => v.startsWith(partial)),
  run: ({ form, field, value }) => {
    // Find the form now, or fail with the forms that are open. Check the
    // field against the fields it has now. Convert the value, write it into
    // the real input, report what changed.
  },
});
```

- `form` and `field` are checked when the command runs, against the page as
  it is then: an unknown one is a usage error that lists the valid names.
  `suggest` gives completion.
- `value` is a string, converted per field by your code. That keeps one
  `set` for every field type, and lets your messages explain each type.
- Write into the real input (and fire `input` and `change` events), so the
  form on screen and the commands always agree, and the app's own behaviour
  (conditional fields, summaries) runs as if a person typed.

## Progressive disclosure

When an answer changes which fields exist, the commands need no change:
they check fields when they run, and `form fields` and completion read the
form as it is now. Say so in the result, so the agent does not have to guess:

```
› form set request topic billing
topic set. The form now also asks for: invoice, amount.
› form set request topic bug
topic set. The form now also asks for: product, severity, steps. No longer asked: invoice, amount.
```

Return the lists in `data` too (`added`, `removed`), for agents that read
JSON.

## Validation errors

Check what you can in `set`, and say what a valid value looks like:

```
› form set request invoice 2024-17
form set: "2024-17" is not a valid invoice number. Use INV- and at least four digits, such as INV-20417.
```

Check required fields before sending, and name all of them at once, with an
example of the next command:

```
› form submit request
form submit: email, summary, product, phone are required. For example: form set request email …
```

Errors the server finds after `submit` belong in `form status <form>`, by field.
See [Drafts and saving](drafts-and-saving.md).

## What the agent does

```sh
form list
form fields request
form set request topic billing
form fields request
form set request invoice INV-20417
form set request email ada@example.com
form set request summary "Charged twice in May"
form status request
form submit request
```

Read, change one thing, read what changed, fix what failed, send. The fields
it set stay set when one line fails, so a correction is one line.
