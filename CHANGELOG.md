# Changelog

Sutram follows [semantic versioning](https://semver.org/). Before 1.0,
breaking changes bump the minor version.

## Unreleased (proposed as 0.4.0)

### Changed, and may need your attention

- **WebMCP calls now ask in the page.** Every agent call goes through the
  page's policy; with a console, the person is asked there. Before, a
  consequential tool relied on the WebMCP host to ask.
- The console's input is a textarea: <kbd>Enter</kbd> inside quotes and
  <kbd>Shift</kbd>+<kbd>Enter</kbd> start a new line.
- **Typed input is no longer converted.** Values from agents and code must
  have the declared type: `true` for an integer, or an object for a string,
  is a usage error instead of `1` or `"[object Object]"`. Text typed in the
  console is still converted.
- **`null` means "not given"**, like `undefined`: the default applies, or a
  required key is reported. Before, it became `"null"` or `0`.
- **An empty string is a value** for a string property: `--title=""` reaches
  `run()` as `""` and counts as present for `required`. Before, it was
  dropped. Add `minLength: 1` where you need non-empty text.
- **More of the schema is checked**: `const`, `exclusiveMinimum`,
  `exclusiveMaximum`, `multipleOf`, `minLength`, `maxLength`, `pattern`,
  array `items` (one level), `minItems`, `maxItems`, `uniqueItems`, and
  `type: [T, "null"]`. `register()` warns once about keywords it does not
  check, and refuses a `pattern` that is not a valid regular expression.
- **Positional words are never dropped.** They fill the positional keys not
  given as options; a word with no key left is a usage error.
- Only the schema's own properties are arguments: `--constructor` is unknown.
- Event payloads are checked strictly (nothing is converted) and delivered
  as emitted.
- **`sutram_status` returns `{ code: 0, data: { providers } }`**, the same
  shape as every other call. Before, `providers` was at the top level.
- `--flag true` and `--flag false` are usage errors. Before, the word became
  an argument and the flag was set to true.

### Added

- `registry.policy`: who is asked before a command runs, per kind of caller
  (person, agent) and level (`none`, `consequential`, `changes`), and
  `policy.setAsker()` for your own dialog.
- Batches: `registry.defineBatch()`, `registry.batch()`,
  `registry.startBatch()`, and the `sutram_batch` WebMCP tool. Pasted blocks
  run as one batch.
- <kbd>Tab</kbd> completion in the console, and `suggest()` on commands.
- `mountConsole(options, container)` for an inline console in your own panel.
- `MESSAGES`: the console's own texts, translatable.
- Heredocs: `--value <<END`, then the text, then a line holding only `END`.
  The text is taken as written, so HTML needs no escaping. `commandLine()`
  writes multi-line values as heredocs, and the agent prompt mentions them.
- TypeScript declarations in `types/`.
- `run()` may return a string, used as its text. Returning any other
  non-object is now exit 1 with a message saying what to return.
- `checkInput(schema, input, formats, { strict })`.
- A backslash at the end of a line joins the next line, in the console,
  pasted blocks and `parse()`.
- `Sutram.call()` and `sutram_batch` accept command names (`cart add`) as
  well as tool names (`cart_add`); "no such tool" names the closest tool.
- An unclosed quote names the word it opened in, with a fix.
- `agentPrompt(task, { title, url })` and `Sutram.agentPrompt(task)`: a
  generic prompt for chat assistants without browser access.
- Documentation site with `llms.txt` and `llms-full.txt`, every page also as
  Markdown; two agent skills in `skills/`; a forms example with progressive
  disclosure; `scripts/measure.mjs`.

## 0.3.0 (2026-10-16)

- `Sutram.tools()` and `Sutram.call()` for headless browsers, tests and
  browser agents. `call()` refuses consequential tools without
  `{ confirmed: true }`.
- `Sutram.run` removed: `call()` is the one way in from outside;
  `registry.run()` stays for app code.

## 0.2.1 (2026-10-16)

- Dual license: `MIT OR GPL-2.0-or-later`.
- An option with a quoted value is still an option (`--who="Grace Hopper"`).
- The console runs pasted lines as a batch, and copies its output.
- README rewritten for users.

## 0.2.0 (2026-10-16)

First release on npm (GPL-2.0-or-later): the registry, the command line
parser, `help`, `man`, `status`, exit codes, the format registry, `--wide`,
`--json=<fields>`, `onResult`, the console, WebMCP, events, and
`dist/sutram.js`.
