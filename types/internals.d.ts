// Declarations for @d34dman/sutram/internals: helpers Sutram uses itself.
// No semver promise.

import type {
  Annotations, Answer, AskRequest, Batch, BatchEnd, BatchHooks, BatchResult, Block, Caller, ChangeEvent, CommandDefinition, CommandOutput, Completion, ExitCode, FormatDefinition, FormatOptions, Formats, Level, Parsed, Policy, Registry, Result, ResultEvent, RunContext, RunEvent, Schema, SchemaType, SpanKind, Suggestion, Token, Who,
} from "./index.js";

export declare function deref(schema: Schema, root: Schema): Schema | undefined;

export declare function distance(a: string, b: string): number;

export declare function formatValue(value: unknown, prop?: Schema, options?: FormatOptions): string;

export declare function formatTable(rows: Record<string, unknown>[], itemSchema: Schema, root?: Schema, options?: FormatOptions & { columns?: string[]; maxWidth?: number }): { head: string; rows: string[] };

export declare function synopsis(def: CommandDefinition): string;

export declare function longSynopsis(def: CommandDefinition): string | null;

export declare function annotationLabel(annotations?: Annotations): "read-only" | "consequential" | "navigates" | null;

export declare function describeShape(schema: Schema, root?: Schema, depth?: number): string;

export declare function sentence(s: string): string;

export declare function formatsUsed(def: CommandDefinition, formats?: Formats): Array<{ name: string } & FormatDefinition>;
