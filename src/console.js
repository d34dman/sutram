// <sutram-console>: one client of the registry.
// A drop-down console (or, with `inline`, one that sits in a container) with
// history, help, man, status, "did you mean", Tab completion, multi-line
// values, confirmation by the page's policy, --json[=fields] and --wide,
// syntax highlighting of the line being typed, and pasted batches of lines.

import { CommandError, EXIT, getRegistry } from "./core.js";
import { complete, highlight, openQuote, splitLines } from "./parse.js";
import { formatResult, formatUsage, annotationLabel, approvalLine } from "./format.js";
import { LINE_TEXT, clientWord, readBatch, readLine, readLines, runSteps } from "./lines.js";
import { genericQuestion, ownQuestion } from "./policy.js";
import { agentPrompt } from "./prompt.js";

/**
 * Every text the console shows of its own. Set `console.messages = { … }`
 * to translate some or all of them; what commands print is theirs to translate.
 */
export const MESSAGES = Object.freeze({
  title: "Sutram",
  count: (n) => `${n} commands on this page`,
  label: "Sutram console",
  placeholder: "type a command, or help",
  inputLabel: "Command",
  copy: "Copy",
  copyTitle: "Copy the output as text",
  copied: "Copied",
  copyFailed: "Not allowed",
  prompt: "Agent prompt",
  promptTitle: "Copy a prompt that hands this page to an agent with a browser",
  close: "Esc",
  closeLabel: "Close",
  yes: "Yes",
  no: "No",
  answered: (answer) => (answer ? "yes" : "no"),
  run: (name, title) => genericQuestion({ name, title }),
  cancelled: "Cancelled. Nothing changed.",
  withdrawn: "withdrawn",
  answerHint: "Answer y (yes) or n (no).",
  manWhich: LINE_TEXT.manWhich,
  manMissing: LINE_TEXT.manMissing,
  noStatus: LINE_TEXT.noStatus,
  pasted: (n) => `Pasted ${n} lines.`,
  batchConsequential: (n, names) => `Run all ${n} lines? ${names.join(", ")} cannot easily be undone.`,
  batchChanges: (n) => `Run all ${n} lines? They change the page.`,
  batchCancelled: "Cancelled. Nothing ran.",
  batchMistake: LINE_TEXT.batchMistake,
  batchNotLast: LINE_TEXT.batchNotLast,
  batchStopped: LINE_TEXT.batchStopped,
  batchUndone: LINE_TEXT.batchUndone,
  batchKept: LINE_TEXT.batchKept,
  agentAsks: "An agent wants to run:",
  agentAsksBatch: (n) => `An agent wants to run ${n} commands as one change:`,
  agentBatch: (n) => `Run these ${n} commands?`,
  agentBatchConsequential: (n, names) => `Run these ${n} commands? ${names.join(", ")} cannot easily be undone.`,
});

