import type { Registry } from "./index.js";
import type { Events } from "./events.js";

/** A message the page showed, such as "Saved." */
export interface Message {
  type: "status" | "warning" | "error";
  text: string;
}

/** What the app supplies to the messages kit. */
export interface MessagesAdapter {
  /** The messages the page has shown since it loaded, oldest first. Called each time the command runs, at the start, and after changed(). */
  messages(): Message[] | Promise<Message[]>;
  /** Calls changed() when new messages may have come without a new page, such as after an AJAX request. May return a function that stops watching. */
  watch?(changed: () => void): void | (() => void);
}

/** Registers the messages command and emits message.shown for each message. Returns a function that removes the command and stops watching. */
export declare function messages(adapter: MessagesAdapter, options?: { registry?: Registry; events?: Events }): () => void;
