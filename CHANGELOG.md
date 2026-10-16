# Changelog

Sutram follows [semantic versioning](https://semver.org/). Before 1.0,
breaking changes bump the minor version.

## Unreleased (proposed as 0.4.0)

### Changed, and may need your attention

- **The main entry point exports less.** It keeps what app authors use:
  `getRegistry`, `createRegistry`, `CommandError`, `EXIT`, `getFormats`,
  `createFormats`, `STANDARD_FORMATS`, `createPolicy`, `LEVELS`,
  `commandLine`, `agentPrompt`. Parsing, completion, input checks, status
  and result formatting moved to **`@d34dman/sutram/client`**. `deref`,
  `distance`, `formatValue`, `formatTable`, `synopsis`, `longSynopsis`,
  `annotationLabel`, `describeShape`, `sentence` and `formatsUsed` moved to
  `@d34dman/sutram/internals`, which makes no semver promise.
- **`globalThis.Sutram` no longer copies every export.** It keeps its
  helpers plus `EXIT` and `CommandError`; the client functions are under
  `Sutram.client` (for example `Sutram.client.parse`).

- **WebMCP calls now ask in the page.** Every agent call goes through the
  page's policy; with a console, the person is asked there. Before, a
  consequential tool relied on the WebMCP host to ask.
- The console's input is a textarea: <kbd>Enter</kbd> inside quotes and
  <kbd>Shift</kbd>+<kbd>Enter</kbd> start a new line.
- **Only strings are converted.** A value of another type must already have
  the declared type: `true` for an integer, or an object for a string, is a
  usage error instead of `1` or `"[object Object]"`. Strings are converted
  as console text is (`"2"` → `2`), except from WebMCP and in event
  payloads, which are checked strictly.
- **Only a `CommandError` sets the exit code**, and never to 0. Anything
  else thrown is exit 1. Before, any integer `err.code` was used, so a
  `DOMException` (legacy `code` 0) counted as success and a batch committed.
- **What was approved is what runs.** A batch runs the definitions it
  checked; a step whose command was replaced by an earlier step does not run
  (130), and the batch rolls back. WebMCP and the console pass the definition
  they asked the user about (`run(name, input, { expect })`, `def` on a batch
  step), so a command swapped in during the question does not run.
- **Questions show the checked value.** `confirm()`, the policy's asker and
  the command lines in a question get the input after checking (converted,
  defaults filled), which is what runs. Before, `{ all: "false" }` was asked
  as `--all` and ran with `all: false`. A `confirm()` that throws gets the
  generic question.
- **`commandLine()` writes every value so that it reads back the same.**
  Objects, and lists whose items hold commas or objects, are written as JSON
  (`--meta='{"a":1}'`); `null` is left out; `true` for a non-boolean is
  `--key=true`, not a flag. Console text accepts a JSON list for an array
  (`--tags='["a,b"]'`). Before, an object became `[object Object]`.
- A nullable boolean (`type: ["boolean", "null"]`) is a flag: `--key`
  and `--no-key`.
- **Batches take turns.** A second batch waits for the first to commit or
  roll back, and console and agent runs of a provider in a running batch
  wait too. Before, two batches at once could interleave their hooks and lose
  edits. Always finish a `startBatch()` batch.
- **WebMCP input is checked strictly.** An agent's JSON arrives typed, so
  `"off"` for a boolean is a usage error. `Sutram.call()` still converts
  strings, so `call(name, parse(line).input)` works.
- `sutram_batch` refuses a call that is not `{ tool, input }`, or an
  `input` that is not an object. Before, `input: "item=a"` ran with no
  arguments.
- Command names cannot start with `sutram`, so no command can shadow
  `sutram_status` or `sutram_batch`. `sutram_status` follows the policy
  like every tool.
- **The page's registry has a new key** (`sutram.registry@2`). 0.4 does not
  share a registry with 0.3 or earlier, and warns when both are on a page.
  Before, a 0.2 registry crashed a 0.4 client.
- `connectWebMCP()` registers every other tool when the browser refuses
  one, and refreshes a tool whose definition changed in place (at its next
  call, or when the same definition is registered again).
- Object and array defaults reach `run()` as copies, so a handler that
  changes its input no longer changes the default for the next run.
- Output checks accept a list of types (`["string", "null"]`) instead of
  warning, check the type before the format, follow `$ref: "#"`, and stop
  32 levels deep, so cyclic data cannot overflow the stack after `run()`.
- **An abort settles the call.** `run()` resolves 130 as soon as its signal
  aborts, even when the handler ignores the signal. WebMCP passes the
  signal to the asker (`request.signal`), and the console withdraws the
  question (`MESSAGES.withdrawn`).
- Checking a number is linear: a long non-number (40,000 digits and a
  letter, which an agent can send) took seconds on the main thread.
- `enum`, `const` and `uniqueItems` compare objects and lists by value,
  whatever the key order. `registry.batch()` refuses a step that is not
  `{ name, input }` with a usage result instead of throwing. The event
  buffer keeps a copy of each payload.
- `register()` refuses a name of more than six words, which no command
  line could reach.
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
- Only own properties count, in both directions: `--constructor` is unknown
  unless the schema declares it, and a declared `constructor` or `toString`
  is "not given" until the input has it (in checks, output checks, tables,
  `--json=` fields and event payloads).
- Event payloads are checked strictly (nothing is converted) and delivered
  as emitted.
- **`sutram_status` returns `{ code: 0, data: { providers } }`**, the same
  shape as every other call. Before, `providers` was at the top level.
- **The console's hotkey**: the key left of 1, found by position (`` ` `` on US,
  `^` on German, `²` on French keyboards), outside text fields, and Ctrl
  with it anywhere. <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> is gone: it is
  Firefox's Web Console. Set your own with `mountConsole({ hotkey })`.
- While the console asks a question, a line that is not y, n (or a) asks
  again instead of meaning no. A second question waits for the first.
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
- `dist/sutram.min.js`: the bundle without comments and indentation (no
  renaming, no dependency).
- `checkInput(schema, input, formats, { strict })`.
- `input` is optional: a command with no arguments may leave it out.
- A backslash at the end of a line joins the next line, in the console,
  pasted blocks and `parse()`.
- `Sutram.call()` and `sutram_batch` accept command names (`cart add`) as
  well as tool names (`cart_add`); "no such tool" names the closest tool.
- An unclosed quote names the word it opened in, with a fix.
- `mountConsole({ hotkey })`, `parseHotkey()`, `matchHotkey()` and
  `DEFAULT_HOTKEY`.
- Console history survives navigation in the tab (`sessionStorage`, last
  100 lines); `history: "off"` keeps it in memory.
- The drop-down console is a modal dialog: `aria-modal`, <kbd>Tab</kbd> stays
  inside, and focus returns to where it was on close.
- Client words are case-insensitive in the console: `Help` works.
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
