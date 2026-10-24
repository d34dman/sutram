# Changelog

Sutram follows [semantic versioning](https://semver.org/) for its
JavaScript API. Before 1.0, breaking changes bump the minor version. The
commands (their names, parameters, output and tool descriptions) are not
covered: agents discover them at run time, so they may change in any
release, and each change is listed under *Commands*. See
[Status and versions](README.md#status-and-versions).

## 0.8.0 (2026-10-24)

Kits: commands that are the same on every site, each fed by a small adapter
in the app: nav, page, user, messages, lists and forms.

### Commands

- `help -h`, `man -h`, `status -h` and `clear -h` show their usage; any
  other option after them is a usage error (exit 2). Before, the console
  answered `status -h` with "command not found".
- `form status` takes no form, too: then it sums up every form on the
  page in one line ("1 form: Contact (contact): 1 unsaved change"), with
  `{ forms }` as `form list` has them. Before, `status` and
  `sutram_status` showed "form status: form is required" on every page
  with the forms kit.

### Removed

- *Yes, and stop asking*: a `"changes"` policy asks about every change,
  every time. The console cannot tell who clicks, so one answer no longer
  lowers the level for the calls that follow. `policy.relax()` is gone, an
  asker's only yes is `true` (an older asker's `"always"` now means no),
  `MESSAGES.always` is gone and `MESSAGES.answerHint` is a string.
- `findModelContext()` no longer falls back to `navigator.modelContext`;
  WebMCP is `document.modelContext`.

### Added

- `@d34dman/sutram/nav`: the nav kit. `nav({ menus, go, reloads, here? })`
  registers `nav status`, `nav menu`, `nav search` and `nav go`. The kit asks
  the adapter for the menus each time a command runs, matches targets by
  path, id, title or breadcrumb, and completes menu names and link titles.
  `reloads: true` marks `nav go` as `navigates`; `reloads: false`, for a
  client-side router, marks it `reinitializes`. See the
  [nav kit guide](docs/guides/nav-kit.md).
- `dist/nav.js` (and `nav.min.js`): the kit as a file of its own for pages
  without a bundler. It uses the `globalThis.Sutram` that `dist/sutram.js`
  defined and adds itself as `Sutram.kits.nav`.
- `Sutram.kits`: where kits loaded as their own files add themselves.
- `@d34dman/sutram/page`: the page kit. `page({ page, here? })` registers
  `page status`: the page's title, path, route and the thing it shows. See the
  [page kit guide](docs/guides/page-kit.md).
- `@d34dman/sutram/user`: the user kit. `user({ user, login, logout, reloads })`
  registers `user status`, `user login` and `user logout`. The kit calls
  `login()` and `logout()` after the command has answered; `reloads` picks
  `navigates` or `reinitializes`, and `user logout` is consequential. See the
  [user kit guide](docs/guides/user-kit.md).
- `@d34dman/sutram/messages`: the messages kit. `messages({ messages, watch? })`
  registers `messages status`, part of a bare `status`, and emits a
  `message.shown` event for each message, at the start and after the adapter's `changed()`. See the
  [messages kit guide](docs/guides/messages-kit.md).
- `@d34dman/sutram/lists`: the lists kit, read-only. `lists({ lists, go,
  reloads })` registers `listing status`, `listing rows` and `listing go`. `listing go`
  changes page, sort and filters in one go and hands the adapter the complete
  state; the kit checks sorts and filters against what the list offers. See
  the [lists kit guide](docs/guides/lists-kit.md).
- `@d34dman/sutram/forms`: the forms kit. `forms({ forms, read, write,
  submit, reloads })` registers `form list`, `form status`, `form fields`,
  `form get`, `form set`, `form submit` and `form discard`, and `form add`,
  `form remove`, `form search` and `form upload` when the adapter supplies
  them. The kit converts string, text, html, number, boolean, choice and
  choices values; the adapter adds its own types. `form status` lists the
  required fields still empty; `form set` names the fields an answer adds or
  removes; `form discard` puts back the values the form loaded with. See the
  [forms kit guide](docs/guides/forms-kit.md).
- `dist/page.js`, `dist/user.js`, `dist/messages.js`, `dist/lists.js` and
  `dist/forms.js` (and their `.min.js`), adding `Sutram.kits.page`, `.user`,
  `.messages`, `.lists` and `.forms`.
- The forms example uses the forms kit, with a type of its own for fields
  with a pattern; `form discard` there now puts back the start values
  instead of clearing every field.
- `events wait [name] --since=<id> --timeout=<seconds>`: returns the first
  matching event after the id, at once when the page still keeps one,
  otherwise when it is emitted, so agents need not ask `events recent` again
  and again. It gives up after 10 seconds by default (60 at most) with exit
  1 and the `--since` that keeps waiting without missing one. In JavaScript:
  `events.next(name, { since, timeout, signal })`.
- `Sutram.exec(lines)` (`execLines()` from `@d34dman/sutram/webmcp`): command
  lines as pasted into the console, for code that drives the page from
  outside, such as Playwright. Several lines run as one batch, checked first
  and approved once under the page's policy (`{ confirmed: true }`, as for
  `Sutram.call()`); `help`, `man`, `status`, `-h` and `--json` work. It
  answers with the console's text, `{ code, text, completed, total }`.
