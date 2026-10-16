import type { Registry, Answer, AskRequest, ExitCode } from "./index.js";

/** The console's own texts. Functions take the values they mention. */
export interface Messages {
  title: string;
  count: (n: number) => string;
  label: string;
  placeholder: string;
  inputLabel: string;
  copy: string;
  copyTitle: string;
  copied: string;
  copyFailed: string;
  close: string;
  closeLabel: string;
  yes: string;
  no: string;
  always: string;
  answered: (answer: Answer) => string;
  run: (name: string) => string;
  cancelled: string;
  manWhich: string;
  manMissing: (name: string) => string;
  noStatus: string;
  pasted: (n: number) => string;
  batchConsequential: (n: number, names: string[]) => string;
  batchChanges: (n: number) => string;
  batchCancelled: string;
  batchMistake: (line: number, n: number) => string;
  batchStopped: (line: number, n: number) => string;
  batchUndone: (line: number, n: number) => string;
  batchKept: (providers: string[]) => string;
  agentAsks: string;
  agentAsksBatch: (n: number) => string;
  agentBatch: (n: number) => string;
}

export declare const MESSAGES: Readonly<Messages>;

export declare class SutramConsole extends HTMLElement {
  registry: Registry;
  /** Assign some of MESSAGES' keys to translate them. */
  get messages(): Messages;
  set messages(value: Partial<Messages>);
  readonly inline: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  /** Runs one line as if it was typed. */
  submit(line: string, options?: { confirmed?: boolean }): Promise<ExitCode>;
  /** Runs several lines as one batch, as a paste does. */
  runBatch(text: string): Promise<ExitCode>;
  print(text: string, kind?: string): HTMLElement;
  ask(message: string, options?: { always?: boolean }): Promise<Answer>;
  askForAgent(request: AskRequest): Promise<Answer>;
  /** The output as plain text. */
  transcript(): string;
}

export declare function defineConsole(tag?: string): void;

export interface MountAttributes {
  greeting?: string;
  locale?: string;
  messages?: Partial<Messages>;
  [attribute: string]: unknown;
}

/** Without a container: the page's drop-down console. With one: a new inline console inside it. */
export declare function mountConsole(attributes?: MountAttributes, container?: Element | null): SutramConsole;
