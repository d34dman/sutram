// Declarations for @d34dman/sutram/client: what a client of the registry
// needs. Covered by semver.

import type {
  Block, Caller, CommandDefinition, Completion, FormatOptions, Formats, Parsed, Registry, Result, Schema, SpanKind, Token, Who,
} from "./index.js";

export declare const RESERVED_WORDS: readonly ["help", "man", "status", "clear"];

export declare const CLIENT_OPTIONS: readonly ["help", "json", "wide"];

/** With { strict: true }, strings are not converted to the declared types (for values from code, such as event payloads). */
export declare function checkInput(schema: Schema, input?: Record<string, unknown> | null, formats?: Formats, options?: { strict?: boolean }): { errors: string[]; value: Record<string, unknown> };

export declare function checkOutput(schema: Schema, data: unknown, root?: Schema, formats?: Formats): string | null;

export declare function isStatusCommand(def: CommandDefinition): boolean;

/** Runs every <provider> status command, or only those of `providers`. `run` runs each (registry.run by default); a batch passes its own run. */
export declare function runStatus(registry: Registry, options?: { caller?: Caller; signal?: AbortSignal; providers?: string[]; run?: (name: string, input: Record<string, unknown>, options?: { caller?: Caller; signal?: AbortSignal }) => Promise<Result> }): Promise<Array<{ provider: string } & Result>>;

export declare function tokenize(line: string): Token[];

export declare function parse(registry: Registry, line: string): Parsed;

export declare function suggest(registry: Registry, words: string[]): string | null;

export declare function highlight(registry: Registry, line: string): Array<{ text: string; kind: SpanKind }>;

export declare function complete(registry: Registry, line: string, options?: { signal?: AbortSignal; limit?: number }): Promise<{ start: number; end: number; items: Completion[] }>;

export declare function splitLines(text: string): string[];

/** What the text leaves open at its end: a quote, `<<TAG` for a heredoc, or null. */
export declare function openQuote(text: string): '"' | "'" | `<<${string}` | null;

export declare function whoIs(caller: Caller): Who | null;

export declare function ownQuestion(def: CommandDefinition, input: Record<string, unknown>): string | null;

export declare function formatResult(result: Result, def?: Partial<CommandDefinition>, options?: FormatOptions): Block[];

export declare function blocksToText(blocks: Block[]): string;

export declare function formatHelp(registry: Registry, prefix?: string): Block[];

export declare function formatUsage(def: CommandDefinition): Block[];

export declare function formatMan(def: CommandDefinition | undefined, name?: string, formats?: Formats): Block[];

export declare function checkFields(def: CommandDefinition, fields: string[]): string | null;

export declare function selectFields(data: unknown, fields: string[], schema?: Schema): { data?: unknown; error?: string };
