---
title: User kit
description: user status, user login and user logout, the same on every site. Your adapter says who is logged in and opens your own login.
---

# User kit

The user kit gives you three commands:

| Command | Does | Annotations |
|---|---|---|
| `user status` | Whether you are logged in, and as whom | read-only |
| `user login` | Opens your app's login, and comes back to this page after | `navigates` or `reinitializes` |
| `user logout` | Logs out, and comes back to this page | `navigates` or `reinitializes`, consequential |

A password never passes through a command. `user login` only opens your
login; the person types the password there, and the agent carries on as that
user.

## The adapter

```js
import { user } from "@d34dman/sutram/user";

const back = () => encodeURIComponent(location.pathname + location.search);
user({
  // Who is logged in. Called each time a command runs.
  user: () => ({ authenticated: true, id: "7", name: "ada", roles: [{ id: "editor", label: "Editor" }] }),
  // Called after the command has answered.
  login: () => location.assign(`/login?destination=${back()}`),
  logout: () => location.assign(`/logout?destination=${back()}`),
  // Do logging in and out load a new page?
  reloads: true,
});
```

| Adapter key | Required | What it is |
|---|---|---|
| `user()` | yes | `{ authenticated, id?, name?, roles? }`. Roles are ids, or `{ id, label }`. It may return a promise. |
| `login()` | yes | Opens the login and comes back to this page. The kit calls it after `user login` has answered, and only when nobody is logged in. Return `false` (or reject) when the page did not leave, such as when the person stayed; Sutram then resumes on this page at once. |
| `logout()` | yes | Logs out and comes back. Called after `user logout` has answered, and only when someone is logged in. Return `false` (or reject) when the page did not leave. |
| `reloads` | yes | `true` if logging in and out loads a new page; `false` if your app stays on the page, as with a login dialog. |

Secrets your app needs to log out, such as a CSRF token, stay in the
adapter: the kit never sees them.

With `reloads: false`, the commands are marked `reinitializes`. Show the new
user, then call `Sutram.initialized()`, as for a router in the
[nav kit](nav-kit.md#full-page-loads-or-a-router).

## Noticing a change of user

The kit keeps nothing between pages, like the rest of Sutram. If your app
wants to tell agents that someone else is now logged in, it compares with
what it remembered and emits an event of its own. The Drupal module does
that: it emits `user.changed`.

## Without a bundler

Load `dist/user.js` after `dist/sutram.js` and call `Sutram.kits.user()`. In
Drupal, `drupal/sutram` ships it as the library `sutram/user`, and
`sutram_demo_user` is the adapter. See [Drupal](../drupal.md).
