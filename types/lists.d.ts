import type { Registry } from "./index.js";

/** A list on the page, as the lists kit's adapter describes it. */
export interface ListInfo {
  label?: string;
  /** The columns, in the list's order. */
  columns: Array<{ key: string; label?: string }>;
  /** The rows shown now: one value per column key, and url when the row links somewhere. */
  rows: Array<Record<string, unknown> & { url?: string }>;
  /** The page shown, from 1. */
  page?: number;
  pages?: number;
  total?: number;
  /** The column the list is sorted by now. */
  sort?: string;
  order?: "asc" | "desc";
  /** Columns the list can be sorted by. */
  sorts?: Array<string | { key: string; label?: string }>;
  /** Filters, with their value now ("" when not set) and, for a choice, the values they take. */
  filters?: Array<{ key: string; label?: string; value?: string | null; options?: Array<string | { value: string; label?: string }> }>;
}

/** What list go asks the adapter to show: complete, so the adapter only builds a URL or query. */
export interface ListState {
  page: number;
  sort?: string;
  order?: "asc" | "desc";
  filters: Record<string, string>;
}

/** What the app supplies to the lists kit. */
export interface ListsAdapter {
  /** The lists on this page, keyed by name. Called each time a command runs, so it should be cheap. */
  lists(): Record<string, ListInfo> | Promise<Record<string, ListInfo>>;
  /** Shows a list in a new state. Called after list go has delivered its result. */
  go(list: string, state: ListState): void;
  /** true if that loads a new page (list go is marked navigates); false if the app shows it in place (reinitializes). */
  reloads: boolean;
}

/** Registers list status, list rows and list go. Returns a function that removes them. */
export declare function lists(adapter: ListsAdapter, options?: { registry?: Registry }): () => void;
