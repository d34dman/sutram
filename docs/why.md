---
title: Why commands
description: Why an agent does better with small commands it can discover than with one JSON schema for the whole thing.
---

# Why commands, not one big schema

The obvious way to let an agent use a form is one tool: its input schema
describes every field, and the agent sends the filled-in form as one JSON
object. It works for small, fixed forms. It breaks down when the form is
real.

Sutram gives the agent small commands instead. It finds them with `help`,
runs them one at a time, and corrects what goes wrong:

```sh
form node-article-form fields
form node-article-form set title "Pour-over, step by step"
form node-article-form set field_tags "coffee, v60"
form node-article-form set status false
form node-article-form save
```

Each command still has a JSON Schema for its input, and agents with WebMCP get
it as a tool. So this is not schemas against no schemas. It is schemas the
size of one change, instead of one schema the size of everything.

## Precise edits

`form <id> set title "Foo"` changes one field and nothing else. With one
schema for the whole form, the agent writes every field, including the ones it
did not mean to touch, and one wrong value fails or overwrites all of it.

For an existing article with a long body, that matters more: changing the
title should not mean reading the body and sending it back.

## Forms that change as you fill them

Real forms are not fixed. Pick "billing" and the form asks for an invoice
number. Tick "call me back" and it wants a phone number. Drupal has
conditional fields, AJAX widgets, paragraphs and multi-step forms.

A schema written up front cannot describe fields that do not exist yet. With
commands the agent answers, and the result says what appeared:

```
› form request set topic billing
topic set. The form now also asks for: invoice, amount.
```

The [forms example](https://d34dman.github.io/sutram/example/forms.html) does
exactly this. The coffee shop on the home page does it at small scale: the
`checkout` command exists only once the cart has something in it.

## Errors the agent can act on

When a command fails, the message names the command and what is wrong:

```
› form node-article-form set status draft
form node-article-form set: status is a yes/no field. Use true or false.
```

The agent fixes that one line and carries on. The fields it already set stay
set. With one schema, a rejected call means nothing was applied, and the agent
sends the whole object again.

Exit codes say what kind of failure it was: `2` for input that did not fit,
`127` for a command that does not exist (with "did you mean"), `1` for a
command that ran and failed, `130` for one that was not allowed to run. See
[Results and exit codes](concepts/results.md).

## Control, and a person in the loop

- **Read first.** `status` shows what every part of the page reports.
  Commands marked read-only change nothing.
- **Ask before what matters.** Annotations mark what is consequential, and
  the page's policy decides who has to agree. See
  [Annotations and the policy](concepts/annotations-and-policy.md).
- **Save on purpose.** Changes go into the page's working copy. `save` sends
  them; `discard` throws them away. Nothing is saved as a side effect. See
  [Drafts and saving](guides/drafts-and-saving.md).
- **Readable by people.** Every agent call is a command line a person can
  read, repeat, paste into a bug report, or type themselves.

## What it costs in tokens

We measured on a real form, Drupal's "Create Article", with one wrong value.
The full method and numbers are in [Measurements](measurements.md). In short:

- **The first fill of a small form is cheaper with one schema.** The agent
  reads one schema and writes one object. Sutram's agent reads the commands
  and the field list first, and writes a command per field.
- **Fixing a mistake is much cheaper with commands.** After one wrong value,
  the console path sends about 17 tokens again, WebMCP about 32. One schema
  sends the whole object again: 70 to 97 tokens on this form, and more on
  every larger one.
- **Discovering a whole page is cheaper with `help`.** On the same page,
  `help` is about a third of the size of the full tool list (≈416 against
  ≈1,235 tokens), because it costs one line per command and the details wait
  in `man` until they are needed.

So the honest claim is not "fewer tokens, always". It is: cheap discovery,
cheap corrections, and nothing to resend when one value is wrong. On a form
that changes as it is filled in, one schema cannot do the job at all.

## When one tool is enough

For one simple action with a fixed input, a plain tool with a schema is fine.
That is exactly what each Sutram command is through WebMCP. Sutram earns its
keep when there is state to look at, several steps, forms that change, and
mistakes to fix.

## Next

- [Quick start](quick-start.md): a command in five minutes.
- [Forms](guides/forms.md): field-level commands and progressive forms.
- [Write descriptions agents can use](guides/descriptions.md).
