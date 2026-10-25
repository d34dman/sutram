---
title: Design notes
description: The first design note (12 October 2026) with later updates, for contributors. Parts have changed since; the other pages describe Sutram as it is.
---

# Sutram design

Status: draft, 12 Oct 2026. Open questions are at the end.

> **Update, 15 Oct 2026.** Open question 1 is answered: Sutram is an npm
> package (this repository), and the Drupal integration lives in
> `drupal-sutram-demo` for now. Some of this note has since changed, as
> described in the package README: `describe` became `status`, `help` and
> `man`; named arguments use GNU long options (`--at=hero-2`) instead of
> `at:hero-2`; results carry exit codes and declared output; and annotations
> outside WebMCP's fixed set go into the tool description instead of passing
> through unchanged.
>
> **Update, 16 Oct 2026.** Autocomplete is built: commands may define
> `suggest(key, partial)`. Who is asked before a command runs is now a page
> policy per kind of caller (person or agent), not the annotation alone, and
> WebMCP calls go through it. Batches run as one change when the provider
> defines batch hooks, and agents get a `sutram_batch` tool. The console can
> also sit inline in an app's own panel, and its texts can be translated.
> These came out of the study of replacing the FlowDrop Console with Sutram.

## What Sutram is

A standard way for JavaScript applications to expose their commands, so their
authors never have to build or ship a console of their own.

An app registers its commands once. Anyone on the page can then run them:

- a person, in the Sutram console;
- an AI agent, such as Claude through WebMCP;
- anything else that can call JavaScript on the page.

The contract is the product. The console is just one of its clients.

```
  JS app authors            Sutram                        Who runs the commands
  ──────────────            ──────                        ─────────────────────
  Canvas      ─┐                                       ┌─ a person, in the Sutram console
  FlowDrop    ─┼─ register ─→ registry + context ─────┼─ an AI agent, via WebMCP
  Form API    ─┤   commands    parse, route, help      └─ anything else that can call JS
  widgets     ─┘               (one definition)
```

### What Sutram is not

- **Not a replacement for drush.** It runs in the browser, inside an app the
  user already has open.
