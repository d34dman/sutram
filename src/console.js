// <sutram-console>: one client of the registry.
// A drop-down console with history, help, man, status, "did you mean",
// confirmation for consequential commands, --json[=fields] and --wide.

import { CommandError, EXIT, getRegistry, runStatus } from "./core.js";
import { parse, tokenize } from "./parse.js";
import { formatHelp, formatMan, formatResult, formatUsage, annotationLabel, checkFields } from "./format.js";

const STYLE = `
:host {
  --sutram-bg: #11131c; --sutram-fg: #e6e8f0; --sutram-dim: #8c93a8; --sutram-accent: #9aa2ff;
  --sutram-ok: #6fd69a; --sutram-warn: #f5a35c; --sutram-err: #ff7b7b; --sutram-line: #ffffff1a;
  --sutram-font: ui-monospace, "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace;
  position: fixed; inset: 0 0 auto 0; z-index: 2147483000; display: none;
}
:host([open]) { display: block; }
.panel { background: var(--sutram-bg); color: var(--sutram-fg); font: 13px/1.55 var(--sutram-font);
  height: min(55vh, 520px); display: flex; flex-direction: column; box-shadow: 0 8px 32px #0007;
  border-bottom: 1px solid var(--sutram-line); }
header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 6px 14px;
  border-bottom: 1px solid var(--sutram-line); color: var(--sutram-dim); font-size: 12px; }
header b { color: var(--sutram-fg); }
header button { font: inherit; background: none; border: 1px solid var(--sutram-line); color: var(--sutram-dim); border-radius: 5px; padding: 0 8px; cursor: pointer; }
.out { flex: 1; overflow: auto; padding: 10px 14px; display: flex; flex-direction: column; gap: 2px; }
.ln { white-space: pre-wrap; word-break: break-word; }
.ln.table, .ln.man, .ln.json { white-space: pre; word-break: normal; overflow-x: auto; }
.ln.input { margin-top: 6px; }
.ln.input::before { content: "› "; color: var(--sutram-accent); }
.ln.dim, .ln .head { color: var(--sutram-dim); }
.ln.ok { color: var(--sutram-ok); }
.ln.error { color: var(--sutram-err); }
.ln.json { color: var(--sutram-dim); }
.ln .code { color: var(--sutram-dim); margin-left: 8px; }
.ln .tag { font-size: 11px; padding: 0 6px; border-radius: 99px; margin-left: 6px; border: 1px solid var(--sutram-line); }
.ln .tag.read-only { color: var(--sutram-ok); }
.ln .tag.consequential { color: var(--sutram-warn); }
.ln .tag.navigates { color: var(--sutram-accent); }
.ln.ask { color: var(--sutram-warn); display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ln.ask button { font: inherit; font-size: 12px; border: 1px solid var(--sutram-warn); background: transparent; color: var(--sutram-warn); border-radius: 5px; padding: 0 10px; cursor: pointer; }
.ln.ask button.yes { background: var(--sutram-warn); color: var(--sutram-bg); }
form { display: flex; gap: 8px; align-items: center; border-top: 1px solid var(--sutram-line); padding: 8px 14px; }
form span { color: var(--sutram-accent); }
input { flex: 1; min-width: 0; background: transparent; border: 0; outline: 0; color: var(--sutram-fg); font: inherit; caret-color: var(--sutram-accent); }
button:focus-visible, input:focus-visible { outline: 2px solid var(--sutram-accent); outline-offset: 2px; }
`;

// Importable outside a browser (for server rendering or tests) without failing.
const Base = globalThis.HTMLElement || class {};

const isEditable = (el) => el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));

