---
title: Drupal
description: The drupal/sutram module, its demo submodules, and how a Drupal module adds commands.
---

# Drupal

[`drupal/sutram`](https://www.drupal.org/project/sutram) ships the Sutram
library and opens the console for users with the *Use Sutram* permission. It
registers no Drupal commands of its own; other modules do that, and its demo
submodules show how.

```sh
composer require drupal/sutram
drush en sutram
```

Give the *Use Sutram* permission to the roles that should have it. Then, on
any page, press <kbd>`</kbd> (the key left of <kbd>1</kbd>), or
<kbd>Ctrl</kbd>+<kbd>`</kbd> inside a text field, and type `help`. The library is shipped in the
module (`lib/sutram`); nothing is loaded from a CDN.

## Demo submodules

They are demos, not a stable API: try them, or copy them as a starting point.

- **`sutram_demo_nav`**: `nav status`, `nav menu`, `nav search` and `nav go`
  over the menus you choose. Each user sees only the links they may open. The
  commands come from the [nav kit](guides/nav-kit.md) (the library
  `sutram/nav`); the submodule is only its adapter.
- **`sutram_demo_page`**: `page status`, the page's title, route and entity,
  from the [page kit](guides/page-kit.md) (`sutram/page`).
- **`sutram_demo_user`**: `user status`, `user login` and `user logout`, from
  the [user kit](guides/user-kit.md) (`sutram/user`). `user login` opens
  Drupal's login page; the person types the password. The submodule also
  emits `user.changed` when the page comes back as someone else.
- **`sutram_demo_messages`**: Drupal's status messages, after a page load or
  an AJAX request, as the `messages` command and `message.shown` events, from
  the [messages kit](guides/messages-kit.md) (`sutram/messages`).
- **`sutram_demo_lists`**: Views listings on the page, such as the content
  overview, as `list status`, `list rows` and `list go`, from the
  [lists kit](guides/lists-kit.md) (`sutram/lists`): rows, pages, table
  sorts and exposed filters.
- **`sutram_demo_form`**: fill in and submit content forms, an adapter for
  the [forms kit](guides/forms-kit.md) (`sutram/forms`). See below.
- **`sutram_demo_canvas`**: build pages in the
  [Drupal Canvas](https://www.drupal.org/project/canvas) editor. See below.

### Forms

The form commands follow the [forms guide](guides/forms.md). They are
registered once and look the form up when they run, so a form that arrives by
AJAX (in a dialog, say) works too, and a form that has gone answers "not on
this page". Fields are
dotted paths such as `title` or `body.value`. `set` writes into the real
inputs (and CKEditor), so the form on screen and the commands agree. `submit`
clicks the real Save button: Drupal validates, checks access and runs its
hooks as usual, and errors come back in `form status <form>`, by field.

```text
form fields node-article-form
form set node-article-form title "Pour-over, step by step"
form set node-article-form field_tags "coffee, v60"
form set node-article-form status false
form submit node-article-form
```

### Canvas

In the Canvas editor, the `canvas` commands add, change, move and remove
components, and set the page's title, URL alias and description. They go
through Canvas itself, so every change shows in the preview, can be undone
and saves as a draft.

```text
canvas components
canvas page set title "Our coffee"
canvas add heading --as=top
canvas set top text "Fresh every week"
canvas add card --after=top --as=intro
canvas set intro title "Single origin"
```

Pasted together, these lines run as one [batch](concepts/batches.md): if one
fails, Canvas's undo takes back the others. `--as` names a new component so
later lines can refer to it. `canvas tree` shows the page, `canvas undo` takes
back the last change.

`canvas publish` is off by default. A site builder turns it on at
*Configuration › Development › Sutram Demo Canvas*, and it is offered only to
users who may publish in Canvas. It asks every time.

## Add commands from your module

Define a library that depends on `sutram/sutram`, attach it where the
commands make sense, and register them:

```yaml
# mymodule.libraries.yml
commands:
  js:
    js/mymodule.sutram.js: { attributes: { type: module }, preprocess: false }
  dependencies:
    - sutram/sutram
```

```js
// js/mymodule.sutram.js
globalThis.Sutram.register({
  name: "cache clear",
  provider: "cache",
  description: "Clear all caches",
  input: { type: "object", properties: {} },
  annotations: { consequential: true },
  run: async () => { /* call one of your module's own routes */ },
});
```

Pass what the commands need from PHP in `drupalSettings`, as the demo form
module does. Commands run in the browser with the user's session, so they can
do only what the user can already do. Check access on the server, in the
routes your commands call, as you would for a button.

## Try it

The [demo site](https://github.com/d34dman/drupal-sutram-demo) installs
Drupal with the module, its submodules and Canvas in DDEV, with an empty
Canvas page to build from the console.
