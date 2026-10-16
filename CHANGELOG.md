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
- TypeScript declarations in `types/`.
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
