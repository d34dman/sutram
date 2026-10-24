---
title: Nav kit
description: Ready-made nav commands for any app. You write a small adapter that supplies the menus and goes to a URL.
---

# Nav kit

A kit is a set of commands that Sutram ships ready-made. It gives every app
the same command names, so an agent that has found its way around one site
can find its way around the next. The kit registers the commands, matches
what was typed, writes the errors and offers completion. Your app supplies
an **adapter**: the data, and the one action the kit cannot do itself.

The nav kit gives you four commands:

| Command | Does | Annotations |
|---|---|---|
| `nav status` | Where this page is in the menus | read-only |
| `nav menu [menu]` | The menus, or one menu's links with their path and description | read-only, `untrustedContent` |
| `nav search <query>` | Links whose title or description contains all the words | read-only, `untrustedContent` |
| `nav go <target>` | Goes to a link by path, title or breadcrumb, or to any path on the site | `navigates` or `reinitializes` |

`nav go` takes a path only when it leads to this site: it resolves the path
the way the browser would and refuses one that ends up elsewhere, such as
`/\example.com`. The adapter's `go()` gets the resolved path.

## The adapter

```js
import { nav } from "@d34dman/sutram/nav";

nav({
  // The menus, keyed by name. Called each time a command runs.
  menus: () => ({
    main: {
      label: "Main",
      items: [
        { title: "Home", url: "/" },
        {
          title: "Docs", url: "/docs", description: "How to use the app",
          children: [{ title: "Install", url: "/docs/install" }],
        },
      ],
    },
    footer: { label: "Footer", items: [{ title: "Contact", url: "/contact" }] },
  }),
  // Goes to a URL. Called after nav go has answered.
  go: (url) => location.assign(url),
  // Does going load a new page?
  reloads: true,
});
```

| Adapter key | Required | What it is |
|---|---|---|
| `menus()` | yes | The menus as `{ [name]: { label, items } }`. Each item has a `title` and a `url`, and may have an `id`, a `description` and `children`. It may return a promise. |
| `go(url)` | yes | Goes to the URL. The kit calls it after `nav go` has delivered its result, so the caller always gets an answer. Return `false` (or a promise of it, or reject) when the page did not leave, such as when a router handled it in place or the person stayed; Sutram then resumes on this page at once. |
| `reloads` | yes | `true` if going loads a new page, `false` for a client-side router. |
| `here()` | no | The current path, such as `/admin?tab=2`. The default is `location.pathname + location.search`. |

`nav()` returns a function that removes the four commands again. It refuses
an adapter without one of the required keys, and it registers nothing if a
`nav` command already belongs to another provider.

### Only the links the user may open

The kit shows whatever `menus()` returns. Leave out links that the current
user cannot open, the way your app's menus do, so that people and agents see
the same site.

### Ask, don't cache

The kit calls `menus()` every time a command runs, and again for completion.
Keep it cheap: return data the page already holds. Because the kit never
keeps a copy, a menu that changes (after a login, say, or a route change)
shows up in the next command without any work on your side.

## Full page loads or a router

`reloads` decides how `nav go` is marked, so that agents know what happens to
the page:

- **`reloads: true`**: `nav go` is marked
  [`navigates`](../concepts/annotations-and-policy.md). The page is left, and
  Sutram starts again on the new one.
- **`reloads: false`**: `nav go` is marked `reinitializes`. Your router shows
  the new route, and then your app calls `Sutram.initialized()` (or
  `registry.initialized()`). Until then, runs wait, so no command acts on the
  route that was left. Call it even when `go()` is asked for the route that is
  already showing:

```js
const here = () => location.hash.slice(1) || "/";
addEventListener("hashchange", () => { render(); Sutram.initialized(); });
nav({
  menus: () => menus,
  go: (url) => { if (url === here()) Sutram.initialized(); else location.hash = url; },
  reloads: false,
  here,
});
```

The [example page](https://d34dman.github.io/sutram/example/) uses this
adapter, with two static menus.

## What `nav go` accepts

In this order:

1. A link's path or `id`: `nav go /admin/content`.
2. A link's title, in any case: `nav go "content types"`.
3. A breadcrumb, which may leave out the top of the trail or start with the
   menu's label or name: `nav go Structure › Menus`, `nav go Footer › About`.
4. Any path that starts with a single `/`, like following a link to it.
   `//host` and full URLs to other sites are refused.

If a title matches links with different paths, `nav go` fails and lists
them, so the caller can pick the breadcrumb.

## Without a bundler

`dist/nav.js` is the kit as a file of its own. Load it after `dist/sutram.js`,
which it takes the registry from, and call `Sutram.kits.nav()`:

```html
<script type="module" src="sutram.js"></script>
<script type="module" src="nav.js"></script>
<script type="module">
  Sutram.kits.nav({ menus: () => MENUS, go: (url) => location.assign(url), reloads: true });
</script>
```

In Drupal, `drupal/sutram` ships it as the library `sutram/nav`, and
`sutram_demo_nav` is the adapter. See [Drupal](../drupal.md).
