// The registry as WebMCP tools.
// Checked against the WebMCP Draft Community Group Report of 13 October 2026:
// document.modelContext.registerTool(tool, { signal }) returns a promise,
// rejects a duplicate name, and removes the tool when the signal aborts.
// ToolAnnotations is a fixed set, and a tool has no output schema, so
// Sutram's own annotations and a summary of `output` go into the description.
// WebMCP decides which origins see the tools, not whether a call may change
// the user's page, so calls go through the page's policy (policy.js) first.

import { EXIT, checkInput, getRegistry, runStatus } from "./core.js";
import { commandLine, describeShape, formatsUsed, sentence } from "./format.js";
import { getFormats } from "./formats.js";
import { ownQuestion } from "./policy.js";

/** The page's model context, or null when the browser has none. */
export function findModelContext() {
  if (typeof document !== "undefined" && document.modelContext) return document.modelContext;
  // Older builds put it on navigator; Chromium is deprecating that.
  if (typeof navigator !== "undefined" && navigator.modelContext) return navigator.modelContext;
  return null;
}

export const toolName = (def) => def.name.replace(/\s+/g, "_");

/** A command as a WebMCP tool definition, without `execute`. */
export function toTool(def, formats = getFormats()) {
  const a = def.annotations || {};
  const annotations = {};
  if (a.readOnly) annotations.readOnlyHint = true;
  if (a.consequential) annotations.consequentialHint = true;
  if (a.untrustedContent) annotations.untrustedContentHint = true;
  let description = sentence(def.description);
  if (a.navigates) description += " Leaves this page; the tools on the next page may differ.";
  if (def.output) description += ` Returns ${describeShape(def.output)}.`;
  // An agent cannot look up a page's own formats, so the description explains them.
  for (const f of formatsUsed(def, formats)) description += ` ${f.name}: ${sentence(f.description)}`;
  return { name: toolName(def), description, inputSchema: def.input, annotations };
}

export const STATUS_TOOL = {
  name: "sutram_status",
  description: "Run every provider's status command and return what each reports about the page. Call this first.",
  inputSchema: { type: "object", properties: {} },
  annotations: { readOnlyHint: true },
};

export const BATCH_TOOL = {
  name: "sutram_batch",
  description: "Run several tools in order as one change. The user is asked at most once, the batch stops at the first call that fails, "
    + "and providers that support it undo the earlier calls. Use it for edits that belong together. Returns { code, results, completed, total }.",
  inputSchema: {
    type: "object",
    properties: {
      calls: {
        type: "array",
        description: "The calls, in order",
        items: {
          type: "object",
          properties: {
            tool: { type: "string", description: "A tool name from this page" },
            input: { type: "object", description: "The tool's arguments" },
          },
          required: ["tool"],
        },
      },
    },
    required: ["calls"],
  },
  annotations: {},
};

/** Every tool an agent sees on the page right now: sutram_status and sutram_batch first, then one per command. */
export function listTools(registry = getRegistry()) {
  return [STATUS_TOOL, BATCH_TOOL, ...registry.list().map((def) => toTool(def, registry.formats))];
}

const findTool = (registry, name) => registry.list().find((d) => toolName(d) === name);

/** The question for a call or a batch, in plain text. */
function question(steps) {
  if (steps.length === 1) return ownQuestion(steps[0].def, steps[0].input) || `Run ${steps[0].def.name}?`;
  return `Run these ${steps.length} commands?\n${steps.map((s) => commandLine(s.def, s.input)).join("\n")}`;
}

/**
 * Asks the user when the page's policy says an agent needs approval.
 * Resolves to null when the call may run, or to the result that refuses it.
 * Interactive callers (WebMCP) ask through the policy's asker, or the
 * browser's confirm() when there is none; Sutram.call() cannot ask, so it
 * tells its caller to ask and call again with { confirmed: true }.
 */
async function approve(registry, steps, { confirmed = false, interactive = false, caller = "agent" } = {}) {
  const policy = registry.policy;
  const needing = steps.filter((s) => policy.needs(s.def, "agent"));
  if (!needing.length || confirmed) return null;
  const label = steps.length === 1 ? toolName(steps[0].def) : BATCH_TOOL.name;
  if (interactive) {
    let yes;
    if (policy.hasAsker()) yes = await policy.ask({ who: "agent", caller, steps });
    else if (typeof globalThis.confirm === "function") yes = globalThis.confirm(`An agent on this page wants to act.\n\n${question(steps)}`);
    else return { code: EXIT.CANCELLED, message: `${label} needs the user's approval, and this page has no way to ask, so it did not run.` };
    return yes ? null : { code: EXIT.CANCELLED, message: `The user declined ${label}, so nothing ran.` };
  }
  const why = needing.some((s) => s.def.annotations.consequential)
    ? (steps.length === 1 ? "is consequential" : "contains consequential commands")
    : "needs the user's approval on this page";
  return { code: EXIT.CANCELLED, message: `${label} ${why}, so it did not run. Ask the user ("${question(steps)}"), then call it again with { confirmed: true }.` };
}

