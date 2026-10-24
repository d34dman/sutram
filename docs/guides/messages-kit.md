---
title: Messages kit
description: What the page said, such as Saved or an error, as a messages command and as message.shown events.
---

# Messages kit

After a save or a page change, apps show messages: "Saved", or what went
wrong. People read them on screen; the messages kit hands them to agents in
two ways, fed by one adapter function:

- The `messages` command lists them, for an agent that asks.
- Each message is emitted as a `message.shown` event, for an agent that reads
  `events recent`.

| Command | Does | Annotations |
|---|---|---|
| `messages` | The messages this page has shown, oldest first | read-only, `untrustedContent` |

When a command starts Sutram again, the note agents get says to look at
`messages` once the page is ready.

## The adapter

```js
import { messages } from "@d34dman/sutram/messages";

const shown = [];   // your app adds to it when it shows a message
messages({
  // The messages shown since the page loaded, oldest first.
  messages: () => shown,
  // Optional: say when new messages may have come without a new page.
  watch: (changed) => { app.onMessage = changed; return () => { app.onMessage = null; }; },
});
```

| Adapter key | Required | What it is |
|---|---|---|
| `messages()` | yes | `[{ type, text }]`, where `type` is `status`, `warning` or `error`. It may return a promise. |
| `watch(changed)` | no | Calls `changed()` when new messages may have come without a page load, such as after an AJAX request. May return a function that stops watching. |

The kit asks `messages()` when the command runs, once when the kit is set
up, and after each `changed()`. It emits `message.shown` for the messages
there are at the start, and after each `changed()` for those that are new:
the ones after the list it saw last, or all of them when the list starts
afresh (after a route change, say).

```text
> messages
type    text
status  Article Hello has been updated.
```

Give the text as people read it, without HTML.

## Without a bundler

Load `dist/messages.js` after `dist/sutram.js` and call
`Sutram.kits.messages()`. In Drupal, `drupal/sutram` ships it as the library
`sutram/messages`, and `sutram_demo_messages` is the adapter. See
[Drupal](../drupal.md).
