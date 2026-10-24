---
title: Page kit
description: page status, the same on every site. Your adapter says what the page is; the kit answers.
---

# Page kit

The page kit gives you one command, `page status`. It says what the page is:
its title, its route and the thing it shows, such as an article. Agents run
it first on every page (`status` runs every provider's status command), so
they know where they are before they act.

| Command | Does | Annotations |
|---|---|---|
| `page status` | The page's title, path, route and the thing it shows | read-only |

## The adapter

```js
import { page } from "@d34dman/sutram/page";

page({
  // What this page is. Called each time page status runs.
  page: () => ({
    title: document.title,
    route: "article",
    entity: { type: "node", id: "5", bundle: "article", label: "Hello" },
  }),
});
```

| Adapter key | Required | What it is |
|---|---|---|
| `page()` | yes | `{ title, route?, entity? }`. `entity` is what the page shows: `{ type, id, bundle?, label? }`. It may return a promise. |
| `here()` | no | The current path, such as `/node/5?page=2`. The default is `location.pathname + location.search`. |

`route` is the app's own name for the kind of page, such as Drupal's
`entity.node.canonical`. Leave out what your app does not have.

```text
> page status
"Hello", route article. It shows node 5 (article): "Hello".
```

The kit asks every time, so a client-side router needs no extra work: return
what the current route shows. Only describe what the user may see.

## Without a bundler

Load `dist/page.js` after `dist/sutram.js` and call `Sutram.kits.page()`. In
Drupal, `drupal/sutram` ships it as the library `sutram/page`, and
`sutram_demo_page` is the adapter. See [Drupal](../drupal.md).
