---
title: Install
description: Install Sutram from npm, load it as one script, or use the Drupal module.
---

# Install

## npm

```sh
npm install @d34dman/sutram
```

With a bundler, import what you need:

```js
import { getRegistry } from "@d34dman/sutram";
import { mountConsole } from "@d34dman/sutram/console";
import { connectWebMCP } from "@d34dman/sutram/webmcp";

const registry = getRegistry();
registry.register({ /* a command */ });

// The console, for people.
mountConsole();
// The same commands as WebMCP tools, where the browser supports them.
connectWebMCP(registry);
```

TypeScript declarations ship with the package (`types/`), for every entry
point and for `globalThis.Sutram`.

## One script, no bundler

Load `dist/sutram.js` from the package, or from a CDN. It sets up the console
and WebMCP and exposes everything as `globalThis.Sutram`:

```html
<script type="module" src="/path/to/sutram.js"></script>
<script type="module">
  Sutram.register({ /* … */ });
  Sutram.mountConsole();
</script>
```

From a CDN, pin the minor version:
`https://cdn.jsdelivr.net/npm/@d34dman/sutram@0.3/dist/sutram.js`.

`dist/sutram.min.js` is the same code without comments and indentation,
about a quarter smaller. Names are not shortened, so stack traces still read.

## Entry points

| Import | What it is | Needs a DOM |
|---|---|---|
| `@d34dman/sutram` | What app authors use: the registry, formats, the policy, `commandLine()`, `agentPrompt()` | no |
| `@d34dman/sutram/client` | For a client of your own: parse and complete command lines, check input, run status, format results | no |
| `@d34dman/sutram/console` | `<sutram-console>`, the console, as a web component | yes |
| `@d34dman/sutram/webmcp` | Mirrors the registry into `document.modelContext` as WebMCP tools | no |
| `@d34dman/sutram/events` | Events your app declares and emits, and the `events list` and `events recent` commands | no |
| `@d34dman/sutram/browser` | `globalThis.Sutram`: the registry and its helpers, with `/client` as `Sutram.client` | yes |
| `@d34dman/sutram/dist/sutram.js` | The same as `browser`, bundled into one file; `sutram.min.js` stripped | yes |
| `@d34dman/sutram/internals` | Helpers Sutram uses itself. No semver promise | no |

## Several copies on one page

If two scripts each bundle their own copy of Sutram, they still share one
registry, one format registry and one event bus, so every command ends up in
the same console and the same tool list.

## Drupal

`composer require drupal/sutram`, then enable the module. It ships the
package build; nothing is loaded from a CDN. See [Drupal](drupal.md).
