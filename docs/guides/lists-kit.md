---
title: Lists kit
description: list status, list rows and list go, the same on every site. Read listings, page through them, sort and filter them.
---

# Lists kit

Listings are where agents find what to work on: the content overview, the
people, the orders. The lists kit reads them. It changes nothing on the rows
themselves; it shows another page, sort or filter.

| Command | Does | Annotations |
|---|---|---|
| `list status` | The lists on this page: rows shown, page, sort, and the sorts and filters each offers | read-only |
| `list rows [list]` | The rows a list shows now, one value per column, with each row's link | read-only |
| `list go [list] --page --sort --order --filter` | Shows the list at another page, sort or filter, all in one go | `navigates` or `reinitializes` |

```text
> list status
Content (content): 50 rows of 132, page 1 of 3, sorted by changed desc. See list rows.
> list go content --filter=type=article,status=1 --sort=title
Showing Content, page 1, sorted by title asc, filtered by type=article, status=1. Then run list rows.
```

A new sort or filter starts at page 1. `--filter` takes `key=value` pairs,
separated by commas; `key=` clears a filter. Tab completes lists, sorts,
filter keys and the values of filters that are a choice.

## The adapter

```js
import { lists } from "@d34dman/sutram/lists";

lists({
  // The lists on this page. Called each time a command runs.
  lists: () => ({
    content: {
      label: "Content",
      columns: [{ key: "title", label: "Title" }, { key: "type", label: "Type" }],
      rows: [{ title: "Hello", type: "Article", url: "/node/5" }],
      page: 1, pages: 3, total: 132,
      sort: "changed", order: "desc",
      sorts: [{ key: "title", label: "Title" }, { key: "changed", label: "Updated" }],
      filters: [{ key: "type", label: "Type", value: "", options: [{ value: "article", label: "Article" }] }],
    },
  }),
  // Shows a list in a new state. Called after list go has answered.
  go: (list, { page, sort, order, filters }) => {
    const q = new URLSearchParams({ ...filters, page: page - 1, order: sort, sort: order });
    location.assign(`${location.pathname}?${q}`);
  },
  reloads: true,
});
```

| Adapter key | Required | What it is |
|---|---|---|
| `lists()` | yes | The lists, keyed by name. Each has `columns` and `rows`; `page` (from 1), `pages`, `total`, `sort`, `order`, `sorts` and `filters` are optional. A filter has a `key`, its `value` now (`""` when not set) and, for a choice, `options`. It may return a promise. |
| `go(list, state)` | yes | Shows the list in `state`: `{ page, sort?, order?, filters }`. The state is complete (filters not changed keep their value), so the adapter only builds its URL or query. |
| `reloads` | yes | `true` if `go()` loads a new page; `false` if your app shows the list in place. Then call `Sutram.initialized()` once it does, as for a router in the [nav kit](nav-kit.md#full-page-loads-or-a-router). |

Give the values as people read them, without HTML. A row's `url` is where
its link goes, such as the item it lists; pass it to `nav go`.

The kit only offers what `sorts` and `filters` list, so agents cannot ask for
a sort the list does not have. Leave out rows and filters the user may not
see, as the list on screen does.

## Without a bundler

Load `dist/lists.js` after `dist/sutram.js` and call `Sutram.kits.lists()`.
In Drupal, `drupal/sutram` ships it as the library `sutram/lists`, and
`sutram_demo_lists` is an adapter for Views. See [Drupal](../drupal.md).