const STYLE = `
:host {
  --sutram-bg: #11131c; --sutram-fg: #e6e8f0; --sutram-dim: #8c93a8; --sutram-accent: #9aa2ff;
  --sutram-ok: #6fd69a; --sutram-warn: #f5a35c; --sutram-err: #ff7b7b; --sutram-line: #ffffff1a;
  --sutram-option: #7dcfff; --sutram-string: #c3e88d; --sutram-on-warn: #11131c;
  --sutram-radius: 0; --sutram-shadow: 0 8px 32px #0007;
  --sutram-font: ui-monospace, "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace;
  position: fixed; inset: 0 0 auto 0; z-index: 2147483000; display: none;
  /* The page's text styles stop here, so the highlight layer stays under the caret. */
  text-transform: none; letter-spacing: normal; word-spacing: normal; text-indent: 0; text-align: left;
  text-shadow: none; font-style: normal; font-weight: normal; font-variant: normal; font-stretch: normal;
  line-height: normal; white-space: normal; direction: ltr; text-decoration: none; hyphens: manual;
}
:host([open]) { display: block; }
:host([inline]) { position: relative; inset: auto; z-index: auto; display: block; height: 100%; min-height: 0; }
.panel { background: var(--sutram-bg); color: var(--sutram-fg); font: var(--sutram-font-size, 13px)/1.55 var(--sutram-font);
  height: var(--sutram-height, min(55vh, 520px)); display: flex; flex-direction: column; box-shadow: var(--sutram-shadow);
  border-bottom: 1px solid var(--sutram-line); border-radius: var(--sutram-radius); overflow: hidden; transition: opacity .15s; }
/* Peeking: the page shows through while the peek key is held. */
:host([peeking]) .panel { opacity: var(--sutram-peek-opacity, 0.12); }
@media (prefers-reduced-motion: reduce) { .panel { transition: none; } }
:host([inline]) .panel { height: 100%; box-shadow: none; border-bottom: 0; }
:host([inline]) .close { display: none; }
header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 6px 14px;
  border-bottom: 1px solid var(--sutram-line); color: var(--sutram-dim); font-size: 12px; }
header b { color: var(--sutram-fg); }
header .tools { display: flex; gap: 6px; }
header button { font: inherit; background: none; border: 1px solid var(--sutram-line); color: var(--sutram-dim); border-radius: 5px; padding: 0 8px; cursor: pointer; }
.panel:focus, .out:focus { outline: 0; }
/* One scroll area for all the output, as in a terminal: wide tables scroll it sideways, not a bar of their own. */
.out { flex: 1; overflow: auto; padding: 10px 14px; display: flex; flex-direction: column; gap: 2px; }
.ln { white-space: pre-wrap; word-break: break-word; }
.ln.table, .ln.man, .ln.json { white-space: pre; word-break: normal; }
.ln.input { margin-top: 6px; }
.ln.input::before { content: "› "; color: var(--sutram-accent); }
.ln.agent { margin-top: 0; }
.ln.agent::before { content: "  › "; color: var(--sutram-warn); }
.ln.dim, .ln .head { color: var(--sutram-dim); }
.ln.ok { color: var(--sutram-ok); }
.ln.error { color: var(--sutram-err); }
.ln.json { color: var(--sutram-dim); }
.ln .code { color: var(--sutram-dim); margin-left: 8px; }
.ln .tag { font-size: 11px; padding: 0 6px; border-radius: 99px; margin-left: 6px; border: 1px solid var(--sutram-line); }
.ln .tag.read-only { color: var(--sutram-ok); }
.ln .tag.consequential { color: var(--sutram-warn); }
.ln .tag.navigates, .ln .tag.reinitializes { color: var(--sutram-accent); }
.ln.ask { color: var(--sutram-warn); display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ln.ask button { font: inherit; font-size: 12px; border: 1px solid var(--sutram-warn); background: transparent; color: var(--sutram-warn); border-radius: 5px; padding: 0 10px; cursor: pointer; }
.ln.ask button.yes { background: var(--sutram-warn); color: var(--sutram-on-warn); }
.menu { list-style: none; margin: 0; padding: 4px 0; border-top: 1px solid var(--sutram-line); max-height: 40%; overflow: auto; flex: none; }
.menu[hidden] { display: none; }
.menu li { display: flex; gap: 16px; padding: 0 14px; cursor: pointer; white-space: pre; }
.menu li[aria-selected="true"] { background: var(--sutram-line); }
.menu .v { color: var(--sutram-fg); }
.menu .d { color: var(--sutram-dim); overflow: hidden; text-overflow: ellipsis; }
form { display: flex; gap: 8px; align-items: flex-start; border-top: 1px solid var(--sutram-line); padding: 8px 14px; }
form > span { color: var(--sutram-accent); }
.field { flex: 1; min-width: 0; display: grid; }
.field > * { grid-area: 1 / 1; font: inherit; padding: 0; margin: 0; border: 0; white-space: pre; letter-spacing: normal; }
.hl { overflow: hidden; pointer-events: none; color: var(--sutram-fg); }
textarea { min-width: 0; background: transparent; outline: 0; color: transparent; caret-color: var(--sutram-accent); resize: none; overflow: hidden; }
textarea::placeholder { color: var(--sutram-dim); }
.s-command { color: var(--sutram-accent); }
.s-client { color: var(--sutram-accent); font-style: italic; }
.s-unknown, .s-bad-option { color: var(--sutram-err); text-decoration: underline wavy; text-decoration-thickness: 1px; }
.s-option { color: var(--sutram-option); }
.s-value, .s-string { color: var(--sutram-string); }
button:focus-visible, textarea:focus-visible { outline: 2px solid var(--sutram-accent); outline-offset: 2px; }
`;

// Importable outside a browser (for server rendering or tests) without failing.
const Base = globalThis.HTMLElement || class {};

const isEditable = (el) => !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName)
  || (typeof el.closest === "function" && !!el.closest('[role="textbox"], [role="searchbox"], [role="combobox"]')));

/** The longest start that all strings share. */
const commonStart = (list) => list.reduce((a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(0, i);
});

const MAX_ROWS = 10;
const HISTORY_SIZE = 100;
/** The keys that can be held to peek, by peek attribute value. */
const PEEK_KEYS = Object.freeze({ alt: "Alt", ctrl: "Control", shift: "Shift", meta: "Meta" });
/** How long the peek key is held alone before the console fades, so Alt+letter does not flicker. */
const PEEK_DELAY = 200;
let instances = 0;
/** Consoles on the page, in the order they connected. */
const connected = new Set();

/**
 * The default hotkey: the key left of 1 outside text fields, and Ctrl with
 * it anywhere. Matched by position (e.code "Backquote"), the way game
 * consoles bind it, so it is the same key on every layout: ` on US English,
 * ^ on German, ² on French. Ctrl+` is also VS Code's terminal toggle.
 */
export const DEFAULT_HOTKEY = "backquote ctrl+backquote";

const MODIFIERS = ["ctrl", "alt", "shift", "meta"];
const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

/**
 * Reads a hotkey: space-separated bindings such as "mod+k ctrl+backquote",
 * or "none". A binding is modifiers (ctrl, alt, shift, meta, or mod: Cmd on
 * macOS, Ctrl elsewhere) and a key. A letter or digit is the character the
 * keyboard types, so ctrl+k stays K on any layout; any other key is named by
 * its position, as KeyboardEvent.code in lowercase: backquote, slash, f2.
 */
export function parseHotkey(spec = DEFAULT_HOTKEY) {
  const text = String(spec).trim().toLowerCase();
  if (!text || text === "none") return [];
  return text.split(/\s+/).map((binding) => {
    const parts = binding.split("+");
    const key = parts.pop();
    if (!key) throw new TypeError(`hotkey: "${binding}" has no key`);
    const b = { binding, key, ctrl: false, alt: false, shift: false, meta: false };
    for (const m of parts) {
      if (m === "mod") b[isMac() ? "meta" : "ctrl"] = true;
      else if (MODIFIERS.includes(m)) b[m] = true;
      else throw new TypeError(`hotkey: unknown modifier "${m}" in "${binding}"; use ctrl, alt, shift, meta or mod`);
    }
    return b;
  });
}

