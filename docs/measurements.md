---
title: Measurements
description: How many tokens an agent spends filling a real Drupal form with and without Sutram, including a correction.
---

# Measurements

How much does an agent read and write to fill in a form, and how much does a
mistake cost? This page compares an agent with Sutram against one without it,
on a real form, so the [case for commands](why.md) rests on numbers, not
adjectives.

## The setup

- **The form:** Drupal's "Create Article" form on the
  [demo site](https://github.com/d34dman/drupal-sutram-demo), with the
  `sutram_demo_form` module. Eleven fields an agent can set. Four of them are
  hidden until clicked open: the summary behind "Edit summary", the URL alias
  and the promotion options in collapsed sections. Captured on 16 October 2026
  in [`docs/measurements/`](https://d34dman.github.io/sutram/docs/measurements/drupal-article-form.json): Sutram's
  tool list, `help`, the field list and real outputs, and the page as a
  browser agent sees it.
- **The task:** create an unpublished article with a title, a summary, a
  short body and two tags.
- **The mistake:** one wrong value (the published flag), which has to be
  corrected.

The ways to do it:

- **C. A browser agent without Sutram.** It reads the page as an
  accessibility snapshot, the cheapest view a browser agent gets (cheaper than
  screenshots or HTML), then clicks and types field by field, using element
  references from the snapshot. When something goes wrong there is no error
  message: it reads the page again to find out.
- **B1. Sutram through WebMCP.** The agent reads the page's tools and calls
  `form_node-article-form_set` once per field, then `save`.
- **B2. Sutram in the console.** The agent reads `help` and
  `form node-article-form fields`, and writes command lines. A pasted batch
  stops at the failing line, so the correction is that line and the ones after
  it.
- **B3. Sutram, everything at once.** Every field in one `sutram_batch` call.
  The batch stops at the wrong value, the fields before it stay set, and the
  agent sends the rest again from the corrected call.
- **A. For reference: one schema for the whole form.** Drupal has no such
  tool. It is built here from the field data Sutram's form module already
  provides, as small as it can be, and handed to the agent for free. It shows
  the floor: even the best hand-made schema resends everything after one
  mistake.

## The numbers

Bytes, and tokens estimated as bytes ÷ 4. Real tokenizers differ; the ratios
between the rows hold.

<!-- measure:start -->
Form: form node-article-form, 11 fields an agent can set. Captured 2026-10-16, drupal-sutram-demo (Drupal 11.4, drupal/sutram 1.x-dev with sutram_demo_form), node/add/article, Sutram 0.3 + 0.4 work.

| Way | Reads first | Writes | Correcting one wrong value |
|---|--:|--:|--:|
| C. Browser agent, no Sutram (accessibility snapshot) | 13089 B (≈3272 tokens) | 733 B (≈183) | 13162 B (≈3291) |
| B1. Sutram through WebMCP, one call per field | 4938 B (≈1235 tokens) | 645 B (≈161) | 129 B (≈32) |
| B2. Sutram in the console (help, fields) | 2584 B (≈646 tokens) | 431 B (≈108) | 67 B (≈17) |
| B3. Sutram, every field in one sutram_batch, then corrections | 4938 B (≈1235 tokens) | 694 B (≈174) | 174 B (≈44) |
| A. For reference: a hand-made form-wide tool, whole form | 982 B (≈246 tokens) | 389 B (≈97) | 387 B (≈97) |
| A′. The same, only the fields it changes | 982 B (≈246 tokens) | 281 B (≈70) | 279 B (≈70) |

Discovering the whole page (14 commands): the tool list is 4938 B (≈1235 tokens), help is 1664 B (≈416).

The same page as raw HTML is 324175 B (≈81044 tokens). A screenshot of the 1360×900 viewport costs ≈1632 tokens, and the form takes 2. 4 fields are hidden until clicked open (body.summary: Edit summary; path.alias: URL alias (collapsed); promote: Promotion options (collapsed); sticky: Promotion options (collapsed)); C's numbers count no extra reads for them.

The wrong value, as the form command reports it: "form node-article-form set: status is a yes/no field. Use true or false."
<!-- measure:end -->

## What it shows

- **Reading the page costs a browser agent 2.5 to 5 times more** than reading
  Sutram's commands, and that is with the cheapest view. As HTML the page is
  about 81,000 tokens; as screenshots, about 1,600 tokens per screen. Sutram
  exposes the same page, form and navigation alike, as one short list.
- **A correction costs 17 to 44 tokens with Sutram** and about 3,300 without
  it, because the browser agent gets no error and has to read the page again
  to see what happened. With Sutram the error names the field and the fix.
- **Hidden fields are free with Sutram.** `fields` lists all eleven, including
  the four the page hides behind toggles. The browser agent has to find them,
  click them open and read again; the numbers above do not even count that.
- **Sutram lets the agent choose.** Send everything in one call (B3), or one
  field at a time (B1, B2). Either way it corrects one value, not the whole
  form.
- **A hand-made schema (A) reads less, but someone has to write and maintain
  it for every form**, and it still resends every value after one mistake.
  Here it was built from Sutram's own field data.

## Run it yourself

```sh
node scripts/measure.mjs           # the table above
node scripts/measure.mjs --json    # the numbers
```

The docs build puts the script's output between the markers on this page, and
`npm run docs:check` fails when the page and the script disagree. To measure
another form, capture the same fields from your page (see the comments in
`scripts/measure.mjs`) and point the script at the file.
