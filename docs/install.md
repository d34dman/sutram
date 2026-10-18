---
title: Install
description: Load Sutram as one script, install it from npm, or use the Drupal module.
---

# Install

## One script, no bundler

Load `dist/sutram.js` from a CDN, or from the package. It registers your
commands as WebMCP tools where the browser supports them, and exposes
everything as `globalThis.Sutram`. Mount the console where you want it:

```html
<script type="module">
  import Sutram from
    "https://cdn.jsdelivr.net/npm/@d34dman/sutram@0.5/dist/sutram.js";

  Sutram.register({ /* a command */ });
  Sutram.mountConsole();
</script>
```

Pin the minor version, as above. `dist/sutram.min.js` is the same code
without comments and indentation, about a quarter smaller. Names are not
shortened, so stack traces still read.

## npm

```sh
npm install @d34dman/sutram
```

With a bundler, import the registry, the console and WebMCP:

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

Unlike the one-script build, the modules do nothing until you call them, so
remember `connectWebMCP()`. TypeScript declarations ship with the package
(`types/`), for every entry point and for `globalThis.Sutram`.

## Drupal

`composer require drupal/sutram`, then enable the module. It ships the
package build; nothing is loaded from a CDN. See [Drupal](drupal.md).

## Details

### Entry points

You need the first three, or only the one-script build. The others are for
special cases.

| Import | What it is | Needs a DOM |
|---|---|---|
| `@d34dman/sutram` | What app authors use: the registry, formats, the policy, `commandLine()`, `agentPrompt()` | no |
| `@d34dman/sutram/console` | `<sutram-console>`, the console, as a web component | yes |
| `@d34dman/sutram/webmcp` | Mirrors the registry into `document.modelContext` as WebMCP tools | no |
| `@d34dman/sutram/events` | Events your app declares and emits, and the `events list` and `events recent` commands | no |
| `@d34dman/sutram/client` | For a client of your own: parse and complete command lines, check input, run status, format results | no |
| `@d34dman/sutram/browser` | `globalThis.Sutram`: the registry and its helpers, with `/client` as `Sutram.client` | yes |
| `@d34dman/sutram/dist/sutram.js` | The same as `browser`, bundled into one file; `sutram.min.js` stripped | yes |
| `@d34dman/sutram/internals` | Helpers Sutram uses itself. No semver promise | no |

### Several copies on one page

If two scripts each bundle their own copy of Sutram, they still share one
registry, one format registry and one event bus, so every command ends up in
the same console and the same tool list. That holds for copies of the same registry
version: 0.4 and later do not share a registry with 0.3 or earlier, and warn
when both are on a page. Load one version.
