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
  prompt: string;
  promptTitle: string;
  close: string;
  closeLabel: string;
  yes: string;
  no: string;
  always: string;
  answered: (answer: Answer) => string;
  /** The question before a command without its own; gets its title when it has one. */
  run: (name: string, title?: string) => string;
  cancelled: string;
  /** Shown after a question whose call was cancelled before anyone answered. */
  withdrawn: string;
  answerHint: (always: boolean) => string;
  manWhich: string;
  manMissing: (name: string) => string;
  noStatus: string;
  pasted: (n: number) => string;
  batchConsequential: (n: number, names: string[]) => string;
  batchChanges: (n: number) => string;
  batchCancelled: string;
  batchMistake: (line: number, n: number) => string;
  batchNotLast: (name: string) => string;
  batchStopped: (line: number, n: number) => string;
  batchUndone: (line: number, n: number) => string;
  batchKept: (providers: string[]) => string;
  agentAsks: string;
  agentAsksBatch: (n: number) => string;
  agentBatch: (n: number) => string;
}

export declare const MESSAGES: Readonly<Messages>;

/** The key left of 1, by position, outside text fields; Ctrl with it anywhere. */
export declare const DEFAULT_HOTKEY: "backquote ctrl+backquote";

export interface HotkeyBinding { binding: string; key: string; ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }

/**
 * Reads space-separated bindings: modifiers (ctrl, alt, shift, meta, mod) and a
 * key. Letters and digits are the typed character; other keys are named like
 * KeyboardEvent.code in lowercase (backquote, slash, f2). "none" is no binding.
 */
export declare function parseHotkey(spec?: string): HotkeyBinding[];
/** The binding a key event matches, or null. Bindings without ctrl, alt or meta never fire in a text field. */
export declare function matchHotkey(
  e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">,
  bindings: HotkeyBinding[],
  options?: { inField?: boolean },
): HotkeyBinding | null;

export declare class SutramConsole extends HTMLElement {
  registry: Registry;
  /** Assign some of MESSAGES' keys to translate them. */
  get messages(): Messages;
  set messages(value: Partial<Messages>);
  readonly inline: boolean;
  /** The bindings of the hotkey attribute, or of DEFAULT_HOTKEY. */
  readonly hotkeys: HotkeyBinding[];
  /** The key held to peek, from the peek attribute; null when the console does not peek. */
  readonly peekKey: "Alt" | "Control" | "Shift" | "Meta" | null;
  /** True while the console is faded by peek (the peeking attribute). */
  readonly peeking: boolean;
  /** Lines run, newest last: this page's, after the history store's. */
  history: string[];
  /** Where history is kept between pages. Null (the default): only on this page. */
  historyStore: HistoryStore | null;
  open(): void;
  close(): void;
  toggle(): void;
  /** Replaces what is in the input field, for example to suggest a command. */
  setInput(value: string): void;
  /** Runs one line as if it was typed. */
  submit(line: string, options?: { confirmed?: boolean }): Promise<ExitCode>;
  /** Runs several lines as one batch, as a paste does. */
  runBatch(text: string): Promise<ExitCode>;
  print(text: string, kind?: string): HTMLElement;
  /** Waits its turn when another question is open; `lead` prints what it is about when it shows. */
  ask(message: string, options?: { always?: boolean; lead?: (() => void) | null; signal?: AbortSignal }): Promise<Answer>;
  askForAgent(request: AskRequest): Promise<Answer>;
  /** The output as plain text. */
  transcript(): string;
}

/**
 * Keeps console history between pages. Sutram stores nothing itself; the app
 * decides where the lines go and for how long.
 */
export interface HistoryStore {
  /** The lines kept so far, oldest first. */
  load(): string[] | Promise<string[]>;
  /** Called with all lines, oldest first, after every line run. */
  save(lines: string[]): void | Promise<void>;
}

export declare function defineConsole(tag?: string): void;

export interface MountAttributes {
  greeting?: string;
  locale?: string;
  /** Space-separated bindings such as "mod+k ctrl+backquote", or "none". Default: DEFAULT_HOTKEY. */
  hotkey?: string;
  /** Hold this key alone to fade the console and see the page: "alt", "ctrl", "shift" or "meta"; true means "alt". Off by default. */
  peek?: boolean | "alt" | "ctrl" | "shift" | "meta";
  messages?: Partial<Messages>;
  /** Keeps history between pages. Without it, history lasts as long as the page. */
  historyStore?: HistoryStore;
  [attribute: string]: unknown;
}

/** Without a container: the page's drop-down console. With one: a new inline console inside it. */
export declare function mountConsole(attributes?: MountAttributes, container?: Element | null): SutramConsole;