export class SutramConsole extends Base {
  constructor() {
    super();
    this.registry = getRegistry();
    this.history = [];
    this.historyIndex = 0;
    this.pendingAsk = null;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${STYLE}</style>
      <div class="panel" role="dialog" aria-label="Sutram console">
        <header><span><b>Sutram</b> · <span class="count">0</span> commands on this page</span><button type="button" class="close" aria-label="Close">Esc</button></header>
        <div class="out" aria-live="polite"></div>
        <form><span aria-hidden="true">›</span><input type="text" autocomplete="off" spellcheck="false" aria-label="Command" placeholder="type a command, or help"></form>
      </div>`;
    this.out = root.querySelector(".out");
    this.input = root.querySelector("input");
    this.countEl = root.querySelector(".count");
    root.querySelector(".close").addEventListener("click", () => this.close());
    root.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const line = this.input.value;
      this.input.value = "";
      this.submit(line);
    });
    this.input.addEventListener("keydown", (e) => this.onInputKey(e));
    this.onGlobalKey = this.onGlobalKey.bind(this);
  }

  connectedCallback() {
    document.addEventListener("keydown", this.onGlobalKey);
    this.offChange = this.registry.onChange(() => this.updateCount());
    this.updateCount();
    if (!this.out.childElementCount && this.hasAttribute("greeting")) this.print(this.getAttribute("greeting"), "dim");
  }

  disconnectedCallback() {
    document.removeEventListener("keydown", this.onGlobalKey);
    if (this.offChange) this.offChange();
  }

  get formatOptions() {
    return { locale: this.getAttribute("locale") || undefined, formats: this.registry.formats };
  }

  updateCount() { this.countEl.textContent = this.registry.list().length; }

  open() {
    this.setAttribute("open", "");
    requestAnimationFrame(() => this.input.focus());
    this.dispatchEvent(new CustomEvent("sutram-open"));
  }

  close() {
    this.removeAttribute("open");
    this.dispatchEvent(new CustomEvent("sutram-close"));
  }

  toggle() { this.hasAttribute("open") ? this.close() : this.open(); }

  /** The hotkey: backtick outside text fields, or Ctrl+Shift+K anywhere. Escape closes. */
  onGlobalKey(e) {
    const path = e.composedPath ? e.composedPath() : [];
    const inside = path.includes(this);
    if (e.key === "Escape" && this.hasAttribute("open")) { e.preventDefault(); this.close(); return; }
    if (e.ctrlKey && e.shiftKey && (e.key === "K" || e.key === "k")) { e.preventDefault(); this.toggle(); return; }
    if (e.key === "`" && !e.ctrlKey && !e.metaKey && !e.altKey && !inside && !isEditable(document.activeElement)) {
      e.preventDefault();
      this.toggle();
    }
  }

  onInputKey(e) {
    if (e.key === "ArrowUp" && this.historyIndex > 0) {
      this.historyIndex--;
      this.input.value = this.history[this.historyIndex];
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      this.historyIndex = Math.min(this.history.length, this.historyIndex + 1);
      this.input.value = this.history[this.historyIndex] || "";
      e.preventDefault();
    } else if (e.key === "`" && !this.input.value) {
      e.preventDefault();
      this.close();
    }
  }

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

  ask(message) {
    return new Promise((resolve) => {
      const el = this.print(message + " ", "ask");
      const done = (yes) => {
        this.pendingAsk = null;
        el.querySelectorAll("button").forEach((b) => b.remove());
        el.append(yes ? "yes" : "no");
        resolve(yes);
        this.input.focus();
      };
      for (const [label, yes] of [["Yes", true], ["No", false]]) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        if (yes) b.className = "yes";
        b.addEventListener("click", () => done(yes));
        el.append(b);
      }
      this.pendingAsk = done;
    });
  }

  /** Runs one line, as if it was typed. */
  async submit(line) {
    line = String(line).trim();
    if (!line) return;
    if (this.pendingAsk) {
      this.print(line, "input");
      this.pendingAsk(/^y(es)?$/i.test(line));
      return;
    }
    this.history.push(line);
    this.historyIndex = this.history.length;
    this.print(line, "input");

    let words;
    try { words = tokenize(line).map((t) => t.value); } catch (err) { this.printBlocks([{ kind: "error", text: err.message, code: err.code }]); return; }
    const [first, ...rest] = words;

    if (first === "help") { this.printBlocks(formatHelp(this.registry, rest.join(" ").toLowerCase())); return; }
    if (first === "man") {
      const name = rest.join(" ").toLowerCase();
      if (!name) { this.print("What manual page do you want?\nFor example, try: man help", "text"); return; }
      const def = this.registry.get(name);
      if (!def && !["help", "man", "status", "clear"].includes(name)) {
        this.printBlocks([{ kind: "error", text: `No manual entry for ${name}. See help.`, code: EXIT.FAILED }]);
        return;
      }
      this.printBlocks(formatMan(def, name, this.registry.formats));
      return;
    }
    if (first === "clear" && !rest.length) { this.out.replaceChildren(); return; }
    if (first === "status" && (!rest.length || (rest.length === 1 && rest[0] === "--json"))) {
      const results = await runStatus(this.registry, { caller: "console" });
      if (rest.length) { this.print(JSON.stringify(results.map(({ provider, data }) => ({ provider, data })), null, 2), "json"); return; }
      if (!results.length) { this.print("No provider on this page reports a status.", "dim"); return; }
      const w = Math.max(...results.map((r) => r.provider.length));
      this.print(results.map((r) => `${r.provider.padEnd(w)}  ${(r.code ? r.message : r.text || "").split("\n")[0]}`).join("\n"), "text");
      return;
    }

    try {
      const { def, input, help, json, wide, fields } = parse(this.registry, line);
      if (help) { this.printBlocks(formatUsage(def)); return; }
      const fieldError = fields && checkFields(def, fields);
      if (fieldError) { this.printBlocks([{ kind: "error", text: fieldError, code: EXIT.USAGE }]); return; }
      if (def.annotations.consequential) {
        const message = typeof def.confirm === "function" ? def.confirm(input) : `Run ${def.name}?`;
        if (!(await this.ask(message))) { this.print("Cancelled. Nothing changed.", "dim"); return; }
      }
      const result = await this.registry.run(def.name, input, { caller: "console" });
      this.printBlocks(formatResult(result, def, { ...this.formatOptions, json, wide, fields }), def.annotations.readOnly ? "text" : "ok");
    } catch (err) {
      const code = err instanceof CommandError ? err.code : EXIT.FAILED;
      this.printBlocks([{ kind: "error", text: err.message, code }]);
    }
  }
}

/** Defines <sutram-console> once, however many copies are loaded. */
export function defineConsole(tag = "sutram-console") {
  if (typeof customElements !== "undefined" && !customElements.get(tag)) customElements.define(tag, SutramConsole);
}

/** Adds a console to the page if there is none yet, and returns it. */
export function mountConsole(attributes = {}) {
  defineConsole();
  let el = document.querySelector("sutram-console");
  if (!el) {
    el = document.createElement("sutram-console");
    for (const [k, v] of Object.entries(attributes)) if (v !== undefined && v !== null) el.setAttribute(k, v);
    document.body.append(el);
  }
  return el;
}
