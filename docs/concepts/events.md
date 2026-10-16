---
title: Events
description: Facts a page declares and emits, and how agents poll for what changed.
---

# Events

Commands are for intent: "please do this". Events are for facts: "this
happened". They are optional.

```js
import { getEvents } from "@d34dman/sutram/events";

const events = getEvents();
events.define("cart.changed", {
  description: "The cart changed",
  payload: { type: "object", properties: { count: { type: "integer" } }, required: ["count"] },
});

events.emit("cart.changed", { count: 2 }, { source: "agent" });
events.on("cart.changed", (e) => render(), { as: "cart badge" });
```

Only declared events can be emitted, and payloads are checked against their
schema.

## For agents: poll

Agents cannot be notified, so they poll. Declaring events adds two commands:

- `events list`: the events this page declares.
- `events recent --since=<id>`: the events after an id.

The page keeps the last 50, and forgets older ones when a `navigates` command
leaves the page. Single-page apps that change page without such a command
call `getEvents().clear()` themselves.
