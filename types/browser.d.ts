import type * as core from "./index.js";
import type * as client from "./client.js";
import type { Events } from "./events.js";
import type { mountConsole } from "./console.js";
import type { Tool, callTool } from "./webmcp.js";

export type SutramGlobal = {
  EXIT: typeof core.EXIT;
  CommandError: typeof core.CommandError;
  registry: core.Registry;
  events: Events;
  formats: core.Formats;
  defineFormat(name: string, def: core.FormatDefinition): () => void;
  register: core.Registry["register"];
  tools(): Tool[];
  call(name: string, input?: Record<string, unknown>, options?: { confirmed?: boolean; caller?: core.Caller; signal?: AbortSignal }): ReturnType<typeof callTool>;
  /** core.agentPrompt for this page: page defaults to document.title and location.href. */
  agentPrompt(task?: string, page?: { title?: string; url?: string }): string;
  mountConsole: typeof mountConsole;
  connectWebMCP(): () => void;
  /** @d34dman/sutram/client, for pages that build a client of their own. */
  client: typeof client;
};

declare global {
  // eslint-disable-next-line no-var
  var Sutram: SutramGlobal;
}

declare const Sutram: SutramGlobal;
export default Sutram;
