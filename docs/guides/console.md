---
title: The console
description: Open, use, place, restyle and translate the console that people and pasted command lines use.
---

# The console

`mountConsole()` adds a terminal-like console to the page. People use it,
and agents that drive a browser type into it, so the person sees every
command run.

The console cannot tell who is typing. Everything typed there follows the
policy for people, and an agent that drives the browser can answer the
console's questions itself, by typing `y` or clicking *Yes*. The
[agent prompt](agent-prompt.md) tells it not to, but that is a request, not
a lock. Only a question the agent cannot reach keeps it from approving
its own calls: the page's WebMCP tools, when the agent does not also drive
the page, so the [policy](../concepts/annotations-and-policy.md) asks the
person. `Sutram.call()` is no lock either: its caller passes
`{ confirmed: true }` itself.

Open it with the key left of <kbd>1</kbd> (outside text fields), or with
<kbd>Ctrl</kbd> and that key anywhere; it opens with the cursor in the
command field. Close it with <kbd>Esc</kbd> while it has the focus; an
<kbd>Esc</kbd> meant for the page leaves it open. The key is
found by its position, as game consoles do, so it is <kbd>`</kbd> on a US
keyboard, <kbd>^</kbd> on a German one and <kbd>²</kbd> on a French one.
<kbd>Ctrl</kbd>+<kbd>`</kbd> is also VS Code's terminal toggle. The drop-down
console keeps <kbd>Tab</kbd> inside itself while it is open, and gives focus
back to where it was when it closes.

As in a terminal, a click anywhere in the console puts the cursor in the
command field, and the output has one scroll bar for all of it. Dragging or
double-clicking selects text to copy instead; typing after that goes to the
command field.

| Type | To |
|---|---|
| `help`, `help <provider>` | See the commands on this page |
| `man <command>` | Read a command's full manual |
| `<command> -h` | See a command's usage |
| `status` | See every provider's status |
| `clear` | Clear the screen |
| <kbd>Tab</kbd> | Complete a command, an option or a value; with several choices, a list opens |
| ↑ / ↓ | Walk through history. It lasts as long as the page, unless the app passes a `historyStore` |
| `y`, `n` (or `a`) while a question is open | Answer it. Anything else asks again; a second question waits its turn |
| <kbd>Enter</kbd> inside quotes or a [heredoc](../reference/command-line.md#heredocs) | Start a new line of the value, for multi-line text |
| <kbd>Shift</kbd>+<kbd>Enter</kbd> | Start a new line; several lines run as one batch |
| Paste several lines | Run them as one [batch](../concepts/batches.md). Pasted inside open quotes or a heredoc, they become part of the value instead. |
| *Copy* (top bar) | Copy the output as text |
| *Agent prompt* (top bar) | Copy a [prompt](agent-prompt.md) that hands this page to an agent with a browser, with the page's title and URL filled in |

## Options

`mountConsole({ greeting, locale, hotkey, peek, messages, historyStore })`:

- `greeting`: a first line.
- `locale`: the locale values are shown in.
- `hotkey`: space-separated bindings, default `"backquote ctrl+backquote"`.
  A binding is modifiers (`ctrl`, `alt`, `shift`, `meta`, or `mod`: Cmd on
  macOS, Ctrl elsewhere) and a key. Letters and digits are the character the
  keyboard types, so `mod+k` stays K on any layout; other keys are named by
  position, as `KeyboardEvent.code` in lowercase: `backquote`, `slash`, `f2`.
  A binding without `ctrl`, `alt` or `meta` never fires in a text field.
  `"none"` turns the hotkey off; open the console from your own button with
  the element `mountConsole()` returns: `const el = mountConsole({ hotkey: "none" }); el.open()`.
- `peek`: hold a key alone to see the page behind the console; see below.
- `historyStore`: where history is kept between pages; see below.

### Keeping history between pages

Sutram stores nothing in the browser: no cookies, no `localStorage`, no
`sessionStorage`. Without a store, history lasts as long as the page. To keep
it longer, pass a store with `load()` and `save(lines)`. Your app decides
where the lines go, for how long, and under which key. Typed commands can
hold content, such as text for a form, so choose the place with that in mind.

```js
const KEY = "myapp.console-history";
mountConsole({
  historyStore: {
    load: () => JSON.parse(sessionStorage.getItem(KEY) || "[]"),
    save: (lines) => sessionStorage.setItem(KEY, JSON.stringify(lines)),
  },
});
```

`load()` may return a promise, for history kept on your server. The console
keeps the last 100 lines and ignores a store that throws.

If your app has its own command palette on <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd>,
leave that key to it. Sutram's default avoids the keys browsers, Drupal's
Coffee module (<kbd>Alt</kbd>+<kbd>D</kbd>) and Firefox's Web Console
(<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>) use.

### Peeking at the page

The console covers part of the page. With `peek`, holding a key on its own
fades the console so you can see what happens behind it; let go and it is
back. Off by default.

```js
mountConsole({ peek: true });     // hold Alt (Option on a Mac)
mountConsole({ peek: "ctrl" });   // or "shift", "meta"
```

The console fades after the key has been held for a moment, so Alt+letter
shortcuts and Option characters do not flicker. Any other key, a click, or
switching to another window ends the peek. While it peeks, the element has
the `peeking` attribute; set how faded it is with `--sutram-peek-opacity`
(default `0.12`).

## In your own panel

Give `mountConsole()` a container, and it adds an inline console there
instead of the drop-down. It fills the container, has no hotkey and no close
button, and the app decides when to show it.

```js
const panel = document.querySelector("#editor-console");
const el = mountConsole({ greeting: "Type help." }, panel);
```

## Styling

The console is dark by default. Sutram ships two optional skins; load one
after Sutram:

- `skins/light.css`: light.
- `skins/system.css`: dark or light, following the system setting.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@d34dman/sutram@0.7/skins/system.css">
```

With a bundler: `import "@d34dman/sutram/skins/light.css";`.

A skin is nothing but values for the console's CSS custom properties, set on
`sutram-console`. Write your own the same way, for example to match your
app's theme. These names are a stable contract: a rename is a breaking change.

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
  --sutram-on-warn: #11131c;  /* text on the warn-coloured Yes button */
  --sutram-line: #ffffff1a;   /* borders, selected suggestion */

  /* Shape */
  --sutram-radius: 0;
  --sutram-shadow: 0 8px 32px #0007;

  /* Type and size */
  --sutram-font: ui-monospace, monospace;
  --sutram-font-size: 13px;
  --sutram-height: 55vh;

  /* How visible the console stays while peeking */
  --sutram-peek-opacity: 0.12;
}
```

A translucent `--sutram-bg` lets the page show through all the time; add
`sutram-console::part(panel) { backdrop-filter: blur(8px); }` to keep the
text readable. Set `--sutram-on-warn` too, or the Yes button's text turns
translucent with it.

Where the drop-down sits is CSS on the element as well:
`sutram-console { inset: auto 16px 16px auto; width: 560px; --sutram-radius: 8px; }`
turns it into a box in the bottom right corner.

Parts can be styled with `::part()`: `panel`, `header`, `output`, `menu`,
`prompt`, and the top bar's buttons `agent-prompt`, `copy` and `close`.
`sutram-console::part(header) { display: none; }` hides the top bar;
`sutram-console::part(agent-prompt) { display: none; }` only one button.

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
