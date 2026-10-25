// <sutram-approval>: where the person approves what an agent wants to run.
// The page's policy asks through it (policy.setAsker), so an agent's tool
// call is asked about in a dialog of its own: the console only shows what
// runs, and may stay closed or be left out.
//
// A modal <dialog> in its own shadow root. No has the focus, and Escape
// answers no, so a stray Enter or a closed dialog never approves anything.
// Yes waits a moment after each question appears, so a double-click on the
// last one cannot approve the next one, unread.

import { getRegistry } from "./core.js";
import { approvalLine } from "./format.js";
import { batchQuestions, genericQuestion, ownQuestion } from "./policy.js";

/**
 * Every text the dialog shows of its own. Set `dialog.messages = { … }` to
 * translate some or all of them.
 */
export const APPROVAL_MESSAGES = Object.freeze({
  label: "Approve an agent's command",
  yes: "Yes",
  no: "No",
  run: (name, title) => genericQuestion({ name, title }),
  agentAsks: "An agent wants to run:",
  agentAsksBatch: (n) => `An agent wants to run ${n} commands as one change:`,
  agentBatch: (n) => `Run these ${n} commands?`,
  agentBatchConsequential: (n, names) => `Run these ${n} commands? ${names.join(", ")} cannot easily be undone.`,
  // A batch step's own question, under the batch's; before is true when earlier steps may change what it says.
  stepAsks: (name, question, before) => (before ? `${name}, about the page before the commands above run: ${question}` : `${name}: ${question}`),
});

const STYLE = `
:host {
  --sutram-bg: #11131c; --sutram-fg: #e6e8f0; --sutram-dim: #8c93a8; --sutram-accent: #9aa2ff;
  --sutram-warn: #f5a35c; --sutram-on-warn: #11131c; --sutram-line: #ffffff1a;
  --sutram-radius: 8px; --sutram-shadow: 0 8px 32px #0007;
  --sutram-font: ui-monospace, "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace;
}
dialog { background: var(--sutram-bg); color: var(--sutram-fg); font: var(--sutram-font-size, 13px)/1.55 var(--sutram-font);
  border: 1px solid var(--sutram-line); border-radius: var(--sutram-radius); box-shadow: var(--sutram-shadow);
  padding: 14px 16px; width: min(560px, calc(100vw - 32px)); }
dialog::backdrop { background: #0006; }
.lead { color: var(--sutram-dim); margin: 0 0 6px; }
.lines { margin: 0 0 10px; padding: 0; list-style: none; }
.lines li { white-space: pre-wrap; word-break: break-word; }
.lines li::before { content: "› "; color: var(--sutram-warn); }
.question { color: var(--sutram-warn); margin: 0 0 12px; white-space: pre-line; }
.buttons { display: flex; gap: 8px; justify-content: flex-end; }
button { font: inherit; border: 1px solid var(--sutram-warn); background: transparent; color: var(--sutram-warn); border-radius: 5px; padding: 2px 14px; cursor: pointer; }
button.yes { background: var(--sutram-warn); color: var(--sutram-on-warn); }
button:disabled { opacity: 0.5; cursor: default; }
button:focus-visible { outline: 2px solid var(--sutram-accent); outline-offset: 2px; }
`;

const Base = globalThis.HTMLElement || class {};

/** How long Yes stays disabled after a question appears, in milliseconds. */
const ARM_DELAY = 500;

/**
 * What the dialog says about an agent's request: the lead, one line per
 * command (shortened, so a long value cannot push the others away) and the
 * question.
 */
export function approvalText(steps, messages = APPROVAL_MESSAGES) {
  const m = { ...APPROVAL_MESSAGES, ...messages };
  // A batch names its consequential commands, as a pasted batch does.
  const consequential = [...new Set(steps.filter((s) => s.def.annotations.consequential).map((s) => s.def.name))];
  // A batch keeps each consequential command's own question: a read-only step in front must not hide it.
  const own = steps.length === 1 ? [] : batchQuestions(steps).map((q) => m.stepAsks(q.name, q.question, q.changedBefore));
  const question = steps.length === 1 ? (ownQuestion(steps[0].def, steps[0].input) || m.run(steps[0].def.name, steps[0].def.title))
    : [consequential.length ? m.agentBatchConsequential(steps.length, consequential) : m.agentBatch(steps.length), ...own].join("\n");
  return {
    lead: steps.length === 1 ? m.agentAsks : m.agentAsksBatch(steps.length),
    lines: steps.map(({ def, input }) => approvalLine(def, input)),
    question,
  };
}