- `sutram_status` takes `providers`, such as `["form", "page"]`, to ask only
  those; a name that reports no status is a usage error listing the ones
  that do. The console's and `Sutram.exec()`'s `status` take names too:
  `status form page`.
- `sutram_batch` takes `quiet: true`: the answer leaves out the results of
  the calls that worked, `{ code, completed, total }`, with the failing
  call's result as `failed`.
- The example page has adapters for every kit: static menus with a hash
  router, the route's title, a pretend login, the todo commands' messages and
  a list of the docs that pages, sorts and filters in place.

### Changed

- The forms guide's send command is `form submit` (it said `form save` or
  `submit`): one name on every site.
- The note after a run that started Sutram again, and the agent prompt's
  rules, say to look again with `status`, which includes `messages status` where
  the page has it.
- Completion adds no space after a value that ends in `=`, such as the
  `type=` of a `key=value` pair, so the value can follow.
- The kits' commands that return text from the site carry
  `untrustedContent`: `nav menu`, `nav search`, `page status`, `messages status`,
  `listing status`, `listing rows`, and `form list`, `status`, `fields`, `get`,
  `set`, `add` and `search`. WebMCP agents get `untrustedContentHint`.
  So do `sutram_status` and `events recent`, which pass on what the page's
  providers report and the messages it showed.
- An input error ends with where the usage is: `form get: field is
  required. Try form get -h.`
- The question before `form submit` lists the unsaved values it sends, five
  at most, each on one short line: "Submit Article with 2 changes (title:
  …; body: …)?". An agent sets fields without asking, so the person sees
  them here.
- A form that is not on the page exits with 1, like a missing list or menu;
  127 is only for a command that does not exist.
- When an agent's batch needs approval, the question names its
  consequential commands, and each command shows on one short line: a long
  or multi-line value is cut, with its size, so it cannot push the other
  lines out of view. The same goes for the browser's `confirm()` and the
  question `Sutram.call()` hands back.
- The docs say plainly that the console cannot tell who types: an agent
  that drives the browser can answer its questions, and `Sutram.call()`'s
  `{ confirmed: true }` is the caller's own word. Only WebMCP, with an agent
  that does not also drive the page, keeps it from approving its own calls.
- The measurements page says its numbers were captured with Sutram 0.3 and
  0.4, before the forms kit.

### Fixed

- A command that was approved no longer runs when the page changed while
  the user was asked. Before, an agent could change a form's fields while
  the person read "Submit Contact with 1 change (email: …)?", and the yes
  sent the agent's values. The console, WebMCP and `sutram_batch` pass the
  question they asked to `run()` as `asked`; just before the command runs,
  it is asked again, and a different question refuses the run with exit
  130 ("the page changed while the user was asked"). Run it again to be
  asked about the page as it is now.
- `status` in a pasted batch or a `Sutram.exec()` batch, after a line that
  changed a provider with batch hooks, no longer waits forever for the batch
  it is part of. `runStatus()` takes `run`, and a batch passes its own.
