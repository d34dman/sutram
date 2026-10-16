---
title: Formats
description: App-defined formats such as money, following JSON Schema custom formats.
---

# Formats

`format` in a schema works as in JSON Schema, where apps define their own
formats. Sutram defines no domain formats. The app that owns the data defines
them, and the console uses them to check input and show values:

```js
import { getFormats } from "@d34dman/sutram";

getFormats().define("money", {
  type: "number",
  description: "an amount in euros",       // for man and agents
  validate: (v) => Number.isFinite(v),     // bad input is a usage error
  display: (v, { locale }) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(v),
  align: "right",                          // in tables
});

// then, in an output schema: total: { type: "number", format: "money" }
```

- A format nobody defined is left alone.
- A name can be defined only once per page, so two modules cannot disagree
  about what `money` means.
- `date-time` and `date` are shown in the console's locale out of the box.
- Agents read the format's `description` in `man` and in tool descriptions.
