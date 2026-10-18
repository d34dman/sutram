import type { CommandDefinition, Formats, Registry, Result, BatchResult, Caller, Schema } from "./index.js";

export interface Tool {
  name: string;
  description: string;
  inputSchema: Schema;
  annotations: { readOnlyHint?: boolean; consequentialHint?: boolean; untrustedContentHint?: boolean };
}

export interface ModelContextLike {
  registerTool(tool: Tool & { execute: (input: any, options?: { signal?: AbortSignal }) => Promise<unknown> }, options: { signal: AbortSignal }): unknown;
}

export declare const STATUS_TOOL: Tool;
export declare const BATCH_TOOL: Tool;
/** Added to an agent's result when the run started Sutram again: wait for ready, then look again. */
export declare const REINITIALIZED_NOTE: string;
export declare function findModelContext(): ModelContextLike | null;
export declare function toolName(def: CommandDefinition): string;
export declare function toTool(def: CommandDefinition, formats?: Formats): Tool;
export declare function listTools(registry?: Registry): Tool[];
/** Converts strings to the declared types, like console text; WebMCP calls do not. Follows the page's policy. */
export declare function callTool(
  name: string,
  input?: Record<string, unknown>,
  options?: { registry?: Registry; confirmed?: boolean; caller?: Caller; signal?: AbortSignal },
): Promise<Result | BatchResult | { code: 0; data: { providers: Array<{ provider: string } & Result> } }>;
export declare function connectWebMCP(registry?: Registry, modelContext?: ModelContextLike | null): () => void;