- `nav go` refuses a path that the browser would take to another site, such
  as `/\example.com` or a path with a tab, and hands the adapter the
  resolved path. Before, an agent could send the user's tab, with data in
  the address, anywhere without being asked.
- `form upload` asks with where a URL is fetched from, even with `--name`
  and with an adapter whose `forms()` or notes answer with a promise.
  Before, `--name=photo.jpg` hid the URL from the question, and an async
  adapter got the generic question. Such an adapter's questions for
  `form submit`, `discard` and `remove` now name the form too.
- A command that calls `reinitializes()` for a navigation that does not
  happen no longer leaves Sutram refusing every call. The page resumes when
  the adapter's `go()`, `submit()`, `login()` or `logout()` resolves to
  `false` or fails, when the app calls `initialized()`, on `hashchange`, on
  a page restored from the back/forward cache, or when the Navigation API
  says the navigation stayed in the document or was stopped
  (`navigatesuccess`, `navigateerror`, as after "Stay on page"). Time alone
  never resumes it, so a page still sending a slow form POST does not answer
  and the form cannot be sent twice; a navigation that ends with no signal,
  such as a download, waits for the next page or `initialized()`.
  `registry.reinitialize({ navigates })` and the reinitialize
  event's `navigates` say which kind it was.
- `form set` takes an agent's JSON as it comes: `true`, a number, or a list
  for a choices field. Before, anything but a string was refused with
  "value must be a string". An object is refused with what the field takes.
- `nav go https://…` to another site is refused like `nav go //…`, with
  exit 2 and "leads off this site"; a full URL of this site goes there.
  Before, it was "no menu link" with a search that could not help.

## 0.7.0 (2026-10-24)

Tools get titles people can read, and commands one naming style.

### Added

- `title` in a command definition: a short name for people, such as "Save a
  form". WebMCP gets it as the tool's `title`, `tools()` lists it, and the
  generic approval question uses it: "Save a form? (form save)" instead of
  "Run form save?". `sutram_status`, `sutram_batch` and the `events`
  commands have titles too.
- `register()` warns about parameter names that are not one lowercase word
  or words joined by `_` (`per_page`), the style of the tool names.
- The console's `run` message gets the command's title as a second argument.
- `view.columns` applies to each table only with the columns it has; a table
  with none of them shows all its columns. A command that returns different
  lists (a list of menus, or one menu's links) can name the columns of each.

### Changed

- Docs: one verb per meaning (`search`, `add`, `remove`, `go`, `status`),
  and the examples use `nav search` where they used `nav find`.

## 0.6.0 (2026-10-18)

Sutram stores nothing in the browser and says when a page is ready; the
console can step aside (peek) and take skins.

### Added

- `Sutram.ready`: a promise that resolves once the page's scripts have run
  and their commands are registered. Code that drives the page waits for it
  on every page before its first call.
- The `reinitializes` annotation, and `reinitializes()` in the run context:
  a command declares that it *may* start Sutram again, and calls
  `reinitializes()` when it *does*, just before it leaves the page or swaps
  the page's commands. From then on `Sutram.ready` is a new promise (never
  resolved on a page being left; a single-page app resolves it with
  `Sutram.initialized()`), runs are refused with exit 130, events are
  cleared, and an agent's result ends with a note to wait and look again
  (`REINITIALIZED_NOTE`). `navigates` implies `reinitializes`. App code
  calls `registry.reinitialize()` and `registry.initialized()`.
- A command that may start Sutram again must be the last line of a pasted
  block and the last call of `sutram_batch`.
- The agent rules (the *use a Sutram page* skill) say to wait, look again,
  and remember what is needed from before.
- `ANNOTATIONS`: the annotation keys `register()` accepts.
- **Peek:** `mountConsole({ peek: true })` (or the `peek` attribute). Holding
  Alt on its own fades the console so the page behind it shows; letting go
  brings it back. `peek: "ctrl" | "shift" | "meta"` picks another key,
  `--sutram-peek-opacity` sets how faded it is. Off by default.
