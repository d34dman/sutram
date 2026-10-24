// Type declarations for @d34dman/sutram. The package is plain JavaScript;
// these describe its public API for TypeScript users and editors.

export type SchemaType = "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";

/** The subset of JSON Schema that command input and output use. */
export interface Schema {
  type?: SchemaType | [SchemaType, "null"] | ["null", SchemaType];
  title?: string;
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: unknown[];
  examples?: unknown[];
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  const?: unknown;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  $ref?: string;
  $defs?: Record<string, Schema>;
  [key: string]: unknown;
}

export declare const EXIT: Readonly<{ OK: 0; FAILED: 1; USAGE: 2; NOT_FOUND: 127; CANCELLED: 130 }>;
/** 0 done, 1 failed, 2 usage error, 127 not found, 130 cancelled, or a CommandError's own code. */
export type ExitCode = 0 | 1 | 2 | 127 | 130 | (number & {});

/** Thrown from run(), sets the result's code. 0 counts as 1: a thrown error is never success. */
export declare class CommandError extends Error {
  constructor(message: string, code?: ExitCode);
  code: ExitCode;
}

/** A contract with every client. register() refuses keys not in ANNOTATIONS. */
export interface Annotations {
  readOnly?: boolean;
  consequential?: boolean;
  /** Leaves the page. Implies reinitializes. */
  navigates?: boolean;
  /** May start Sutram again: run calls context.reinitializes() when it does. */
  reinitializes?: boolean;
  untrustedContent?: boolean;
}

/** The annotation keys register() accepts. */
export declare const ANNOTATIONS: readonly ["readOnly", "consequential", "navigates", "reinitializes", "untrustedContent"];

/** Who ran a command: "console", "agent", "code", "status", or a client's own name. */
export type Caller = "console" | "agent" | "code" | "status" | (string & {});

export interface RunContext {
  caller: Caller;
  signal?: AbortSignal;
  /**
   * Says Sutram starts again now, as the command is about to leave the page or
   * swap the page's commands. Throws unless the command declares reinitializes
   * or navigates.
   */
  reinitializes(): void;
}

export interface CommandOutput<D = unknown> {
  text?: string;
  data?: D;
}

/** A completion a command offers for one of its arguments. */
export type Suggestion = string | { value: string; label?: string; description?: string };

export interface CommandDefinition<I extends Record<string, any> = Record<string, any>, D = unknown> {
  /** Lowercase words separated by single spaces: "cart add". */
  name: string;
  /** Who owns it; help groups by this. */
  provider: string;
  /** A short name for people, such as "Save a form": tool title in WebMCP, and the question before a consequential run. */
  title?: string;
  description: string;
  /** JSON Schema for the input. Name parameters with one lowercase word, or words joined by _ (per_page). Leave it out for a command with no arguments. */
  input?: Schema;
  output?: Schema;
  /** Input keys that can be given without --, in order. The last takes the rest of the line. */
  positional?: string[];
  annotations: Annotations;
  /** The question asked before the command runs, when the page's policy asks. Gets the checked input, as run() does. It is asked again just before the run, and a different answer means the page changed meanwhile, so nothing runs: keep it free of things that change on their own, such as the time. */
  confirm?: (input: I) => string;
  /** Values for an argument, for completion. May be async. */
  suggest?: (key: string, partial: string, context: { input: Partial<I>; signal?: AbortSignal }) => Suggestion[] | Promise<Suggestion[]>;
  view?: { columns?: string[] };
  examples?: string[];
  seeAlso?: string[];
  /** Returns { text?, data? }, a string (the text), or nothing. */
  run: (input: I, context: RunContext) => CommandOutput<D> | string | void | Promise<CommandOutput<D> | string | void>;
}

/**
 * A run's result. Each side names the other's fields as never, so `r.text`
 * and `r.message` type-check on any Result, and `"message" in r` narrows.
 */
export type Result<D = unknown> =
  | { code: 0; text?: string; data?: D; message?: never }
  | { code: Exclude<ExitCode, 0>; message: string; text?: never; data?: never };

export interface BatchHooks {
  begin?: () => unknown;
  commit?: () => unknown;
  rollback?: () => unknown;
}

export interface BatchEnd {
  /** Providers whose changes were undone. */
  rolledBack: string[];
  /** Providers whose changes stay because they have no batch hooks. */
  kept: string[];
}

/**
 * `expect`: the definition the caller checked or asked about. When the name maps to another by the time it runs, nothing runs (130).
 * `asked`: the question the user said yes to, from the command's confirm() (null when it has none). When it would ask something else by the time it runs, because the page changed meanwhile, nothing runs (130).
 */
export interface RunOptions {
  caller?: Caller;
  signal?: AbortSignal;
  expect?: CommandDefinition;
  asked?: string | null;
}

/** A started batch. Always finish it with commit() or rollback(): the next batch waits until you do. */
export interface Batch {
  run(name: string, input?: Record<string, unknown>, options?: { expect?: CommandDefinition; asked?: string | null }): Promise<Result>;
  commit(): Promise<BatchEnd>;
  rollback(): Promise<BatchEnd>;
}

export interface BatchResult {
  code: ExitCode;
  message?: string;
  results: Result[];
  completed: number;
  total: number;
  rolledBack?: string[];
  kept?: string[];
  /** For an agent: the batch started Sutram again (see REINITIALIZED_NOTE). */
  note?: string;
}

export type ChangeEvent = { type: "register" | "unregister"; name: string; def: CommandDefinition };
export type RunEvent = { name: string; input: Record<string, unknown>; caller: Caller };
export type ResultEvent = RunEvent & { result: Result };