- **Not a server API.** Sutram never adds a way into the server. See
  [Security model](#security-model).

## Example

On a Canvas page, the user opens the Sutram console:

```
› help
canvas clear                         Remove every element from the canvas   consequential
canvas add block <type> [at:<ref>]   Add a block                            
canvas list blocks                   List the blocks on the canvas          read-only

› canvas add block heading at:hero-2
› canvas clear
  Clear the canvas? This removes 14 elements. (y/n)
```

`canvas clear` runs entirely in the browser. Nothing is sent to Drupal. Canvas
resets its own state, exactly as if the user had done it by hand.

`at:hero-2` means nothing to Sutram. It parses the line into a command, positional
arguments and named arguments, and hands them to the Canvas handler. Only Canvas
knows what a ref is.

## Who owns what

| Sutram owns (the shell) | The provider owns (Canvas, FlowDrop, a widget, …) |
|---|---|
| Opening it (a hotkey), the input line, output, history | The command definitions |
| Parsing: words, positional args, `key:value` args, `--flags`, quoted text | What the arguments mean |
| The registry, and which commands are available right now (context) | The handlers, which run in the browser and call the provider's own APIs |
| `help`, `describe`, did-you-mean for unknown commands | Suggestions for its own values, such as the refs that can follow `at:` |
| Autocomplete, which asks the provider for value suggestions | Whether and how its commands can be undone |
| Exposing the same registry as WebMCP tools | |

## A command definition

```js
sutram.register({
  name: "canvas add block",
  description: "Add a block to the canvas",
  args: {
    type: { type: "string", enum: ["heading", "paragraph", "image"], positional: 0 },
    at:   { type: "string", description: "Where to insert it", suggest: (text) => canvas.refs(text) },
  },
  annotations: {},
  run: (args, ctx) => canvas.addBlock(args.type, args.at),
});
```

The arguments are described as a schema. From that one definition Sutram
produces both:

- **for people:** text parsing, help and autocomplete:
  `canvas add block heading at:hero-2`;
- **for agents:** a tool with structured arguments:
  `canvas_add_block({ type: "heading", at: "hero-2" })`.

The handler receives the same parsed arguments either way, and does not know who
called it.

## Discovery comes first

Being able to find out what is possible matters as much as running commands. If
an agent cannot find out what a page offers and what state it is in, it falls back
to screenshots and guessing. Sutram makes discovery a core part of the contract,
not an afterthought.

There are three questions, each with its own command:

| Question | Command | Example |
|---|---|---|
| What can I do here? | `help`, `help <scope>` | `help`, `help canvas`, `help field_image` |
| What is this, and what state is it in? | `describe <thing>` | `describe field_image` |
| What values could go here? | autocomplete, and `suggest` on each argument | the refs after `at:` |

- `help` is generated from the command definitions, so it always matches what is
  actually available on the page right now.
- `describe` returns **current state**, not just documentation. For a media
  library widget: how many items are selected, and each item's meta properties
  (ID, name, type, alt text, …).
- Each answer is structured data. The console renders it as a readable table, and
  an agent gets the same data as JSON.

### The integration ladder

How well an app or widget works with Sutram depends on how much of this contract
it follows. The ladder makes that visible and gives integrators a clear next step:

| Level | The integration… | What people and agents get |
|---|---|---|
| 0 · Listed | is visible to Sutram, with no integration | "No integration yet: raw value only." At least nobody has to guess. |
| 1 · Described | answers `describe` with what it holds and its current state | Agents can read the page without screenshots |
| 2 · Writable | supports get and set through its own logic, so the UI stays in sync | Agents can fill it reliably |
| 3 · Commands | adds its own actions, with annotations | `field_image search "sunset"`, `canvas clear` |
| 4 · Suggests | offers values for its arguments | Autocomplete for people, real choices for agents |

This is a recommendation, not a requirement. Every level is useful on its own, and
the higher an integration goes, the better it works.

## Annotations

Commands can carry annotations. The set is open:

- **Known today:** `readOnly` and `consequential`, the same terms as WebMCP's
  `readOnlyHint` and `consequentialHint`, so nothing needs translating. They give
  three tiers:

  | Annotation | Meaning | Example |
  |---|---|---|
  | `readOnly` | changes nothing | `canvas list blocks`, `describe` |
  | neither (the default) | an ordinary write you would not think twice about | `canvas add block`, `form … set` |
  | `consequential` | significant, or hard to take back | `canvas clear`, `form … submit` |

  `consequential` stays rare on purpose: it only means something while it marks
  the exception. `form submit` is not destructive, but it does matter, which is
  why the word is "consequential" and not "destructive".
- **Possible later:** `slow`, `network` (talks to the server), `undoable`, …
- **Unknown keys pass through unchanged.** An app can add its own, and any
  client that understands them can use them. A new annotation never needs a new
  Sutram release.

Annotations describe a command. They do not enforce anything. Each client
decides what to do with them:

- **The console:** read-only lines run straight away, and a consequential line asks
  first. A pasted block is checked before anything runs. If it contains
  consequential lines, it asks **once** and names them: "2 of 5 lines are
  consequential: `canvas clear`, `canvas delete …`. Run all?"
- **Agents (WebMCP):** annotations become the tool hints, so the agent's host can
  run read-only calls in a batch and ask the user before consequential ones.
- **Scripts (`Sutram.call`):** headless browsers, tests and agents that run
  JavaScript in the page call tools by name. A consequential tool asks the
  person in the page's approval dialog, as a WebMCP call does; on a page with
  nobody to ask, it does not run. The registry's own `run()` stays neutral: it
  is for app code.

## Keeping clients up to date

Every client sees the same live list of commands, with their annotations.
Commands come and go as the page changes: a form opens, a selection changes, an
AJAX rebuild replaces part of the page. When a command appears, disappears or
changes its annotations, Sutram sends a change event. So:

- `help` always matches what is available right now;
- an agent never acts on a list that is out of date.

## Security model

Sutram runs in the browser and can only do what the page's JavaScript can already
do. That is a deliberate choice, and it means Sutram checks no permissions:

- **It adds no way into the server.** A handler that talks to Drupal uses the
  app's own endpoints, with the user's session. Drupal checks access there, the
  same as when the user clicks the button.
- **It cannot grant more than the user has.** Typing `canvas clear` is the same
  as clearing the canvas by hand. If a provider registers a command the user is
  not allowed to complete, the server refuses it the same way it would refuse the
  click.
- **Third-party commands are not a new risk.** A script on the page that
  registers commands can already do anything those commands could.

The one real change is that **agents** become callers, and they act quickly with
all of the user's permissions. Annotations handle that: they let a client ask the
user before a consequential command, without Sutram becoming a permission system.
The policy is etiquette, not a lock: `registry.run()` skips the question, and
code running in the page could click *Yes* or the page's buttons just as well. Access control stays on the server.

## Forms and widgets

### `sutram_form`: Form API as a provider

A submodule that exposes Drupal forms as commands. Site builders choose which
forms to expose, either per form ID in settings or with `#sutram` in code.

- **Server side:** a form alter adds a description of each exposed form: its
  elements, labels, types, required flags, allowed options and descriptions.
  Form API knows far more than the rendered HTML, so autocomplete and agents get
  real choices instead of guessing.
- **Browser side:** commands for each exposed form on the page fill the real form
  fields, so the page stays in sync with what was typed.

```
form node_article_form fields              read-only
form node_article_form set title "Hello"
form node_article_form set status on
form node_article_form submit              consequential: asks first
```

`submit` is the same as clicking Save. Drupal validates and checks access as
usual, and validation errors come back as command output.

`sutram_form` handles plain elements itself: text fields, checkboxes, radios and
selects.

### Widgets plug in themselves

Complex widgets are the main reason this API should exist. Media library, entity
autocomplete, CKEditor and date pickers are where agents struggle today. They
take screenshots, guess which modal to open, and click through it.

Sutram does not write adapters for other people's widgets. **Each widget
integrates itself**, the same way apps register commands. The widget's author
knows how it works:

| Part | Example: media library on `field_image` |
|---|---|
| describe: what it holds, and its current state | "2 of up to 3 Image items: #12 *Sunset* (alt: …), #15 *Harbour* (alt: …)" |
| get / set, through the widget's own logic | `set field_image media:12,media:15` |
| its own commands | `field_image search "sunset"` (read-only), `field_image remove 15` (consequential) |
| suggest | media matching what has been typed so far |

`sutram_form` hands over to a widget's integration whenever one is registered. A
widget with no integration is still listed at level 0 of the ladder. An agent can
then see what it cannot do yet, and the list shows which integrations to build
next.

**To start with:** we build integrations for entity autocomplete, media library
and date/time ourselves. They show contrib authors what a widget integration
looks like. After that, each widget's own maintainers take over.

## Prior art

| Project | What it does | Difference |
|---|---|---|
| [FlowDrop Console](https://flowdrop.io/blog/the-flowdrop-console) | A console for the FlowDrop editor | Sutram makes that idea general, for any app |
| [Coffee](https://drupal.org/project/coffee) | An Alt+D palette for jumping to admin pages | It only navigates |
| WebMCP form modules, and WebMCP's declarative form tools | Turn chosen forms into agent tools | One tool per form, forms only, agents only |
| [agentk](https://github.com/stevysmith/agentk) | A flat catalog of MCP-style tools (`name`, `description`, `inputSchema`) for one app, shown in a React ⌘K palette with generated forms and registered with WebMCP. Optional agent mode with approval tiers from the WebMCP hints. | Tools first, with a form for each. No typed command line, one catalog owner instead of many providers, no `describe` of current state, no commands that come and go with page state. Its rule "one consequential call and the whole plan waits" matches our batch rule. |

## Open questions

1. **A general npm package or a Drupal-only module?** Nothing in the contract
   depends on Drupal, and widgets such as CKEditor and date pickers are general
   JavaScript. That favours an npm package with this Drupal module as its first
   host. A Drupal-only module is simpler to start.
2. **Namespaces.** Does every provider get its own top-level word (`canvas …`),
   with `help`, `describe` and `clear` reserved for Sutram? Can a page's main
   provider leave out its prefix?
3. **Argument syntax.** Is `key:value` the standard for named arguments, next to
   `--flags`?
4. **The first provider:** `sutram_form`, Canvas or FlowDrop?