- **Skins:** `skins/light.css` and `skins/system.css` (dark or light, following
  the system). Optional; the console stays dark by default.
- New custom properties `--sutram-on-warn` (text on the Yes button),
  `--sutram-radius` and `--sutram-shadow`; `--sutram-line` is now documented.
  The custom properties are a stable contract.
- Parts `copy` and `close` for the top bar's buttons.

### Changed

- **Breaking:** `register()` refuses annotation keys it does not know.
  Annotations are a contract with every client; a typo used to be ignored.
- **Breaking:** events are no longer cleared after every successful
  `navigates` command, but when Sutram starts again: a navigating command
  calls `reinitializes()`.
- **Breaking:** console history lasts as long as the page. It no longer goes
  to `sessionStorage`. An app that wants history across pages passes a
  `historyStore` (`{ load(), save(lines) }`) to `mountConsole()` or sets
  `console.historyStore`, and decides where the lines are kept.
- **Breaking:** the `history="off"` attribute is gone; it is now the default.

### Fixed

- The Yes button's text no longer turns translucent with a translucent
  `--sutram-bg`.

## 0.5.1 (2026-10-18)  The console hands the page to an agent with one click.

### Added

- The console's top bar has an *Agent prompt* button: it copies
  `agentPrompt()` for the page, title and URL filled in. Translate it with
  the `prompt` and `promptTitle` messages, hide it with
  `::part(agent-prompt)`.

## 0.5.0 (2026-10-18)

Prompts for agents that drive a browser, and a friendlier console.

### Changed, check your setup

- **`agentPrompt()` is for agents that drive a browser.** It tells the agent
  to open the page and type into the console, where you watch it work.
  - The copy-and-paste loop for chat assistants without a browser (ChatGPT,
    Claude) is gone, and so are the *Open in ChatGPT* and *Open in Claude*
    buttons on the home page.
  - The prompt is shorter: about 1,000 characters instead of 1,850.
  - Its guide moved to [`guides/agent-prompt`](docs/guides/agent-prompt.md).
- **The "use a Sutram page" skill starts in the console**, with `help` and
  then `status`, and leaves yes/no questions to the person.

### Added

- **`help` explains how to write a command:** options and quoting,
  multi-line text, what *read-only*, *consequential* and *navigates* mean,
  and that pasted lines are checked before any of them runs.

### Fixed

- <kbd>Esc</kbd> closes the console only while you are in it. Escapes meant
  for the page, or fired by its scripts, leave it open. (Drupal Canvas fires
  one whenever a component is added.)
- The console opens with the cursor in the command field.
- Click anywhere in the console to type. Drag or double-click to select text
  instead.
- The output has one scroll bar, not one per wide table.
- The page's hyphenation no longer splits words in the console.

## 0.4.0 (2026-10-16)

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
  `Sutram.client` (for example `Sutram.client.parse`). Gone from it:
  `getRegistry` (use `Sutram.registry`), `createRegistry`, `getFormats`,
  `createFormats`, `STANDARD_FORMATS` and `commandLine` (import them from the
  bundle or the package), the client functions (`parse`, `tokenize`,
  `highlight`, `suggest`, `checkInput`, `checkOutput`, `checkFields`,
  `selectFields`, `runStatus`, `isStatusCommand`, `formatResult`,
  `formatHelp`, `formatUsage`, `formatMan`, `blocksToText`,
  `RESERVED_WORDS`, `CLIENT_OPTIONS`: now `Sutram.client.*`), and the
  internals below.
- **`dist/sutram.js` exports** what the main entry, `/client`, `/events`,
  `/webmcp` and `/console` export. It no longer exports `annotationLabel`,
  `deref`, `describeShape`, `distance`, `formatTable`, `formatValue`,
  `formatsUsed`, `longSynopsis`, `sentence` or `synopsis`; import them from
  `@d34dman/sutram/internals`.
- **`Sutram.tools()` lists `sutram_batch`** after `sutram_status`, before
  the page's own tools.

- **WebMCP calls now ask in the page.** Every agent call goes through the
  page's policy, `sutram_status` included; with a console, the person is
  asked there. Before, a consequential tool relied on the WebMCP host to ask.