/** Runs one command for an agent: input errors first, then approval, then the command. */
async function runForAgent(registry, def, input, options) {
  if (!checkInput(def.input, input, registry.formats).errors.length) {
    const refusal = await approve(registry, [{ def, input }], options);
    if (refusal) return refusal;
  }
  return registry.run(def.name, input, { caller: options.caller, signal: options.signal });
}

/** Runs sutram_batch: every call is found and checked, then approved once, then run as one batch. */
async function runBatchTool(registry, input, options) {
  const calls = input && input.calls;
  if (!Array.isArray(calls) || !calls.length) return { code: EXIT.USAGE, message: "sutram_batch: calls must be a list of { tool, input }" };
  const steps = [];
  for (const [i, call] of calls.entries()) {
    const def = call && findTool(registry, call.tool);
    if (!def) return { code: EXIT.NOT_FOUND, message: `sutram_batch: call ${i + 1}: ${call && call.tool}: no such tool. Nothing ran.` };
    const args = (call.input && typeof call.input === "object") ? call.input : {};
    const { errors } = checkInput(def.input, args, registry.formats);
    if (errors.length) return { code: EXIT.USAGE, message: `sutram_batch: call ${i + 1}: ${def.name}: ${errors.join("; ")}. Nothing ran.` };
    steps.push({ def, input: args });
  }
  const refusal = await approve(registry, steps, options);
  if (refusal) return refusal;
  return registry.batch(steps.map((s) => ({ name: s.def.name, input: s.input })), { caller: options.caller, signal: options.signal });
}

/**
 * Calls a tool by its WebMCP name, the way an agent's host would. For code
 * that drives the page from outside without WebMCP: a headless browser, a
 * test, an agent that can run JavaScript in the page.
 *
 * This is a client, like the console, so it follows the page's policy: a
 * tool that needs the user's approval (by default, a consequential one) runs
 * only with `confirmed: true`, which says that the user has agreed. Without
 * it nothing runs and the result says so.
 */
export async function callTool(name, input = {}, { registry = getRegistry(), confirmed = false, caller = "agent", signal } = {}) {
  const options = { confirmed, caller, signal, interactive: false };
  if (name === STATUS_TOOL.name) return { code: EXIT.OK, providers: await runStatus(registry, { caller, signal }) };
  if (name === BATCH_TOOL.name) return runBatchTool(registry, input, options);
  const def = findTool(registry, name);
  if (!def) return { code: EXIT.NOT_FOUND, message: `${name}: no such tool. Call tools() for the list.` };
  return runForAgent(registry, def, input, options);
}

/**
 * Mirrors the registry into the model context, and keeps it in sync.
 * Returns a function that removes every tool again.
 */
export function connectWebMCP(registry = getRegistry(), modelContext = findModelContext()) {
  if (!modelContext || typeof modelContext.registerTool !== "function") return () => {};
  const live = new Map(); // command name → AbortController

  const add = (name, tool, execute) => {
    const ctrl = new AbortController();
    live.set(name, ctrl);
    Promise.resolve(modelContext.registerTool({ ...tool, execute }, { signal: ctrl.signal })).catch((err) => {
      console.warn(`sutram: WebMCP refused ${tool.name}: ${err && err.message}`);
      if (live.get(name) === ctrl) live.delete(name);
    });
  };
  const remove = (name) => {
    const ctrl = live.get(name);
    if (ctrl) { ctrl.abort(); live.delete(name); }
  };

  const options = (signal) => ({ caller: "agent", signal, interactive: true });
  add("\0status", STATUS_TOOL, async (_, { signal } = {}) => ({ code: 0, providers: await runStatus(registry, { caller: "agent", signal }) }));
  add("\0batch", BATCH_TOOL, (input, { signal } = {}) => runBatchTool(registry, input, options(signal)));
  // The definition is looked up at call time: it may have been replaced since.
  const addCommand = (def) => add(def.name, toTool(def, registry.formats), (input, { signal } = {}) => runForAgent(registry, registry.get(def.name) || def, input || {}, options(signal)));

  registry.list().forEach(addCommand);
  const off = registry.onChange(({ type, name, def }) => {
    remove(name);
    if (type === "register") addCommand(def);
  });

  return () => {
    off();
    [...live.keys()].forEach(remove);
  };
}
