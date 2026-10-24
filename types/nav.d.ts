import type { Registry } from "./index.js";

/** A link in a menu. */
export interface NavItem {
  title: string;
  /** A path on this site, such as /admin/content, or a full URL. */
  url: string;
  id?: string;
  description?: string;
  children?: NavItem[];
}

/** The menus an adapter supplies, keyed by machine name. */
export type NavMenus = Record<string, { label?: string; items: NavItem[] }>;

/** What the app supplies to the nav kit. */
export interface NavAdapter {
  /** The menus. Called each time a command runs, so it should be cheap. */
  menus(): NavMenus | Promise<NavMenus>;
  /** Goes to a url. Called after nav go has delivered its result. Answer false (or reject) when the page did not leave, such as when a router handled it in place: Sutram resumes on this page at once. */
  go(url: string): void | false | Promise<void | false>;
  /** true if going loads a new page (nav go is marked navigates); false for a client-side router (reinitializes). */
  reloads: boolean;
  /** The current path, such as /admin?tab=2. Defaults to location.pathname + location.search. */
  here?(): string;
}

/** Registers nav status, nav menu, nav search and nav go. Returns a function that removes them. */
export declare function nav(adapter: NavAdapter, options?: { registry?: Registry }): () => void;