export interface Registry {
  readonly formats: Formats;
  readonly policy: Policy;
  register<I extends Record<string, any>, D>(def: CommandDefinition<I, D>): () => void;
  get(name: string): CommandDefinition | undefined;
  has(name: string): boolean;
  list(): CommandDefinition[];
  onChange(fn: (event: ChangeEvent) => void): () => void;
  onRun(fn: (event: RunEvent) => void): () => void;
  onResult(fn: (event: ResultEvent) => void): () => void;
  /** Resolves once the page's commands are registered; a new promise after every reinitialize(). */
  readonly ready: Promise<void>;
  /** How many times Sutram started again on this page. */
  readonly generation: number;
  /**
   * Sutram starts again: clears events, refuses runs, and makes ready wait for initialized().
   * navigates: true says the page is being left; if it is not left after all, the browser
   * entry point calls initialized() again. A command's reinitializes() passes its navigates annotation.
   */
  reinitialize(options?: { navigates?: boolean }): void;
  /** The page's commands are registered: resolves ready and allows runs again. */
  initialized(): void;
  /** Called on every reinitialize(). navigates is true when the page is being left. */
  onReinitialize(fn: (event: { generation: number; navigates: boolean }) => void): () => void;
  /** A console or agent run of a provider a batch is changing waits until the batch is done. */
  run(name: string, input?: Record<string, unknown>, options?: RunOptions): Promise<Result>;
  defineBatch(provider: string, hooks: BatchHooks): () => void;
  startBatch(options?: { caller?: Caller; signal?: AbortSignal }): Batch;
  /** One batch runs at a time; the next waits. A step with `def` runs only while its name still maps to that definition. */
  batch(steps: Array<{ name: string; input?: Record<string, unknown>; def?: CommandDefinition; asked?: string | null }>, options?: { caller?: Caller; signal?: AbortSignal }): Promise<BatchResult>;
}

export declare function createRegistry(options?: { checkResults?: boolean; formats?: Formats; policy?: Policy }): Registry;
export declare function getRegistry(): Registry;

// ---- parse ----------------------------------------------------------------

export interface Token { value: string; quoted: boolean }
export interface Parsed {
  def: CommandDefinition;
  input: Record<string, string | boolean>;
  help: boolean;
  json: boolean;
  wide: boolean;
  fields: string[] | null;
}
export type SpanKind = "space" | "command" | "client" | "unknown" | "option" | "bad-option" | "value" | "string" | "arg";
export interface Completion { value: string; label: string; description: string }

// ---- policy ---------------------------------------------------------------

export type Level = "none" | "consequential" | "changes";
export type Who = "person" | "agent";
/** `signal` aborts when the call is withdrawn: the question can go, and its answer no longer counts. */
export interface AskRequest { who: Who; caller: Caller; steps: Array<{ def: CommandDefinition; input: Record<string, unknown> }>; signal?: AbortSignal }
/** The user's answer: true for yes. A yes covers the one call it was asked about. */
export type Answer = boolean;

export interface Policy {
  get(): { person: Level; agent: Level };
  set(levels: Partial<{ person: Level; agent: Level }>): void;
  needs(def: CommandDefinition, who: Who | null | undefined): boolean;
  setAsker(fn: (request: AskRequest) => Answer | Promise<Answer>): () => void;
  hasAsker(): boolean;
  ask(request: AskRequest): Promise<boolean>;
}

export declare const LEVELS: readonly Level[];
export declare function createPolicy(levels?: Partial<{ person: Level; agent: Level }>): Policy;

// ---- formats --------------------------------------------------------------

export interface FormatDefinition {
  type?: string;
  description?: string;
  validate?: (value: unknown) => boolean;
  display?: (value: any, options: { locale?: string }) => string;
  align?: "left" | "right";
}

export interface Formats {
  define(name: string, def: FormatDefinition): () => void;
  get(name: string): FormatDefinition | undefined;
  has(name: string): boolean;
  list(): Array<{ name: string } & FormatDefinition>;
  valid(name: string, value: unknown): boolean;
}

export declare const STANDARD_FORMATS: readonly string[];
export declare function createFormats(options?: { standard?: boolean }): Formats;
export declare function getFormats(): Formats;

// ---- format: how results read as text ---------------------------------------

export interface Block { kind: string; text: string; head?: string; code?: ExitCode; commands?: CommandDefinition[] }
export interface FormatOptions { locale?: string; formats?: Formats; json?: boolean; wide?: boolean; fields?: string[] | null }

/** Input as the command line a person would type. The line parses back to the same input. */
export declare function commandLine(def: CommandDefinition, input?: Record<string, unknown>): string;

/**
 * The default prompt that hands a task to an agent that drives a browser.
 * It sends the agent to the page's WebMCP tools, Sutram.exec() or the
 * console, in that order. `commands` is the page's help text; without it,
 * the agent starts with help.
 */
export declare function agentPrompt(task?: string, page?: { title?: string; url?: string; commands?: string }): string;

/** What a site's prompt function gets: the page, and the default prompt to wrap or replace. */
export interface AgentPromptPage { title?: string; url?: string; commands: string; prompt: string }

/**
 * Ships a site's own agent prompt: the console's prompt button and
 * Sutram.agentPrompt() use it. Returns a function that brings back the
 * default. A function that throws or returns no text falls back to it.
 */
export declare function defineAgentPrompt(make: (task: string, page: AgentPromptPage) => string, options?: { registry?: Registry }): () => void;
