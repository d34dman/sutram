// The registry as WebMCP tools.
// Checked against the WebMCP Draft Community Group Report of 13 October 2026:
// document.modelContext.registerTool(tool, { signal }) returns a promise,
// rejects a duplicate name, and removes the tool when the signal aborts.
// ToolAnnotations is a fixed set, and a tool has no output schema, so
// Sutram's own annotations and a summary of `output` go into the description.

import { getRegistry, runStatus } from "./core.js";
import { describeShape, formatsUsed, sentence } from "./format.js";
import { getFormats } from "./formats.js";

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

  add("\0status", STATUS_TOOL, async (_, { signal } = {}) => ({ code: 0, providers: await runStatus(registry, { caller: "agent", signal }) }));
  const addCommand = (def) => add(def.name, toTool(def, registry.formats), (input, { signal } = {}) => registry.run(def.name, input, { caller: "agent", signal }));

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
