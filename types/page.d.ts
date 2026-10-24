import type { Registry } from "./index.js";

/** What a page shows, such as an article. */
export interface PageEntity {
  type: string;
  id: string | number;
  bundle?: string;
  label?: string;
}

/** What the page kit's adapter says about the page. */
export interface PageInfo {
  title: string;
  route?: string;
  entity?: PageEntity;
}

/** What the app supplies to the page kit. */
export interface PageAdapter {
  /** The page. Called each time page status runs, so it should be cheap. */
  page(): PageInfo | Promise<PageInfo>;
  /** The current path, such as /node/5?page=2. Defaults to location.pathname + location.search. */
  here?(): string;
}

/** Registers page status. Returns a function that removes it. */
export declare function page(adapter: PageAdapter, options?: { registry?: Registry }): () => void;