export class SutramApproval extends Base {
  constructor() {
    super();
    this._messages = APPROVAL_MESSAGES;
    this.queue = [];
    this.current = null;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${STYLE}</style>
      <dialog part="dialog">
        <p class="lead" part="lead"></p>
        <ul class="lines" part="lines"></ul>
        <p class="question" part="question"></p>
        <div class="buttons"><button type="button" class="no" part="no"></button><button type="button" class="yes" part="yes"></button></div>
      </dialog>`;
    this.dialog = root.querySelector("dialog");
    root.querySelector(".yes").addEventListener("click", () => this.answer(true));
    root.querySelector(".no").addEventListener("click", () => this.answer(false));
    // Escape closes a modal dialog: that is a no.
    this.dialog.addEventListener("cancel", (e) => { e.preventDefault(); this.answer(false); });
    // The browser may also close it without a cancel event that can be
    // stopped: Chromium does after repeated Escapes, to let people out of a
    // run of dialogs, and closes it again if it is reopened. So that answers
    // no to the open question and to those waiting; the next one asked opens
    // the dialog again.
    this.dialog.addEventListener("close", () => {
      // The event comes a task later: the dialog may be open again by then, for a new question.
      if (!this.current || this.dialog.open) return;
      for (const item of this.queue.splice(0)) item.resolve(false);
      this.answer(false);
    });
    this.renderChrome();
  }

  /** The dialog's own texts. Assign an object with some of APPROVAL_MESSAGES' keys to translate them. */
  get messages() { return this._messages; }
  set messages(value) {
    this._messages = { ...APPROVAL_MESSAGES, ...(value || {}) };
    this.renderChrome();
  }

  renderChrome() {
    const m = this.messages;
    const root = this.shadowRoot;
    this.dialog.setAttribute("aria-label", m.label);
    root.querySelector(".yes").textContent = m.yes;
    root.querySelector(".no").textContent = m.no;
  }

  /**
   * The policy's asker: shows what an agent wants to run and asks. Resolves
   * to true or false. A question asked while another is open waits its
   * turn; an aborted call withdraws its question, which counts as no.
   */
  ask({ steps, signal }) {
    return new Promise((resolve) => {
      if (signal && signal.aborted) { resolve(false); return; }
      const item = { steps, resolve, signal };
      if (signal) {
        signal.addEventListener("abort", () => {
          if (this.current === item) this.answer(false);
          else { this.queue = this.queue.filter((x) => x !== item); resolve(false); }
        }, { once: true });
      }
      this.queue.push(item);
      if (!this.current) this.next();
    });
  }

  /** Shows the next question in the queue, if any. */
  next() {
    const item = this.queue.shift();
    this.current = item || null;
    if (!item) { if (this.dialog.open) this.dialog.close(); return; }
    const { lead, lines, question } = approvalText(item.steps, this.messages);
    const root = this.shadowRoot;
    root.querySelector(".lead").textContent = lead;
    root.querySelector(".lines").replaceChildren(...lines.map((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      return li;
    }));
    root.querySelector(".question").textContent = question;
    // A click meant for the last question must not land on this one.
    const yes = root.querySelector(".yes");
    yes.disabled = true;
    clearTimeout(this.armTimer);
    this.armTimer = setTimeout(() => { yes.disabled = false; }, ARM_DELAY);
    if (!this.dialog.open) {
      // Where the focus goes when the queue is empty: kept from the first question on.
      const active = document.activeElement;
      if (!this.returnFocus) this.returnFocus = active && active !== document.body && active !== this ? active : null;
      this.dialog.showModal();
    }
    root.querySelector(".no").focus();
    this.dispatchEvent(new CustomEvent("sutram-ask", { detail: { steps: item.steps, question }, bubbles: true, composed: true }));
  }

  /** Answers the open question, then shows the next one. */
  answer(yes) {
    const item = this.current;
    if (!item) return;
    this.current = null;
    item.resolve(yes === true);
    this.dispatchEvent(new CustomEvent("sutram-answer", { detail: { steps: item.steps, answer: yes === true }, bubbles: true, composed: true }));
    this.next();
    if (!this.current) {
      const back = this.returnFocus;
      this.returnFocus = null;
      if (back && back.isConnected && typeof back.focus === "function") back.focus();
    }
  }

  disconnectedCallback() {
    clearTimeout(this.armTimer);
    // Nobody can answer here any more: open and queued questions are answered no.
    for (const item of this.queue.splice(0)) item.resolve(false);
    if (this.current) { this.current.resolve(false); this.current = null; }
  }
}

/** Defines <sutram-approval> once, however many copies are loaded. */
export function defineApproval(tag = "sutram-approval") {
  if (typeof customElements !== "undefined" && !customElements.get(tag)) customElements.define(tag, SutramApproval);
}

/**
 * Makes the approval dialog the policy's asker, unless the page has an asker
 * already. The dialog is added to the page the first time it asks. Returns
 * a function that removes it as the asker again (or does nothing, when
 * another asker was there first).
 */
export function useApprovalDialog(registry = getRegistry()) {
  const policy = registry.policy;
  if (typeof document === "undefined" || policy.hasAsker()) return () => {};
  defineApproval();
  let el = null;
  return policy.setAsker((request) => {
    if (!el || !el.isConnected) {
      el = document.createElement("sutram-approval");
      document.body.append(el);
    }
    return el.ask(request);
  });
}