/** The binding a key event matches, or null. A binding without ctrl, alt or meta never fires in a text field. */
export function matchHotkey(e, bindings, { inField = false } = {}) {
  for (const b of bindings) {
    if (e.ctrlKey !== b.ctrl || e.altKey !== b.alt || e.shiftKey !== b.shift || e.metaKey !== b.meta) continue;
    if (inField && !b.ctrl && !b.alt && !b.meta) continue;
    const typed = String(e.key || "").toLowerCase();
    const hit = /^[a-z0-9]$/.test(b.key)
      // Alt+K on macOS types ˚: then the key's position decides.
      ? typed === b.key || (!/^[a-z0-9]$/.test(typed) && e.code === (/\d/.test(b.key) ? `Digit${b.key}` : `Key${b.key.toUpperCase()}`))
      : String(e.code || "").toLowerCase() === b.key;
    if (hit) return b;
  }
  return null;
}

export class SutramConsole extends Base {
  constructor() {
    super();
    this.registry = getRegistry();
    this.history = [];
    this.historyIndex = 0;
    this.pendingAsk = null;
    this.askQueue = [];
    this.returnFocus = null;
    this.menuState = { items: [], index: -1, start: 0, request: 0 };
    this._messages = MESSAGES;
    this._historyStore = null;
    this.ranHere = []; // lines run on this page, which a store's lines go before
    const menuId = `sutram-menu-${++instances}`;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${STYLE}</style>
      <div class="panel" part="panel" tabindex="-1">
        <header part="header"><span><b class="title"></b> · <span class="count"></span></span><span class="tools"><button type="button" class="agent-prompt" part="agent-prompt"></button><button type="button" class="copy" part="copy"></button><button type="button" class="close" part="close"></button></span></header>
        <div class="out" part="output" aria-live="polite" tabindex="-1"></div>
        <ul class="menu" part="menu" role="listbox" id="${menuId}" hidden></ul>
        <form part="prompt"><span aria-hidden="true">›</span><div class="field"><div class="hl" aria-hidden="true"></div><textarea rows="1" wrap="off" autocomplete="off" autocapitalize="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-controls="${menuId}" aria-expanded="false"></textarea></div></form>
      </div>`;
    this.panel = root.querySelector(".panel");
    this.out = root.querySelector(".out");
    this.menu = root.querySelector(".menu");
    this.input = root.querySelector("textarea");
    this.hl = root.querySelector(".hl");
    this.countEl = root.querySelector(".count");
    root.querySelector(".close").addEventListener("click", () => this.close());
    const copyButton = (selector, text, label) => root.querySelector(selector).addEventListener("click", async (e) => {
      const b = e.currentTarget;
      try { await navigator.clipboard.writeText(text()); b.textContent = this.messages.copied; } catch { b.textContent = this.messages.copyFailed; }
      setTimeout(() => { b.textContent = this.messages[label]; }, 1500);
    });
    copyButton(".copy", () => this.transcript(), "copy");
    // With no task it asks "Show me what this page can do."; the person pastes it and changes that line.
    copyButton(".agent-prompt", () => agentPrompt("", { title: document.title, url: location.href }), "prompt");
    this.input.addEventListener("paste", (e) => {
      const text = e.clipboardData && e.clipboardData.getData("text");
      if (!text || !/\n./.test(text.trim())) return;
      // Inside an open quote the lines are one value, such as a prompt.
      if (openQuote(this.input.value.slice(0, this.input.selectionStart))) return;
      if (splitLines(text.trim()).filter((l) => l.trim()).length < 2) return;
      // Several lines pasted at once run as a batch.
      e.preventDefault();
      this.setInput("");
      this.enqueue(() => this.runBatch(text));
    });
    root.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); this.submitInput(); });
    this.input.addEventListener("keydown", (e) => this.onInputKey(e));
    this.input.addEventListener("input", () => { this.renderInput(); if (!this.menu.hidden) this.refreshMenu(); });
    this.input.addEventListener("blur", () => this.closeMenu());
    // The field scrolls when the line is longer than it; follow it.
    for (const type of ["scroll", "keyup", "click", "select"]) this.input.addEventListener(type, () => this.syncScroll());
    this.menu.addEventListener("mousedown", (e) => {
      const li = e.target.closest("li");
      if (!li) return;
      e.preventDefault();
      this.accept(Number(li.dataset.index));
    });
    // A click in the console goes to the prompt, as in a terminal. Not when it
    // selects text (a drag or a double click): that stays selected to copy.
    this.panel.addEventListener("mousedown", (e) => { this.pressedAt = [e.clientX, e.clientY]; });
    this.panel.addEventListener("click", (e) => {
      if (e.button !== 0 || e.detail > 1 || e.target.closest("button, textarea, .menu")) return;
      const [x, y] = this.pressedAt || [e.clientX, e.clientY];
      if (Math.abs(e.clientX - x) > 3 || Math.abs(e.clientY - y) > 3 || this.selectedText()) return;
      this.input.focus({ preventScroll: true });
    });
    this.panel.addEventListener("keydown", (e) => {
      if (e.defaultPrevented || e.isComposing) return;
      // Escape closes the console only when it has the focus; the page's own Escape stays the page's.
      if (e.key === "Escape" && !this.inline) { e.preventDefault(); this.close(); return; }
      // Typing while the output has the focus (after selecting text) types at the prompt.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.target !== this.input && !e.target.closest("button")) {
        this.input.focus({ preventScroll: true });
        return;
      }
      // A drop-down console is a modal dialog: Tab stays inside it.
      if (e.key !== "Tab" || this.inline) return;
      const items = [...root.querySelectorAll("button, textarea")].filter((el) => el.offsetParent !== null || el === this.input);
      if (!items.length) return;
      const at = items.indexOf(root.activeElement);
      const next = items[(at + (e.shiftKey ? -1 : 1) + items.length) % items.length];
      e.preventDefault();
      next.focus();
    });
    this.onGlobalKey = this.onGlobalKey.bind(this);
    this.onPeekEvent = this.onPeekEvent.bind(this);
    this.peekTimer = null;
    this.renderChrome();
  }

  /** The text selected in the console, if any. */
  selectedText() {
    // Chromium reports a selection inside a shadow root only on the root.
    const sel = typeof this.shadowRoot.getSelection === "function" ? this.shadowRoot.getSelection() : document.getSelection();
    return sel && !sel.isCollapsed ? String(sel) : "";
  }

  /** The hotkey bindings, from the hotkey attribute (see parseHotkey). A hotkey that cannot be read falls back to the default, with a warning. */
  get hotkeys() {
    const spec = this.hasAttribute("hotkey") ? this.getAttribute("hotkey") : DEFAULT_HOTKEY;
    if (this._hotkeySpec !== spec) {
      this._hotkeySpec = spec;
      try { this._hotkeys = parseHotkey(spec); } catch (err) {
        console.warn(`sutram: ${err.message}. Using "${DEFAULT_HOTKEY}".`);
        this._hotkeys = parseHotkey(DEFAULT_HOTKEY);
      }
    }
    return this._hotkeys;
  }

  /** The console's own texts. Assign an object with some of MESSAGES' keys to translate them. */
  get messages() { return this._messages; }
  set messages(value) {
    this._messages = { ...MESSAGES, ...(value || {}) };
    this.renderChrome();
  }

  /**
   * Where history is kept between pages: { load(), save(lines) }, or null.
   * Sutram stores nothing itself, so by default history lasts as long as the
   * page. An app that wants more passes a store, and decides where and how
   * long the lines are kept. load() may return a promise.
   */
  get historyStore() { return this._historyStore; }
  set historyStore(store) {
    this._historyStore = store || null;
    this.loadHistory();
  }

  get inline() { return this.hasAttribute("inline"); }

  /**
   * The key held to peek ("Alt", "Control", "Shift" or "Meta"), or null when
   * the console does not peek. From the peek attribute: absent means no peek,
   * empty means alt. A name it does not know peeks with alt, with a warning.
   */
  get peekKey() {
    if (!this.hasAttribute("peek")) return null;
    const name = (this.getAttribute("peek") || "alt").trim().toLowerCase();
    if (name === "none") return null;
    if (PEEK_KEYS[name]) return PEEK_KEYS[name];
    if (this._peekWarned !== name) {
      this._peekWarned = name;
      console.warn(`sutram: peek "${name}" is not one of ${Object.keys(PEEK_KEYS).join(", ")}. Using "alt".`);
    }
    return PEEK_KEYS.alt;
  }

  get peeking() { return this.hasAttribute("peeking"); }

  connectedCallback() {
    if (!this.inline) document.addEventListener("keydown", this.onGlobalKey);
    // Capture, so keys the console or the page stop on their way still end a peek.
    for (const type of ["keydown", "keyup", "pointerdown", "blur"]) window.addEventListener(type, this.onPeekEvent, true);
    this.panel.setAttribute("role", this.inline ? "region" : "dialog");
    if (this.inline) this.panel.removeAttribute("aria-modal");
    else this.panel.setAttribute("aria-modal", "true");
    this.offChange = this.registry.onChange(() => { this.updateCount(); this.renderInput(); });
    connected.add(this);
    // The first console on the page asks the user when an agent needs approval.
    this.takeAsker();
    this.updateCount();
    if (!this.out.childElementCount && this.hasAttribute("greeting")) this.print(this.getAttribute("greeting"), "dim");
  }

  disconnectedCallback() {
    connected.delete(this);
    document.removeEventListener("keydown", this.onGlobalKey);
    for (const type of ["keydown", "keyup", "pointerdown", "blur"]) window.removeEventListener(type, this.onPeekEvent, true);
    this.stopPeek();
    if (this.offChange) this.offChange();
    // Nobody can answer here any more: open and queued questions are answered no.
    for (const show of this.askQueue.splice(0)) show.cancel();
    if (this.pendingAsk) this.pendingAsk(false);
    if (this.offAsker) {
      this.offAsker();
      this.offAsker = null;
      // Another console on the page takes over asking.
      for (const other of connected) if (other.registry === this.registry && other.takeAsker()) break;
    }
  }

  /** Becomes the policy's asker when there is none. True when it did. */
  takeAsker() {
    if (this.registry.policy.hasAsker()) return false;
    this.offAsker = this.registry.policy.setAsker((request) => this.askForAgent(request));
    return true;
  }

  get formatOptions() {
    return { locale: this.getAttribute("locale") || undefined, formats: this.registry.formats };
  }

  renderChrome() {
    const m = this.messages;
    const root = this.shadowRoot;
    root.querySelector(".title").textContent = m.title;
    this.panel.setAttribute("aria-label", m.label);
    this.input.placeholder = m.placeholder;
    this.input.setAttribute("aria-label", m.inputLabel);
    const copy = root.querySelector(".copy");
    copy.textContent = m.copy;
    copy.title = m.copyTitle;
    const prompt = root.querySelector(".agent-prompt");
    prompt.textContent = m.prompt;
    prompt.title = m.promptTitle;
    const close = root.querySelector(".close");
    close.textContent = m.close;
    close.setAttribute("aria-label", m.closeLabel);
    this.updateCount();
  }

  updateCount() { this.countEl.textContent = this.messages.count(this.registry.list().length); }

  /** Colours a command line: the command, options, values and quoted words. */
  spans(line) {
    return highlight(this.registry, line).map(({ text, kind }) => {
      if (kind === "space" || kind === "arg") return document.createTextNode(text);
      const s = document.createElement("span");
      s.className = `s-${kind}`;
      s.textContent = text;
      return s;
    });
  }

  setInput(value) {
    this.input.value = value;
    this.renderInput();
  }

  renderInput() {
    const value = this.input.value;
    this.input.rows = Math.min(MAX_ROWS, value.split("\n").length);
    this.input.style.overflowY = value.split("\n").length > MAX_ROWS ? "auto" : "hidden";
    // A trailing space keeps the layer as wide as the field when the caret is at the end.
    this.hl.replaceChildren(...this.spans(value), " ");
    this.syncScroll();
  }

  syncScroll() {
    this.hl.scrollLeft = this.input.scrollLeft;
    this.hl.scrollTop = this.input.scrollTop;
  }

  open() {
    // Something to see, such as an agent's question: no longer faded.
    this.stopPeek();
    if (!this.inline && !this.hasAttribute("open")) {
      // Focus goes back where it was when the console closes.
      const active = document.activeElement;
      this.returnFocus = active && active !== this && active !== document.body ? active : null;
    }
    if (!this.inline) this.setAttribute("open", "");
    // Focus now, so the next key typed lands in the field, and again after
    // the next frame in case the page moved the focus in between.
    this.input.focus({ preventScroll: true });
    requestAnimationFrame(() => { if (this.shadowRoot.activeElement !== this.input) this.input.focus({ preventScroll: true }); });
    this.dispatchEvent(new CustomEvent("sutram-open"));
  }

  close() {
    if (this.inline) return;
    this.stopPeek();
    this.closeMenu();
    this.removeAttribute("open");
    const back = this.returnFocus;
    this.returnFocus = null;
    if (back && back.isConnected && typeof back.focus === "function") back.focus();
    this.dispatchEvent(new CustomEvent("sutram-close"));
  }

  toggle() { this.hasAttribute("open") ? this.close() : this.open(); }

  /**
   * Peek: holding the peek key alone fades the console, so the page behind it
   * shows; letting go brings it back. Any other key, a click or leaving the
   * window ends it, so shortcuts with the key and typing keep working.
   */
  onPeekEvent(e) {
    const key = this.peekKey;
    if (!key) return;
    if (e.type === "blur" || e.type === "pointerdown") {
      if (e.type === "pointerdown" || e.target === window) this.stopPeek();
      return;
    }
    // Only keys a person presses; apps fire keyboard events of their own.
    if (!e.isTrusted) return;
    if (e.type === "keyup") {
      if (e.key !== key) return;
      // Firefox on Windows opens its menu bar when Alt is let go.
      if (this.peeking) e.preventDefault();
      this.stopPeek();
      return;
    }
    if (e.key !== key) { this.stopPeek(); return; }
    // A held key repeats; the first press started the wait.
    if (e.repeat || this.peekTimer || this.peeking) return;
    const held = ["altKey", "ctrlKey", "shiftKey", "metaKey"].filter((m) => e[m]).length;
    if (held !== 1 || !(this.inline || this.hasAttribute("open"))) return;
    this.peekTimer = setTimeout(() => {
      this.peekTimer = null;
      this.setAttribute("peeking", "");
    }, PEEK_DELAY);
  }

  stopPeek() {
    if (this.peekTimer) clearTimeout(this.peekTimer);
    this.peekTimer = null;
    if (this.peeking) this.removeAttribute("peeking");
  }

  /** The hotkey (the hotkey attribute, DEFAULT_HOTKEY when unset) toggles the console. Escape is the panel's own (see the constructor). */
  onGlobalKey(e) {
    if (e.isComposing || e.keyCode === 229) return;
    // Only keys a person presses toggle the console; apps fire keydown events of their own.
    if (!e.isTrusted) return;
    // One drop-down console answers the hotkey: the first one connected. A held key does not toggle it again and again.
    if (e.repeat || [...connected].find((c) => !c.inline) !== this) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (matchHotkey(e, this.hotkeys, { inField: isEditable(path[0] || document.activeElement) })) {
      e.preventDefault();
      this.toggle();
    }
  }

  onInputKey(e) {
    // While an input method composes (Japanese, Chinese, accents), its keys are its own.
    if (e.isComposing || e.keyCode === 229) return;
    const value = this.input.value;
    const caret = this.input.selectionStart;
    if (!this.menu.hidden) {
      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) { e.preventDefault(); this.moveSelection(1); return; }
      if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) { e.preventDefault(); this.moveSelection(-1); return; }
      if (e.key === "Enter" && this.menuState.index >= 0) { e.preventDefault(); this.accept(this.menuState.index); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this.closeMenu(); return; }
    }
    // Tab completes; on an empty line it moves focus on, as usual.
    if (e.key === "Tab" && !e.shiftKey && value) { e.preventDefault(); this.completeInput(); return; }
    if (e.key === "Enter" && !e.shiftKey) {
      // Inside an open quote, Enter starts a new line of the value.
      if (openQuote(value)) return;
      e.preventDefault();
      this.submitInput();
      return;
    }
    if (e.key === "ArrowUp" && !value.slice(0, caret).includes("\n") && this.historyIndex > 0) {
      // Leaving the line being typed: keep it for ArrowDown to bring back.
      if (this.historyIndex === this.history.length) this.draft = value;
      this.historyIndex--;
      this.setInput(this.history[this.historyIndex]);
      e.preventDefault();
    } else if (e.key === "ArrowDown" && !value.slice(caret).includes("\n") && this.historyIndex < this.history.length) {
      this.historyIndex++;
      this.setInput(this.historyIndex === this.history.length ? this.draft || "" : this.history[this.historyIndex]);
      e.preventDefault();
    } else if (!value && !this.inline && !e.ctrlKey && !e.altKey && !e.metaKey && matchHotkey(e, this.hotkeys)) {
      // The plain hotkey in an empty field closes the console again.
      e.preventDefault();
      this.close();
    }
  }

  /** Runs what is in the field: one command, or several lines (typed with Shift+Enter) as a batch. */
  submitInput() {
    const text = this.input.value;
    this.setInput("");
    this.closeMenu();
    if (splitLines(text.trim()).filter((l) => l.trim()).length > 1) return this.enqueue(() => this.runBatch(text));
    // An answer to an open question cannot wait: the running command waits for it.
    if (this.pendingAsk) return this.submit(text);
    return this.enqueue(() => this.submit(text));
  }

  /** Runs typed work one at a time, in order, so each output follows its own line. */
  enqueue(fn) {
    const run = (this.work || Promise.resolve()).then(fn);
    this.work = run.catch(() => {});
    return run;
  }

  // ---- completion --------------------------------------------------------

  async fetchCompletions() {
    const request = ++this.menuState.request;
    const before = this.input.value.slice(0, this.input.selectionStart);
    const result = await complete(this.registry, before);
    return request === this.menuState.request ? result : null;
  }

  /** Tab: one completion is filled in; several fill in what they share and show a list. */
  async completeInput() {
    const result = await this.fetchCompletions();
    if (!result) return;
    const { start, items } = result;
    if (!items.length) { this.closeMenu(); return; }
    if (items.length === 1) { this.insert(start, items[0].value); return; }
    const typed = this.input.value.slice(start, this.input.selectionStart);
    const shared = commonStart(items.map((i) => i.value));
    if (shared.length > typed.length && shared.toLowerCase().startsWith(typed.toLowerCase())) this.insert(start, shared);
    this.showMenu(start, items);
  }

  async refreshMenu() {
    const result = await this.fetchCompletions();
    if (!result) return;
    if (!result.items.length) this.closeMenu();
    else this.showMenu(result.start, result.items);
  }

  showMenu(start, items) {
    Object.assign(this.menuState, { start, items, index: -1 });
    this.menu.replaceChildren(...items.map((item, i) => {
      const li = document.createElement("li");
      li.id = `${this.menu.id}-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.dataset.index = i;
      const v = document.createElement("span");
      v.className = "v";
      v.textContent = item.label || item.value.trim();
      li.append(v);
      if (item.description) {
        const d = document.createElement("span");
        d.className = "d";
        d.textContent = item.description;
        li.append(d);
      }
      return li;
    }));
    this.menu.hidden = false;
    this.input.setAttribute("aria-expanded", "true");
    this.input.removeAttribute("aria-activedescendant");
  }

  closeMenu() {
    this.menuState.request++;
    if (this.menu.hidden) return;
    this.menu.hidden = true;
    this.menu.replaceChildren();
    this.menuState.items = [];
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
  }

  moveSelection(step) {
    const { items } = this.menuState;
    if (!items.length) return;
    const index = (this.menuState.index + step + items.length + (this.menuState.index < 0 && step < 0 ? 1 : 0)) % items.length;
    this.menuState.index = index;
    [...this.menu.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === index)));
    const li = this.menu.children[index];
    this.input.setAttribute("aria-activedescendant", li.id);
    li.scrollIntoView({ block: "nearest" });
  }

  accept(index) {
    const item = this.menuState.items[index];
    if (item) this.insert(this.menuState.start, item.value);
    this.closeMenu();
  }

  /** Replaces the text from `start` to the caret with `text`. */
  insert(start, text) {
    const value = this.input.value;
    const caret = this.input.selectionStart;
    this.input.value = value.slice(0, start) + text + value.slice(caret);
    const at = start + text.length;
    this.input.setSelectionRange(at, at);
    this.renderInput();
    this.input.focus();
  }

  // ---- output ------------------------------------------------------------

  print(text, kind = "text") {
    const el = document.createElement("div");
    el.className = `ln ${kind}`;
    el.textContent = text;
    this.out.append(el);
    this.out.scrollTop = this.out.scrollHeight;
    return el;
  }

  printBlocks(blocks, okKind = "text") {
    for (const b of blocks) {
      if (b.kind === "table") {
        const el = this.print("", "table");
        const head = document.createElement("span");
        head.className = "head";
        head.textContent = b.head;
        el.append(head, "\n" + b.text.split("\n").slice(1).join("\n"));
      } else if (b.kind === "error") {
        const el = this.print(b.text, "error");
        if (b.code !== undefined) {
          const code = document.createElement("span");
          code.className = "code";
          code.textContent = `exit ${b.code}`;
          el.append(code);
        }
      } else if (b.commands) {
        // help: one line per command, with its annotation as a tag.
        b.text.split("\n").forEach((line, i) => {
          const label = annotationLabel(b.commands[i].annotations);
          const el = this.print(label ? line.replace(`  [${label}]`, "") : line, "text");
          if (label) {
            const tag = document.createElement("span");
            tag.className = `tag ${label}`;
            tag.textContent = label;
            el.append(tag);
          }
        });
      } else {
        this.print(b.text, b.kind === "text" || b.kind === "pairs" ? okKind : b.kind);
      }
    }
  }

  printResult(result, { def, json, wide, fields }) {
    this.printBlocks(formatResult(result, def, { ...this.formatOptions, json, wide, fields }), def.annotations.readOnly ? "text" : "ok");
  }

  fail(text, code) {
    this.printBlocks([{ kind: "error", text, code }]);
    return code;
  }

  echo(line, kind = "input") {
    this.print("", kind).append(...this.spans(line));
  }

  remember(line) {
    this.ranHere.push(line);
    if (this.ranHere.length > HISTORY_SIZE) this.ranHere.shift();
    this.history.push(line);
    if (this.history.length > HISTORY_SIZE) this.history.splice(0, this.history.length - HISTORY_SIZE);
    this.historyIndex = this.history.length;
    this.saveHistory();
  }

  /**
   * Puts the store's lines before the ones run on this page. A store that
   * fails or returns something else leaves history as it is.
   */
  loadHistory() {
    const store = this._historyStore;
    if (!store) return;
    const take = (list) => {
      if (!Array.isArray(list)) return;
      const lines = list.filter((l) => typeof l === "string");
      this.history = [...lines, ...this.ranHere].slice(-HISTORY_SIZE);
      this.historyIndex = this.history.length;
    };
    try {
      const list = store.load();
      if (list && typeof list.then === "function") list.then(take, () => {});
      else take(list);
    } catch { /* storage blocked, say: history stays on this page */ }
  }

  saveHistory() {
    const store = this._historyStore;
    if (!store) return;
    try {
      const done = store.save([...this.history]);
      if (done && typeof done.catch === "function") done.catch(() => {});
    } catch { /* storage blocked or full */ }
  }

  /**
   * Asks a yes/no question in the output. Resolves to true or false. Typing
   * y or n answers too; anything else asks again. A question asked while
   * another is open waits its turn; `lead` prints what it is about when its
   * turn comes.
   */
  ask(message, { lead = null, signal } = {}) {
    return new Promise((resolve) => {
      if (signal && signal.aborted) { resolve(false); return; }
      let done = null; // set once the question is shown
      const show = () => { done = this.showAsk(message, lead, resolve); };
      show.cancel = () => resolve(false);
      // A withdrawn question goes: from the queue, or answered "withdrawn" on screen.
      if (signal) {
        signal.addEventListener("abort", () => {
          if (done) done(false, this.messages.withdrawn);
          else { this.askQueue = this.askQueue.filter((s) => s !== show); show.cancel(); }
        }, { once: true });
      }
      if (this.pendingAsk) this.askQueue.push(show);
      else show();
    });
  }

  /** Shows a question from ask() and waits for its answer; then the next queued question, if any. */
  showAsk(message, lead, resolve) {
    const m = this.messages;
    if (lead) lead();
    const el = this.print(message + " ", "ask");
    let answered = false;
    const done = (answer, label) => {
      if (answered) return;
      answered = true;
      if (this.pendingAsk === done) { this.pendingAsk = null; this.askEl = null; }
      el.querySelectorAll("button").forEach((b) => b.remove());
      el.append(label || m.answered(answer));
      resolve(answer);
      this.input.focus();
      const next = this.askQueue.shift();
      if (next) next();
    };
    const choices = [[m.yes, true], [m.no, false]];
    for (const [label, answer] of choices) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      if (answer === true) b.className = "yes";
      b.addEventListener("click", () => done(answer));
      el.append(b);
    }
    this.pendingAsk = done;
    this.askEl = el;
    return done;
  }

  /** The policy's asker: shows what an agent wants to run, and asks. */
  async askForAgent({ steps, signal }) {
    const m = this.messages;
    this.open();
    const lead = () => {
      this.print(steps.length === 1 ? m.agentAsks : m.agentAsksBatch(steps.length), "dim");
      // Shortened, so a long value cannot push the other commands off the screen.
      for (const { def, input } of steps) this.echo(approvalLine(def, input), "input agent");
    };
    // A batch names its consequential commands, as a pasted batch does.
    const consequential = [...new Set(steps.filter((s) => s.def.annotations.consequential).map((s) => s.def.name))];
    const question = steps.length === 1 ? (ownQuestion(steps[0].def, steps[0].input) || m.run(steps[0].def.name, steps[0].def.title))
      : consequential.length ? m.agentBatchConsequential(steps.length, consequential) : m.agentBatch(steps.length);
    return this.ask(question, { lead, signal });
  }

  // ---- running -----------------------------------------------------------

  /** help, man, status and clear (see lines.js): prints their output. Resolves to the exit code. */
  async runClientWord(words) {
    const done = await clientWord(this.registry, words, { caller: "console", text: this.messages });
    // An open question stays: it is still waiting for its answer.
    if (done.clear) this.out.replaceChildren(...(this.pendingAsk && this.askEl ? [this.askEl] : []));
    this.printBlocks(done.blocks);
    return done.code;
  }

  /**
   * Runs one line, as if it was typed. Resolves to its exit code.
   */
  async submit(line) {
    line = String(line).trim();
    if (!line) return EXIT.OK;
    // A typed line answers an open question.
    if (this.pendingAsk) {
      this.print(line, "input");
      const answer = /^y(es)?$/i.test(line) ? true : /^n(o)?$/i.test(line) ? false : null;
      // Anything else, such as a command typed too early, asks again instead of meaning no.
      if (answer === null) { this.print(this.messages.answerHint, "dim"); return EXIT.USAGE; }
      this.pendingAsk(answer);
      return EXIT.OK;
    }
    this.remember(line);
    this.echo(line);

    let step;
    try { step = readLine(this.registry, line); } catch (err) {
      return this.fail(err.message, err instanceof CommandError ? err.code : EXIT.FAILED);
    }
    if (step.words) return this.runClientWord(step.words);
    const { def } = step;
    if (step.help) { this.printBlocks(formatUsage(def)); return EXIT.OK; }
    const policy = this.registry.policy;
    // The question the person said yes to: the run checks it still holds.
    let asked;
    if (policy.needs(def, "person")) {
      asked = ownQuestion(def, step.value);
      const answer = await this.ask(asked || this.messages.run(def.name, def.title));
      if (!answer) { this.print(this.messages.cancelled, "dim"); return EXIT.CANCELLED; }
    }
    const result = await this.registry.run(def.name, step.input, { caller: "console", expect: def, asked });
    this.printResult(result, step);
    return result.code;
  }

  /**
   * Runs pasted lines as one batch (see lines.js). Every line is read first,
   * so a batch with a mistake runs nothing. Pasted text is the least
   * carefully read input, so the batch asks once, naming its consequential
   * lines. It stops at the first line that fails, and providers with batch
   * hooks undo what the earlier lines did. Prompt marks copied along with the
   * lines (› or $) and # comments are ignored.
   */
  async runBatch(text) {
    const m = this.messages;
    const lines = readLines(text);
    if (!lines.length) return EXIT.OK;
    if (lines.length === 1) return this.submit(lines[0]);
    this.print(m.pasted(lines.length), "dim");

    const { steps, failed } = readBatch(this.registry, lines, m);
    if (failed) {
      this.echo(lines[failed.index]);
      this.fail(failed.message, failed.code);
      this.print(m.batchMistake(failed.index + 1, lines.length), "dim");
      return failed.code;
    }

    const policy = this.registry.policy;
    const asking = steps.filter((s) => s.def && !s.help && policy.needs(s.def, "person")).map((s) => s.def);
    if (asking.length) {
      const consequential = [...new Set(asking.filter((d) => d.annotations.consequential).map((d) => d.name))];
      const question = consequential.length ? m.batchConsequential(lines.length, consequential) : m.batchChanges(lines.length);
      if (!(await this.ask(question))) { this.print(m.batchCancelled, "dim"); return EXIT.CANCELLED; }
    }

    const show = (step, blocks, { result, clear }) => {
      if (clear) this.out.replaceChildren(...(this.pendingAsk && this.askEl ? [this.askEl] : []));
      this.printBlocks(blocks, step.def && !step.def.annotations.readOnly && result ? "ok" : "text");
    };
    const done = await runSteps(this.registry, steps, {
      caller: "console",
      formatOptions: this.formatOptions,
      text: m,
      start: (step) => { this.remember(step.line); this.echo(step.line); },
      show,
    });
    if (done.error) this.fail(done.error, EXIT.FAILED);
    for (const note of done.notes) this.print(note, "dim");
    return done.code;
  }

  /**
   * The console's output as plain text, for pasting into a chat: typed lines
   * start with "› ", exit codes read "(exit 2)" and annotation tags "[read-only]".
   */
  transcript() {
    const text = (el) => [...el.childNodes].map((n) => {
      if (n.nodeType !== 1) return n.textContent;
      if (n.classList.contains("code")) return `  (${n.textContent})`;
      if (n.classList.contains("tag")) return `  [${n.textContent}]`;
      return n.textContent;
    }).join("");
    return [...this.out.children].map((el) => (el.classList.contains("input") ? `› ${el.textContent}` : text(el))).join("\n");
  }
}

/** Defines <sutram-console> once, however many copies are loaded. */
export function defineConsole(tag = "sutram-console") {
  if (typeof customElements !== "undefined" && !customElements.get(tag)) customElements.define(tag, SutramConsole);
}

/**
 * Adds a console and returns it. Without a container: the page's drop-down
 * console, created once. With a container: a new inline console inside it,
 * which fills the container and has no hotkey, for apps that place the
 * console themselves. `attributes` may hold greeting, locale, hotkey, peek,
 * messages and historyStore.
 */
export function mountConsole(attributes = {}, container = null) {
  defineConsole();
  const { messages, historyStore, ...attrs } = attributes || {};
  const make = () => {
    const el = document.createElement("sutram-console");
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? "" : v);
    if (container) el.setAttribute("inline", "");
    if (messages) el.messages = messages;
    if (historyStore) el.historyStore = historyStore;
    return el;
  };
  if (container) {
    const el = make();
    container.append(el);
    return el;
  }
  let el = document.querySelector("sutram-console:not([inline])");
  if (!el) {
    el = make();
    document.body.append(el);
  }
  return el;
}
