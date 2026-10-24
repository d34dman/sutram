---
title: Why commands
description: Why agents do better with a standard command interface than with screenshots, page snapshots or one big JSON schema.
---

# Why commands

Without Sutram, an agent that wants to use a web app has two options.

- **Read the page.** Take screenshots or an accessibility snapshot, work out
  what is on the page, find the right elements, click and type, and read the
  page again to see whether it worked. It is slow, it costs tokens on every
  step, and it breaks when the layout changes. A headless browser and the
  user's own browser behave differently, so the experience is not the same
  either.
- **Call an API built for agents.** Someone writes a tool, with a schema, for
  every action. That is work for every form and every page, and it usually
  means a new way into the server, with its own login.

Sutram is the third option: **a standard interface on the page itself.** Any
part of the app (a form, the navigation, an editor, a module) hooks in the
same way, by registering commands. Agents find them with `help`, run them one
at a time or in one batch, and correct what goes wrong:

```sh
form fields node-article-form
form set node-article-form title "Pour-over, step by step"
form set node-article-form field_tags "coffee, v60"
form set node-article-form status false
form submit node-article-form
```

Each command has a JSON Schema for its input, and agents with WebMCP get it
as a tool. So an agent can also send everything in one go first, and fix
single values after.

## In the user's session

Commands run in the browser, as the logged-in user. A person can log in, then
let an agent take over: it can do exactly what the person could already do,
and nothing more. There is no new API, no extra login and no service account.
Access checks stay on the server, where they are today.

## The same everywhere

The same commands answer the same way whether the agent drives a headless
browser, uses WebMCP in the person's browser, runs JavaScript in the page, or
types into the console. Nothing
depends on screen size, layout or how the page looks.

## Precise edits

`form set <form> title "Foo"` changes one field and nothing else. With one
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
› form set request topic billing
topic set. The form now also asks for: invoice, amount.
```

The [forms example](https://d34dman.github.io/sutram/example/forms.html) does
exactly this. The coffee shop on the home page does it at small scale: the
`checkout` command exists only once the cart has something in it.

## Errors the agent can act on

When a command fails, the message names the command and what is wrong:

```
› form set node-article-form status draft
form set: status is a yes/no field. Use true or false.
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
- **Save on purpose.** Changes go into the page's working copy. `submit` sends
  them; `discard` throws them away. Nothing is saved as a side effect. See
  [Drafts and saving](guides/drafts-and-saving.md).
- **Readable by people.** Every agent call is a command line a person can
  read, repeat, paste into a bug report, or type themselves.

## What it costs in tokens

We measured on a real form, Drupal's "Create Article", with one wrong value.
The method and all numbers are in [Measurements](measurements.md). The
figures are estimates (bytes ÷ 4), captured with Sutram 0.3 and 0.4, before
the kits; they have not been measured again yet. In short:

- **Reading the page:** a browser agent reads about 3,300 tokens of
  accessibility snapshot (about 81,000 as HTML, about 1,600 per screenshot).
  With Sutram, the agent reads about 650 tokens of `help` and field list, or
  about 1,200 through the full WebMCP tool list.
- **Correcting one wrong value:** 17 to 44 tokens with Sutram. Without it,
  about 3,300: the browser agent gets no error message, so it reads the page
  again to find out what happened.
- **Hidden fields:** four of the form's fields sit behind toggles. Sutram's
  field list shows them; a browser agent has to find them and click them open.

A schema written by hand for this one form would read even less, but someone
has to write it for every form, and it resends every value after one mistake.

## Why not just WebMCP?

WebMCP is how a page hands tools to an agent. It does not say which tools a
page has, how they are named, or how many parts of an app share one page.
Sutram is that layer, and WebMCP is one of the ways out of it.

- **Many providers, one page.** On a Drupal page a dozen modules may each want
  to expose something. With plain WebMCP each registers its own tools, with
  its own names. With Sutram they share one registry and one command grammar.
- **People see what agents see.** WebMCP tools are invisible to people. Every
  Sutram command is also a line in the console, so a person can type exactly
  what the agent would call and watch what it runs.
- **Few tools, stable list.** `form set <form> …` is the tool `form_set` for
  every form, not one tool per form. Commands look up their target when they
  run, so the tool list stays put while content comes and goes.
- **What WebMCP leaves out.** Discovery (`help`, `man`, status), errors that
  name the fix, changes to poll ([events](concepts/events.md)) and app-defined
  [formats](concepts/formats.md).
- **Works before WebMCP does.** Browser agents and tests call the same
  commands through `Sutram.call()` today.

Sutram registers its tools through WebMCP's own `registerTool()` and never
reads or changes the page's HTML. It does not replace Playwright or browser
agents: they drive the browser, and Sutram gives them commands to call
instead of buttons to click.

## When one tool is enough

For one app with a few fixed actions, a plain WebMCP tool with a schema is
fine. That is exactly what each Sutram command is through WebMCP. Sutram earns
its place when several parts of an app share a page, or when people should
use the same commands as the agent.

## Next

- [Quick start](quick-start.md): a command in five minutes.
- [Forms](guides/forms.md): field-level commands and progressive forms.
- [Write descriptions agents can use](guides/descriptions.md).
