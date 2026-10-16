---
title: The console
description: Open, use, place, restyle and translate the console that people and pasted command lines use.
---

# The console

`mountConsole()` adds a terminal-like console to the page. People use it,
and it is where a chat assistant's command lines are pasted.

Open it with <kbd>`</kbd> (outside text fields) or
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>; close it with <kbd>Esc</kbd>.

| Type | To |
|---|---|
| `help`, `help <provider>` | See the commands on this page |
| `man <command>` | Read a command's full manual |
| `<command> -h` | See a command's usage |
| `status` | See every provider's status |
| `clear` | Clear the screen |
| <kbd>Tab</kbd> | Complete a command, an option or a value; with several choices, a list opens |
| ↑ / ↓ | Walk through history |
| <kbd>Enter</kbd> inside quotes | Start a new line of the value, for multi-line text |
| <kbd>Shift</kbd>+<kbd>Enter</kbd> | Start a new line; several lines run as one batch |
| Paste several lines | Run them as one [batch](../concepts/batches.md). Pasted inside open quotes, they become part of the value instead. |
| *Copy* (top bar) | Copy the output as text, for example to paste back to a chat assistant |

## Options

`mountConsole({ greeting, locale })` sets a first line and the locale values
are shown in.

## In your own panel

Give `mountConsole()` a container, and it adds an inline console there
instead of the drop-down. It fills the container, has no hotkey and no close
button, and the app decides when to show it.

```js
const el = mountConsole({ greeting: "Type help." }, document.querySelector("#editor-console"));
```

## Styling

Restyle it with CSS custom properties on `sutram-console`:

```css
sutram-console {
  --sutram-bg: #11131c;  --sutram-fg: #e6e8f0;  --sutram-dim: #8c93a8;
  --sutram-accent: #9aa2ff;  --sutram-option: #7dcfff;  --sutram-string: #c3e88d;
  --sutram-ok: #6fd69a;  --sutram-warn: #f5a35c;  --sutram-err: #ff7b7b;
  --sutram-font: ui-monospace, monospace;  --sutram-font-size: 13px;  --sutram-height: 55vh;
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
