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
any page, press <kbd>`</kbd> and type `help`. The library is shipped in the
module (`lib/sutram`); nothing is loaded from a CDN.

## Demo submodules

They are demos, not a stable API: try them, or copy them as a starting point.

| Module | Commands |
|---|---|
| `sutram_demo_nav` | `nav status`, `nav tree`, `nav find`, `nav go`: the menus you choose, access-checked for each user |
| `sutram_demo_page` | `page status`: the current page's title, route and entity |
| `sutram_demo_form` | `form <form-id> status`, `fields`, `get`, `set`, `save`, `discard` on content entity forms |

The form commands follow the [forms guide](guides/forms.md). Fields are
dotted paths such as `title` or `body.value`. `set` writes into the real
inputs (and CKEditor), so the form on screen and the commands agree. `save`
clicks the real Save button: Drupal validates, checks access and runs its
hooks as usual, and errors come back in `form <id> status`, by field.

```sh
form node-article-form fields
form node-article-form set title "Pour-over, step by step"
form node-article-form set field_tags "coffee, v60"
form node-article-form set status false
form node-article-form save
```

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
Drupal with the module and its submodules in DDEV.