- **WebMCP input is checked strictly.** An agent's JSON arrives typed, so
  `"off"` for a boolean is a usage error. `Sutram.call()` still converts
  strings, so `call(name, Sutram.client.parse(line).input)` works.
- **Only strings are converted.** A value of another type must already have
  the declared type: `true` for an integer, or an object for a string, is a
  usage error instead of `1` or `"[object Object]"`. Strings are converted
  as console text is (`"2"` → `2`), except from WebMCP and in event
  payloads, which are checked strictly.
- **`null` means "not given"**, like `undefined`: the default applies, or a
  required key is reported. Before, it became `"null"` or `0`.
- **An empty string is a value** for a string property: `--title=""` reaches
  `run()` as `""` and counts as present for `required`. Before, it was
  dropped. Add `minLength: 1` where you need non-empty text.
- **More of the schema is checked**: `const`, `exclusiveMinimum`,
  `exclusiveMaximum`, `multipleOf`, `minLength`, `maxLength`, `pattern`,
  array `items` (one level), `minItems`, `maxItems`, `uniqueItems`, and
  `type: [T, "null"]`. `enum`, `const` and `uniqueItems` compare objects and
  lists by value. `register()` warns once about keywords it does not check,
  and refuses a `pattern` that is not a valid regular expression.
- **`date` and `date-time` are checked as RFC 3339**, with a calendar check:
  `2026-02-31`, `"May 5"` and a date-time without seconds or an offset are
  refused. Before, anything `Date.parse` read passed.
- **Only a `CommandError` sets the exit code**, and never to 0. Anything
  else thrown is exit 1. Before, any integer `err.code` was used, so a
  `DOMException` (legacy `code` 0) counted as success.
- **`register()` refuses more names**: a name of more than six words, which
  no command line could reach, and a name starting with `sutram`, which
  Sutram's own tools use.
- **The page's registry has a new key** (`sutram.registry@2`). 0.4 does not
  share a registry with 0.3 or earlier, and warns when both are on a page.
  Load one version.
- **Positional words are never dropped.** They fill the positional keys not
  given as options; a word with no key left is a usage error.
- Only own properties count, in both directions: `--constructor` is unknown
  unless the schema declares it, and a declared `constructor` or `toString`
  is "not given" until the input has it (in checks, output checks, tables,
  `--json=` fields and event payloads).
- Event payloads are checked strictly (nothing is converted) and delivered
  as emitted; the buffer behind `events recent` keeps a copy.
- **`sutram_status` returns `{ code: 0, data: { providers } }`**, the same
  shape as every other call. Before, `providers` was at the top level.
- **`commandLine()` writes every value so that it reads back the same.**
  Objects, and lists whose items hold commas or objects, are written as JSON
  (`--meta='{"a":1}'`); `null` is left out; `true` for a non-boolean is
  `--key=true`, not a flag. Console text accepts a JSON list for an array
  (`--tags='["a,b"]'`). Before, an object became `[object Object]`.
- **The console's hotkey**: the key left of 1, found by position (`` ` `` on US,
  `^` on German, `²` on French keyboards), outside text fields, and Ctrl
  with it anywhere. <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> is gone: it is
  Firefox's Web Console. Set your own with `mountConsole({ hotkey })`. It
  does not fire on key repeat or in a `role="textbox"` editor, and only the
  first drop-down console on a page answers it.
- The console's input is a textarea: <kbd>Enter</kbd> inside quotes and
  <kbd>Shift</kbd>+<kbd>Enter</kbd> start a new line.
- `--flag true` and `--flag false` are usage errors. Before, the word became
  an argument and the flag was set to true. A nullable boolean
  (`type: ["boolean", "null"]`) is a flag too.
- A multi-line description: `help` and `-h` show its first line, `man`
  shows the rest under DESCRIPTION.
- The package no longer ships `docs/design.md`, which shows an earlier API,
  or `docs/measurements/`. Both stay on the website.

### Added

