// The user kit: user status, user login and user logout, the same on every
// site. The app's adapter says who is logged in and opens its own login
// and logout; the kit writes the answers and decides when to act. A
// password never passes through a command: user login only opens the app's
// login, where the person types it.
//
//   import { user } from "@d34dman/sutram/user";
//   user({
//     user: () => ({ authenticated: true, id: "7", name: "ada", roles: [{ id: "editor", label: "Editor" }] }),
//     login: () => location.assign(`/login?destination=${encodeURIComponent(location.pathname)}`),
//     logout: () => location.assign("/logout"),
//     reloads: true,
//   });
//
// Without a bundler, load dist/user.js after dist/sutram.js and call
// Sutram.kits.user(adapter).

import { getRegistry } from "./core.js";
import { afterResult, checkAdapter, registerAll } from "./kit.js";

const NONE = { type: "object", properties: {} };

/** Who is logged in, from the adapter, with roles as { id, label }. */
async function load(adapter) {
  const u = (await adapter.user()) || {};
  if (!u.authenticated) return { authenticated: false };
  const roles = (u.roles || []).map((r) => (typeof r === "string" ? { id: r, label: r } : { id: String(r.id), label: String(r.label || r.id) }));
  return { authenticated: true, id: u.id === undefined ? undefined : String(u.id), name: String(u.name || ""), roles };
}

/**
 * Registers user status, user login and user logout on a registry (the
 * page's by default). The adapter supplies:
 *
 *   user()     who is logged in: { authenticated, id?, name?, roles? },
 *              roles as strings or { id, label }. May be async; called each
 *              time a command runs.
 *   login()    opens the app's login, and comes back to this page after.
 *              Called after user login has delivered its result.
 *   logout()   logs out, and comes back to this page. Called after user
 *              logout has delivered its result.
 *   reloads    true if logging in and out loads a new page (the commands
 *              are marked navigates); false if the app stays on the page
 *              (reinitializes, and the app calls initialized() once the
 *              page shows the new user).
 *
 * Returns a function that removes the commands again.
 */
export function user(adapter, { registry = getRegistry() } = {}) {
  checkAdapter("user", adapter, { "user()": "function", "login()": "function", "logout()": "function", reloads: "boolean" });
  // Names and role labels are the site's text: on many sites people choose their own.
  const moves = adapter.reloads ? { navigates: true, untrustedContent: true } : { reinitializes: true, untrustedContent: true };

  return registerAll(registry, [
    {
      name: "user status",
      title: "Show who is logged in",
      provider: "user",
      description: "Show whether you are logged in, and as whom",
      input: NONE,
      output: {
        type: "object",
        required: ["authenticated"],
        properties: {
          authenticated: { type: "boolean" },
          id: { type: "string" },
          name: { type: "string" },
          roles: { type: "array", items: { type: "string" } },
        },
      },
      annotations: { readOnly: true, untrustedContent: true },
      seeAlso: ["user login", "user logout"],
      async run() {
        const u = await load(adapter);
        if (!u.authenticated) return { text: "Not logged in. Run user login to log in.", data: { authenticated: false } };
        const labels = u.roles.map((r) => r.label);
        const who = [u.id === undefined ? "" : `user ${u.id}`, labels.length ? `roles: ${labels.join(", ")}` : ""].filter(Boolean).join(", ");
        return {
          text: `Logged in as ${u.name}${who ? ` (${who})` : ""}.`,
          data: { authenticated: true, ...(u.id === undefined ? {} : { id: u.id }), name: u.name, roles: u.roles.map((r) => r.id) },
        };
      },
    },
    {
      name: "user login",
      title: "Log in",
      provider: "user",
      description: "Open the login, and come back to this page after logging in. The person types the password",
      input: NONE,
      output: { type: "object", required: ["authenticated"], properties: { authenticated: { type: "boolean" } } },
      annotations: moves,
      seeAlso: ["user status"],
      async run(input, { reinitializes }) {
        const u = await load(adapter);
        if (u.authenticated) return { text: `Already logged in as ${u.name}.`, data: { authenticated: true } };
        reinitializes();
        afterResult(registry, () => adapter.login());
        return {
          text: "Opening the login. The person logs in there, and you come back here; then run user status.",
          data: { authenticated: false },
        };
      },
    },
    {
      name: "user logout",
      title: "Log out",
      provider: "user",
      description: "Log out, and come back to this page as a visitor who is not logged in",
      input: NONE,
      output: { type: "object", required: ["authenticated"], properties: { authenticated: { type: "boolean" } } },
      // Unsaved changes on the page are lost, and logging in again needs the
      // person's password.
      annotations: { ...moves, consequential: true },
      seeAlso: ["user status", "user login"],
      async run(input, { reinitializes }) {
        const u = await load(adapter);
        if (!u.authenticated) return { text: "Not logged in.", data: { authenticated: false } };
        reinitializes();
        afterResult(registry, () => adapter.logout());
        return { text: `Logging out ${u.name}.`, data: { authenticated: false } };
      },
    },
  ]);
}
