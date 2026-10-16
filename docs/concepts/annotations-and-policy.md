---
title: Annotations and the policy
description: How commands describe what they do, and how the page decides who has to agree before one runs.
---

# Annotations and the policy

Annotations describe a command. The policy decides who has to agree before
it runs. Keep the two apart: a command says it is consequential; the page
decides whether that means asking.

## Annotations

| Annotation | Means | The console | Agents |
|---|---|---|---|
| *(none)* | An ordinary change | Runs it | Can call it, unless the policy asks first |
| `readOnly: true` | Changes nothing | Runs it; marks it read-only | Get `readOnlyHint` |
| `consequential: true` | Significant or hard to undo | Asks first (a pasted batch asks once) | Get `consequentialHint`; the page asks the user first |
| `navigates: true` | Leaves the page | Runs it | Told in the description that the page reloads |
| `untrustedContent: true` | Its output contains text from outside, such as user content | | Get `untrustedContentHint` |

`annotations` is required, even when it is `{}`, so nobody forgets to think
about it. Word the question for a consequential command with `confirm`:

```js
confirm: ({ qty }) => `Place an order for ${qty} items, €48.00?`,
```

## The policy

There are two kinds of caller, a person at the console and an agent, and
three levels:

| Level | Asks before |
|---|---|
| `"none"` | nothing |
| `"consequential"` (the default for both) | consequential commands |
| `"changes"` | every command that is not read-only |

```js
// An editor where an agent never changes the document unseen,
// while people at the console are only asked about consequential commands:
getRegistry().policy.set({ agent: "changes" });
```

When an agent needs approval, the console shows the commands it wants to run
and asks. With `"changes"`, the user can answer *Yes, and stop asking*,
which lowers that caller to `"consequential"` for the rest of the page's
life; it never covers a consequential command.

- To ask in your own dialog:
  `policy.setAsker(async ({ who, steps }) => true | false | "always")`.
- Without a console or an asker, the browser's `confirm()` asks.
- `Sutram.call()` from a headless browser cannot ask anyone: a call that
  needs approval returns exit 130 and runs only when called again with
  `{ confirmed: true }`, which says the user agreed.
- App code that calls `registry.run()` is never asked. It is the app.

`confirmed` is a courtesy between a caller and its user, not a security
boundary. Any code in the page can pass it, or call `registry.run()`
directly. The policy makes well-behaved agents ask; it cannot stop code that
already runs in the page, which could click the buttons just as well.

## Why the page decides

WebMCP decides which sites' tools an agent may see. It does not decide
whether a call may change the user's page. So every agent call goes through
the page's policy first, whoever the agent is.

## Security

Commands run in the browser with the user's own session. They can do exactly
what the user could already do, and nothing more: Sutram adds no new way into
your server. Access checks stay where they are, on the server.