- `registry.policy`: who is asked before a command runs, per kind of caller
  (person, agent) and level (`none`, `consequential`, `changes`), and
  `policy.setAsker()` for your own dialog. What the user is asked about is
  what runs: `confirm()`, the asker and the question's command lines get the
  checked input (converted, defaults filled), and clients pass the definition
  they asked about (`run(name, input, { expect })`), so a command swapped in
  during the question does not run (130). A `confirm()` that throws gets the
  generic question. An aborted call withdraws its question
  (`request.signal`).
- Batches: `registry.defineBatch()`, `registry.batch()`,
  `registry.startBatch()`, and the `sutram_batch` WebMCP tool. Pasted blocks
  run as one batch. Every step is checked first and runs the definition that
  was checked; one batch runs at a time, and console and agent runs of a
  provider in a running batch wait for it, so a rollback never undoes their
  edits. Always finish a `startBatch()` batch.
- <kbd>Tab</kbd> completion in the console, and `suggest()` on commands.
- `mountConsole(options, container)` for an inline console in your own panel.
- `MESSAGES`: the console's own texts, translatable.
- The console asks questions in place: a line that is not y, n (or a) asks
  again, a second question waits for the first, `clear` keeps an open
  question, and removing a console answers its questions with no while
  another console on the page takes over asking.
- Heredocs: `--value <<END`, then the text, then a line holding only `END`.
  The text is taken as written, so HTML needs no escaping. `commandLine()`
  writes multi-line values as heredocs, and the agent prompt mentions them.
- TypeScript declarations in `types/`. A `Result` names the other side's
  fields as `never`, so `if (r.code === 0) r.text` type-checks and
  `"message" in r` narrows; `ExitCode` keeps its named codes and allows a
  `CommandError`'s own. `types/dist.d.ts` types the two bundles.
- `run()` may return a string, used as its text. Returning any other
  non-object is now exit 1 with a message saying what to return.
- `dist/sutram.min.js`: the bundle without comments and indentation (no
  renaming, no dependency), with the same license banner. Both bundles are
  marked as side effects, so a bundler keeps
  `import "@d34dman/sutram/dist/sutram.js"`.
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
  100 lines); `history: "off"` keeps it in memory. <kbd>ArrowDown</kbd> past
  the newest line brings back what you were typing.
- The drop-down console is a modal dialog: `aria-modal`, <kbd>Tab</kbd> stays
  inside, and focus returns to where it was on close.
- Client words are case-insensitive in the console: `Help` works.
- `agentPrompt(task, { title, url })` and `Sutram.agentPrompt(task)`: a
  generic prompt for chat assistants without browser access.
- Documentation site with `llms.txt` and `llms-full.txt`, every page also as
  Markdown; two agent skills in `skills/`; a forms example with progressive
  disclosure; `scripts/measure.mjs`.

### Fixed

- `run()` resolves 130 as soon as its signal aborts, even when the handler
  ignores the signal.
- Object and array defaults reach `run()` as copies, so a handler that
  changes its input no longer changes the default for the next run.
- Output checks accept a list of types (`["string", "null"]`) instead of
  warning, check the type before the format, follow `$ref: "#"`, and stop
  32 levels deep, so cyclic data cannot overflow the stack after `run()`.
- Checking a number is linear: a long non-number (40,000 digits and a
  letter, which an agent can send) took seconds on the main thread. Pasting
  is linear in the length of the text too.
- `connectWebMCP()` registers every other tool when the browser refuses
  one, and refreshes a tool whose definition changed in place (at its next
  call, or when the same definition is registered again).
- The console runs one line at a time, so each output follows its own line;
  `help`, `man` and `status` fail like commands instead of rejecting
  `submit()`; keys pressed while an input method composes (IME) are left to
  it; and it resets the text styles it would inherit from the page, so the
  highlighting stays under the caret.
- `--json=fields` on an empty list prints `[]` instead of an error.
- `date` and `date-time` values that are not dates are shown as written,
  not as "Invalid Date".
- Wording: "1 item" and "1 command"; a description ending in `!` or `?`
  gets no extra full stop; an empty list prints "Nothing to show."; `man`
  prints object defaults as JSON; usage lines and `man` show a nullable
  type as `<string>` and "string or null".
- The build and docs scripts run on every Node 20, as `engines` says.

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
