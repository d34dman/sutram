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
| `navigates: true` | Leaves the page. Implies `reinitializes` | Runs it; only as the last line of a pasted block | Told in the description that the page reloads |
| `reinitializes: true` | May start Sutram again, such as a single-page app swapping its commands | Runs it; only as the last line of a pasted block | Told in the description; see below |
| `untrustedContent: true` | Its output contains text from outside, such as user content | | Get `untrustedContentHint` |

`annotations` is required, even when it is `{}`, so nobody forgets to think
about it. Annotations are a contract with every client, so `register()`
refuses a key it does not know, such as a typo. They are Sutram's own words:
the WebMCP bridge translates them (`readOnly` becomes `readOnlyHint`) and
never sends a name WebMCP has not defined.

Word the question for a consequential command with `confirm`:

```js
confirm: ({ qty }) => `Place an order for ${qty} items, €48.00?`,
```

The question may describe the page as it is, such as the values a form
submit sends. Someone else can change the page while the user reads it: an
agent sets a field while the person thinks about "Submit Contact with 1
change?". So `confirm()` runs again just before the command does, and when
the question has changed, the command does not run (exit 130, "the page
changed while the user was asked"); run it again to be asked about the page
as it is now. Keep `confirm()` free of anything that changes on its own,
such as the time, or every approved run is refused.

## Starting again

Leaving the page throws away every command, event and answer on it, and a
single-page app that swaps its commands does much the same. The annotation
says a command *may* do this; the command says when it *does*, by calling
`reinitializes()` from its run context just before:

```js
register({
  name: "nav go",
  annotations: { navigates: true },
  run({ item }, { reinitializes }) {
    const url = find(item);
    if (!url) throw new CommandError(`No menu link "${item}".`);
    reinitializes();
    setTimeout(() => location.assign(url), 0);
    return { text: `Going to ${url}.` };
  },
  …
});
```

A command that fails, or does not need to leave this time, does not call it,
and nothing changes. A command that calls it without declaring `navigates` or
`reinitializes` fails. From the call on:

- `Sutram.ready` is a new promise. On a page being left it never resolves;
  the next page has its own. A single-page app resolves it with
  `Sutram.initialized()` once its new commands are registered.
- Runs are refused, with exit 130 and "Sutram is starting again", so a call
  that comes too early never gets an answer from the old page.
- Events from before are cleared.
- An agent's result ends with a note: wait until Sutram is ready, then look
  again.

App code outside a command, such as a single-page app's router, calls
`registry.reinitialize()` itself, or `registry.reinitialize({ navigates: true })`
before it leaves the page.

Sometimes the page is not left after all: the person clicks "Stay on page",
a router handles the URL in place, the URL only changes the `#hash`, the
browser blocks a form submit, or the page comes back from the back/forward
cache. When a command that declares `navigates` called `reinitializes()`,
Sutram starts on the same page again when something says so. Runs work again
and `Sutram.ready` resolves; nothing on the page is registered again. What
says so:

1. The adapter's answer, or `Sutram.initialized()`. A kit's adapter returns
   `false` from `go()`, `submit()`, `login()` or `logout()`, or rejects, when
   the page stayed, and Sutram resumes at once. App code calls
   `Sutram.initialized()` for the same.
2. The browser. The browser entry point (`browser.js`, `dist/sutram.js`)
   resumes on a `hashchange` or on a `pageshow` from the back/forward cache,
   and, where the browser has the Navigation API, when a navigation ends in
   the document (`navigatesuccess`) or is stopped (`navigateerror`, as when
   the person clicks "Stay on page" in Chromium).

Time alone never resumes it: a page that is still on its way out, such as
one sending a slow form POST, must not answer an agent, which could send the
form twice. So a navigation that ends without any of these signals leaves
runs refused until the page loads again or the app calls
`Sutram.initialized()`. The common case is a link that downloads a file: an
adapter whose `go()` starts a download returns `false`. Browsers without the
Navigation API (Firefox and Safari, at the time of writing) send no signal
after "Stay on page" either.

Step 2 applies only to `navigates`. After a `reinitializes` command, a
single-page app calls `Sutram.initialized()` itself once its new commands are
registered, or its adapter answers `false` when nothing changed.

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

When an agent needs approval, the approval dialog shows the commands it
wants to run and asks. A yes covers that call and nothing after it: with `"changes"`,
every change asks, every time. The dialog cannot tell who clicks, so no
answer may lower the level for the calls that follow.

- To ask in your own dialog:
  `policy.setAsker(async ({ who, steps }) => true | false)`. Only `true`
  is yes.
- Without `dist/sutram.js`, a console or an asker of your own, the
  browser's `confirm()` asks.
- `Sutram.call()` from a headless browser cannot ask anyone: a call that
  needs approval returns exit 130 and runs only when called again with
  `{ confirmed: true }`, which says the user agreed.
- App code that calls `registry.run()` is never asked. It is the app.
- The console cannot tell who is typing. Lines typed there follow the
  person's level, and an agent that drives the browser can answer the
  console's questions itself. So can an agent that also drives the
  approval dialog or the browser's `confirm()`. Only a question the agent cannot reach keeps
  it from approving its own calls: WebMCP, when the agent does not also
  drive the page. `Sutram.call()` asks nobody: its caller passes
  `{ confirmed: true }` itself.

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
