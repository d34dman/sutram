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
  // For man and agents.
  description: "an amount in euros",
  // Bad input is a usage error.
  validate: (v) => Number.isFinite(v),
  display: (v, { locale }) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" })
      .format(v),
  // In tables.
  align: "right",
});

// Then, in an output schema:
//   total: { type: "number", format: "money" }
```

- A format nobody defined is left alone.
- A name can be defined only once per page, so two modules cannot disagree
  about what `money` means.
- `date-time` and `date` are defined out of the box: checked as RFC 3339
  (`2026-10-15`, `2026-10-15T14:30:00Z`; a date must be on the calendar) and
  shown in the console's locale. A value that is not a date shows as written.
- Agents read the format's `description` in `man` and in tool descriptions.
