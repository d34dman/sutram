---
title: Measurements
description: How many tokens an agent spends filling a real Drupal form with one schema or with Sutram's commands, including a correction.
---

# Measurements

How much does an agent read and write to fill in a form, and how much does a
mistake cost? This page compares the two approaches on a real form, so the
[case for commands](why.md) rests on numbers, not adjectives.

## The setup

- **The form:** Drupal's "Create Article" form on the
  [demo site](https://github.com/d34dman/drupal-sutram-demo), with the
  `sutram_demo_form` module. Eleven fields an agent can set (title, body,
  summary, text format, tags, URL alias, published, promoted, sticky, author,
  revision log). Captured on 16 October 2026 in
  [`docs/measurements/drupal-article-form.json`](measurements/drupal-article-form.json):
  the tool list, `help`, the field list and the real outputs.
- **The task:** create an unpublished article with a title, a summary, a
  short body and two tags.
- **The mistake:** the agent sends the published flag as `draft`, and has to
  correct it.

The approaches:

- **A. One tool for the whole form.** Its input schema describes every field;
  the agent sends the whole form as one object.
- **A′. The same tool, but optional fields may be left out.** The agent sends
  only the fields it changes.
- **B1. Sutram through WebMCP.** The agent reads the form's tools and calls
  `form_node-article-form_set` once per field, then `save`.
- **B2. Sutram in the console.** The agent reads `help` and
  `form node-article-form fields`, and writes command lines. A pasted batch
  stops at the failing line, so the correction is that line and the ones after
  it.

## The numbers

Bytes, and tokens estimated as bytes ÷ 4. Real tokenizers differ; the ratios
between the rows hold.

<!-- measure:start -->
Form: form node-article-form, 11 fields an agent can set. Captured 2026-10-16, drupal-sutram-demo (Drupal 11.4, drupal/sutram 1.x-dev with sutram_demo_form), node/add/article, Sutram 0.3 + 0.4 work.

| Way | Reads first | Writes | Writes again after one wrong value |
|---|--:|--:|--:|
| A. One tool, the whole form | 982 B (≈246 tokens) | 389 B (≈97) | 387 B (≈97) |
| A′. One tool, only the touched fields | 982 B (≈246 tokens) | 281 B (≈70) | 279 B (≈70) |
| B1. Sutram through WebMCP | 2443 B (≈611 tokens) | 645 B (≈161) | 129 B (≈32) |
| B2. Sutram in the console (help, fields) | 2584 B (≈646 tokens) | 431 B (≈108) | 67 B (≈17) |

Discovering the whole page (14 commands): the tool list is 4938 B (≈1235 tokens), help is 1664 B (≈416).

The wrong value, as the form command reports it: "form node-article-form set: status is a yes/no field. Use true or false."
<!-- measure:end -->

## What it shows

- **For the first fill of this small form, one schema is cheaper.** It reads
  less and writes less. Sutram's agent pays for discovery (the commands and the
  field list) and writes one command per field.
- **A correction is 3 to 6 times cheaper with commands**, and it grows with
  the form: one schema resends every value the agent sent, commands resend one.
- **Discovering a page is 3 times cheaper with `help`** than with every tool's
  schema, and the gap grows with every command, because `help` costs one line
  each and `man` is read only when needed.
- **Not measured, because one schema cannot do it:** a form whose fields
  appear as it is filled in. See the
  [forms example](https://d34dman.github.io/sutram/example/forms.html).

## Run it yourself

```sh
node scripts/measure.mjs           # the table above
node scripts/measure.mjs --json    # the numbers
```

The docs build puts the script's output between the markers on this page, and
`npm run docs:check` fails when the page and the script disagree. To measure
another form, capture the same fields from your page (see the comments in
`scripts/measure.mjs`) and point the script at the file.
