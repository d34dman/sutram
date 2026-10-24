import type { Registry } from "./index.js";

/** Who is logged in, as the user kit's adapter says. */
export interface UserInfo {
  authenticated: boolean;
  id?: string | number;
  name?: string;
  /** Role ids, or ids with a label to show. */
  roles?: Array<string | { id: string; label?: string }>;
}

/** What the app supplies to the user kit. */
export interface UserAdapter {
  /** Who is logged in. Called each time a command runs, so it should be cheap. */
  user(): UserInfo | Promise<UserInfo>;
  /** Opens the app's login, and comes back to this page after. Called after user login has delivered its result. */
  login(): void;
  /** Logs out, and comes back to this page. Called after user logout has delivered its result. */
  logout(): void;
  /** true if logging in and out loads a new page (navigates); false if the app stays on the page (reinitializes). */
  reloads: boolean;
}

/** Registers user status, user login and user logout. Returns a function that removes them. */
export declare function user(adapter: UserAdapter, options?: { registry?: Registry }): () => void;
