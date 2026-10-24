import type * as core from "./index.js";
import type * as client from "./client.js";
import type { Events } from "./events.js";
import type { mountConsole } from "./console.js";
import type { Tool, callTool, execLines } from "./webmcp.js";
import type { nav } from "./nav.js";
import type { page } from "./page.js";
import type { user } from "./user.js";
import type { messages } from "./messages.js";
import type { lists } from "./lists.js";
import type { forms } from "./forms.js";

export type SutramGlobal = {
  EXIT: typeof core.EXIT;
  CommandError: typeof core.CommandError;
  registry: core.Registry;
  events: Events;
  /** Resolves once the page's scripts have run and their commands are registered. Wait for it before the first call on every page, and after a run that started Sutram again. */
  readonly ready: Promise<void>;
  /** For a single-page app: its new commands are registered after Sutram started again. */
  initialized(): void;
  formats: core.Formats;
  defineFormat(name: string, def: core.FormatDefinition): () => void;
  register: core.Registry["register"];
  tools(): Tool[];
  call(name: string, input?: Record<string, unknown>, options?: { confirmed?: boolean; caller?: core.Caller; signal?: AbortSignal }): ReturnType<typeof callTool>;
  /** Command lines as pasted into the console: several as one batch. Answers with the console's text. */
  exec(text: string, options?: { confirmed?: boolean; caller?: core.Caller; signal?: AbortSignal }): ReturnType<typeof execLines>;
  /** The agent prompt for this page, with its commands: the site's own (defineAgentPrompt) or the default. page defaults to document.title and location.href. */
  agentPrompt(task?: string, page?: { title?: string; url?: string }): string;
  /** core.defineAgentPrompt for this page's registry. */
  defineAgentPrompt(make: (task: string, page: core.AgentPromptPage) => string): () => void;
  mountConsole: typeof mountConsole;
  connectWebMCP(): () => void;
  /** @d34dman/sutram/client, for pages that build a client of their own. */
  client: typeof client;
  /** Kits loaded as their own files: dist/nav.js adds nav, dist/page.js page, and so on. */
  kits: { nav?: typeof nav; page?: typeof page; user?: typeof user; messages?: typeof messages; lists?: typeof lists; forms?: typeof forms };
};

declare global {
  // eslint-disable-next-line no-var
  var Sutram: SutramGlobal;
}

declare const Sutram: SutramGlobal;
export default Sutram;
