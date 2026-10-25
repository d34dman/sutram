import type { Registry, Answer, AskRequest } from "./index.js";

/** The approval dialog's own texts. Functions take the values they mention. */
export interface ApprovalMessages {
  label: string;
  yes: string;
  no: string;
  /** The question before a command without its own; gets its title when it has one. */
  run: (name: string, title?: string) => string;
  agentAsks: string;
  agentAsksBatch: (n: number) => string;
  agentBatch: (n: number) => string;
  agentBatchConsequential: (n: number, names: string[]) => string;
  /** A batch step's own question, under the batch's; before is true when earlier steps may change what it says. */
  stepAsks: (name: string, question: string, before: boolean) => string;
}

export declare const APPROVAL_MESSAGES: Readonly<ApprovalMessages>;

/** What the dialog says about a request: the lead, one shortened line per command, and the question. */
export declare function approvalText(steps: AskRequest["steps"], messages?: Partial<ApprovalMessages>): { lead: string; lines: string[]; question: string };

/**
 * <sutram-approval>: a modal dialog where the person approves what an agent
 * wants to run. No has the focus; Escape answers no. Fires sutram-ask and
 * sutram-answer (bubbling, composed) with the steps and the question or answer.
 */
export declare class SutramApproval extends HTMLElement {
  get messages(): ApprovalMessages;
  set messages(value: Partial<ApprovalMessages>);
  /** Asks; questions asked while one is open wait their turn. An aborted call's question is withdrawn: no. */
  ask(request: AskRequest): Promise<Answer>;
  /** Answers the open question. */
  answer(yes: boolean): void;
}

export declare function defineApproval(tag?: string): void;

/**
 * Makes the approval dialog the policy's asker unless the page has one; the
 * dialog is added to the page when it first asks. Returns a function that
 * removes it as the asker. The console and dist/sutram.js call it.
 */
export declare function useApprovalDialog(registry?: Registry): () => void;
