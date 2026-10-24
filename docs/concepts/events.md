---
title: Events
description: Facts a page declares and emits, and how agents wait or poll for what changed.
---

# Events

Commands are for intent: "please do this". Events are for facts: "this
happened". They are optional.

```js
import { getEvents } from "@d34dman/sutram/events";

const events = getEvents();
events.define("cart.changed", {
  description: "The cart changed",
  payload: {
    type: "object",
    properties: { count: { type: "integer" } },
    required: ["count"],
  },
});

events.emit("cart.changed", { count: 2 }, { source: "agent" });
events.on("cart.changed", (e) => render(), { as: "cart badge" });
```

Only declared events can be emitted, and payloads are checked against their
schema.

## For agents: wait, or poll

Agents cannot be notified, so they ask. Declaring events adds three commands:

- `events list`: the events this page declares.
- `events recent --since=<id>`: the events after an id.
- `events wait <name> --since=<id> --timeout=<seconds>`: returns the first
  matching event after the id, at once when the page already keeps one,
  otherwise as soon as it is emitted. Without a name it takes any event;
  without `--since` it waits for the next one. It gives up after 10 seconds
  by default, 60 at most, and then fails (exit 1) with the line that keeps
  waiting without missing one.

`events wait` saves an agent the loop of asking `events recent` again and
again after something that finishes later: a field the form loads, a list
that reloads, a message after a save.

```
form submit node-article-form
events wait message.shown --since=12
```

In a [batch](batches.md), a wait that times out fails the batch like any
other command.

In JavaScript, `events.next(name, { since, timeout, signal })` does the
same and resolves to the event, or to `null` (the timeout is in
milliseconds there):

```js
const event = await events.next("cart.changed", { timeout: 5000 });
```

The page keeps the last 50, and forgets older ones when Sutram starts again
(a command calls `reinitializes()`, or the app calls
`registry.reinitialize()`; see [Annotations and the policy](annotations-and-policy.md#starting-again)).
