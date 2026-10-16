---
title: The console
description: Open, use, place, restyle and translate the console that people and pasted command lines use.
---

# The console

`mountConsole()` adds a terminal-like console to the page. People use it,
and it is where a chat assistant's command lines are pasted.

Open it with the key left of <kbd>1</kbd> (outside text fields), or with
<kbd>Ctrl</kbd> and that key anywhere; close it with <kbd>Esc</kbd>. The key is
found by its position, as game consoles do, so it is <kbd>`</kbd> on a US
keyboard, <kbd>^</kbd> on a German one and <kbd>²</kbd> on a French one.
<kbd>Ctrl</kbd>+<kbd>`</kbd> is also VS Code's terminal toggle. The drop-down
console keeps <kbd>Tab</kbd> inside itself while it is open, and gives focus
back to where it was when it closes.

| Type | To |
|---|---|
| `help`, `help <provider>` | See the commands on this page |
| `man <command>` | Read a command's full manual |
| `<command> -h` | See a command's usage |
| `status` | See every provider's status |
| `clear` | Clear the screen |
| <kbd>Tab</kbd> | Complete a command, an option or a value; with several choices, a list opens |
| ↑ / ↓ | Walk through history. It survives navigation in the same tab (`sessionStorage`) and is gone when the tab closes |
| `y`, `n` (or `a`) while a question is open | Answer it. Anything else asks again; a second question waits its turn |
| <kbd>Enter</kbd> inside quotes or a [heredoc](../reference/command-line.md#heredocs) | Start a new line of the value, for multi-line text |
| <kbd>Shift</kbd>+<kbd>Enter</kbd> | Start a new line; several lines run as one batch |
| Paste several lines | Run them as one [batch](../concepts/batches.md). Pasted inside open quotes or a heredoc, they become part of the value instead. |
| *Copy* (top bar) | Copy the output as text, for example to paste back to a chat assistant |

## Options

`mountConsole({ greeting, locale, hotkey, history })`:

- `greeting`: a first line.
- `locale`: the locale values are shown in.
- `hotkey`: space-separated bindings, default `"backquote ctrl+backquote"`.
  A binding is modifiers (`ctrl`, `alt`, `shift`, `meta`, or `mod`: Cmd on
  macOS, Ctrl elsewhere) and a key. Letters and digits are the character the
  keyboard types, so `mod+k` stays K on any layout; other keys are named by
  position, as `KeyboardEvent.code` in lowercase: `backquote`, `slash`, `f2`.
  A binding without `ctrl`, `alt` or `meta` never fires in a text field.
  `"none"` turns the hotkey off; open the console with `console.open()`.
- `history: "off"`: keep history in memory only.

If your app has its own command palette on <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd>,
leave that key to it. Sutram's default avoids the keys browsers, Drupal's
Coffee module (<kbd>Alt</kbd>+<kbd>D</kbd>) and Firefox's Web Console
(<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>) use.

## In your own panel

Give `mountConsole()` a container, and it adds an inline console there
instead of the drop-down. It fills the container, has no hotkey and no close
button, and the app decides when to show it.

```js
const panel = document.querySelector("#editor-console");
const el = mountConsole({ greeting: "Type help." }, panel);
```

## Styling

Restyle it with CSS custom properties on `sutram-console`:

```css
sutram-console {
  /* Colours */
  --sutram-bg: #11131c;
  --sutram-fg: #e6e8f0;
  --sutram-dim: #8c93a8;
  --sutram-accent: #9aa2ff;
  --sutram-option: #7dcfff;
  --sutram-string: #c3e88d;
  --sutram-ok: #6fd69a;
  --sutram-warn: #f5a35c;
  --sutram-err: #ff7b7b;

  /* Type and size */
  --sutram-font: ui-monospace, monospace;
  --sutram-font-size: 13px;
  --sutram-height: 55vh;
}
```

Parts can be styled with `::part()`: `panel`, `header`, `output`, `menu` and
`prompt`. `sutram-console::part(header) { display: none; }` hides the top bar.

## In other languages

Every text the console shows of its own is in `MESSAGES`. Assign the ones you
translate; texts that take values are functions:

```js
el.messages = {
  placeholder: "Befehl eingeben oder help",
  count: (n) => `${n} Befehle auf dieser Seite`,
  yes: "Ja", no: "Nein",
};
```

What commands print is theirs to translate. `help` and `man` are still in
English.
