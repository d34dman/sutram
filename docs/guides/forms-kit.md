---
title: Forms kit
description: form list, status, fields, get, set, submit and discard, the same on every site, with add, remove, search and upload where the app has them.
---

# Forms kit

The forms kit gives every form the command set of the [forms guide](forms.md):
the same names, inputs and messages on every site, so an agent that has filled
one form knows them all. The app's adapter says which forms there are, reads
and fills their fields, and sends them. The kit checks names, converts values,
tracks unsaved changes and writes the messages. It never touches the page.

| Command | Does | Annotations | Registered |
|---|---|---|---|
| `form list` | The forms on the page, with unsaved changes and errors | read-only | always |
| `form status <form>` | Unsaved changes, required fields still empty, errors | read-only | always |
| `form fields <form>` | Every field: path, label, type, required, value, options, format | read-only | always |
| `form get <form> <field>` | One field in full, with its options or format | read-only | always |
| `form set <form> <field> <value>` | Change one field; names the fields the answer adds or removes | | always |
| `form submit <form>` | Send it, the same as its button; checks required fields first | consequential, `navigates` if it reloads | always |
| `form discard <form>` | Put back the values the form loaded with | consequential | always |
| `form add <form> <field> [value]` | Add an item to a field that takes several, or a value to what it holds | | with `add` |
| `form remove <form> <target>` | Remove an item or a file | consequential | with `remove` |
| `form search <form> <field> <text>` | What a reference field can point to | read-only | with `search` |
| `form upload <form> <field> [source]` | Put a file into a file field, from a URL, `--text` or `--base64` | consequential | with `upload` |

## The adapter

```js
import { forms } from "@d34dman/sutram/forms";

const values = { email: "", topic: "" };
forms({
  // The forms on the page now. Called each time a command runs.
  forms: () => [{
    id: "contact",
    label: "Contact",
    fields: [
      { field: "email", label: "Email", type: "string", required: true, value: "" },
      { field: "topic", label: "Topic", type: "choice", options: { billing: "Billing", bug: "Bug" }, value: "" },
    ],
  }],
  read: (form, field) => values[field.field],
  write: (form, field, value) => { values[field.field] = value; render(); },
  submit: (form) => { send(values); return { text: "Sent. Thank you." }; },
  reloads: false,
});
```

| Adapter key | Required | What it is |
|---|---|---|
| `forms()` | yes | The forms on the page now: `{ id, label?, entity?, fields, errors? }`. Each field has a dotted `field` path, a `type` and `value`, what it held when the form loaded; unsaved changes are measured from it. `label`, `required`, `options` (for choices) and `format` are optional. |
| `read(form, field)` | yes | The field's value now. |
| `write(form, field, value)` | yes | Fills the field with a value the kit (or your type) converted. Fill the real input and fire its events, so the form on screen and the commands agree. It may be async. |
| `submit(form)` | yes | Sends the form. |
| `reloads` | yes | `true` if submitting loads a new page: `form submit` is marked `navigates` and calls `submit()` after it has answered. `false`: the kit awaits `submit()` and returns its `{ text, data }`. |
| `types` | no | Value types of your own, by type name: `{ coerce(field, raw, form), suggest?, format? }`. A field's `handler`, if it has one, picks the type instead. |
| `check(form)` | no | Problems you find before sending, such as the browser's validation: `[{ field, message }]`. |
| `notes` | no | `{ submit(form), upload(form, input) }`: a sentence for the person's question, such as "It will be published." |
| `valueHelp` | no | Added to `form set`'s value description: how your own types take values. |
| `example` | no | A form id for the examples in help, such as `node-article-edit-form`; `contact` if you give none. |
| `examples` | no | Examples with your own fields, by command name, in place of the kit's: `{ "form set": ['form set node-article-form title "Hello"'] }`. |
| `add`, `remove`, `search`, `upload` | no | The optional commands, each registered only when you supply it. They answer `{ data, text? }`; the kit writes a text when you give none. `addable`, `removable`, `searchable` and `uploadable` list what Tab offers. |

Pass the forms and fields back as you like: the kit hands your objects to
`read` and `write`, so they may carry whatever you need to find the input.

The person's question before `form submit`, `discard`, `remove` and `upload`
names what will change. It is asked at once, so `forms()`, `read()` and
`notes` should answer without a promise; when they return one, the generic
question ("Submit a form? (form submit)") is asked.

## Value types

The kit converts the basic types, with the same messages on every site:

| Type | `form set` takes |
|---|---|
| `string`, `text` | any text |
| `html` | HTML, such as `<p>…</p>` |
| `number` | a number |
| `boolean` | `true`, `false`, `yes`, `no`, `on`, `off`, `1`, `0` |
| `choice` | one key or its label (any case); empty clears it unless it is required |
| `choices` | keys or labels separated by commas, or a JSON array; replaces the selection. A label may hold a comma |

Add your own under `types`. `coerce` gets the text `form set` was given and
returns the value `write()` takes, or throws a `CommandError` that says what
the field takes:

```js
types: {
  date: {
    coerce(field, raw) {
      if (!/^\d{4}-\d\d-\d\d$/.test(raw)) throw new CommandError(`form set: ${field.field} takes a date as YYYY-MM-DD.`, EXIT.USAGE);
      return raw;
    },
    format: "YYYY-MM-DD",
  },
},
```

## Without a bundler

Load `dist/forms.js` after `dist/sutram.js` and call `Sutram.kits.forms()`.
In Drupal, `drupal/sutram` ships it as the library `sutram/forms`. See
[Drupal](../drupal.md).
