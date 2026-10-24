// The page kit: page status, the same on every site. It says what the page
// is: its title, its route and the thing it shows, such as an article. The
// app's adapter describes the page; the kit asks it each time page status
// runs, so a client-side router needs no extra work.
//
//   import { page } from "@d34dman/sutram/page";
//   page({ page: () => ({ title: document.title, route: "article", entity: { type: "node", id: "5", label: "Hello" } }) });
//
// Without a bundler, load dist/page.js after dist/sutram.js and call
// Sutram.kits.page(adapter).

import { getRegistry } from "./core.js";
import { checkAdapter, currentPath, registerAll } from "./kit.js";

/**
 * Registers page status on a registry (the page's by default). The adapter
 * supplies:
 *
 *   page()   { title, route?, entity?: { type, id, bundle?, label? } }.
 *            May be async; called each time page status runs.
 *   here()   optional: the current path, such as /node/5?page=2. Defaults
 *            to location.pathname + location.search.
 *
 * Returns a function that removes the command again.
 */
export function page(adapter, { registry = getRegistry() } = {}) {
  checkAdapter("page", adapter, { "page()": "function", "here()": "function?" });
  const here = () => (adapter.here ? adapter.here() : currentPath());

  return registerAll(registry, [{
    name: "page status",
    title: "Show page status",
    provider: "page",
    description: "Show what this page is: its title, route and the thing it shows",
    input: { type: "object", properties: {} },
    output: {
      type: "object",
      required: ["title", "path"],
      properties: {
        title: { type: "string" },
        path: { type: "string" },
        route: { type: "string" },
        entity: {
          type: "object",
          description: "What the page shows, such as an article",
          required: ["type", "id"],
          properties: {
            type: { type: "string" },
            id: { type: "string" },
            bundle: { type: "string" },
            label: { type: "string" },
          },
        },
      },
    },
    annotations: { readOnly: true, untrustedContent: true },
    async run() {
      const p = (await adapter.page()) || {};
      const title = String(p.title || "");
      const e = p.entity;
      const entity = e ? {
        type: String(e.type),
        id: String(e.id),
        ...(e.bundle === undefined ? {} : { bundle: String(e.bundle) }),
        ...(e.label === undefined ? {} : { label: String(e.label) }),
      } : undefined;
      const shows = entity
        ? ` It shows ${entity.type} ${entity.id}${entity.bundle ? ` (${entity.bundle})` : ""}${entity.label ? `: "${entity.label}"` : ""}.`
        : "";
      return {
        text: `"${title}"${p.route ? `, route ${p.route}` : ""}.${shows}`,
        data: { title, path: here(), ...(p.route ? { route: String(p.route) } : {}), ...(entity ? { entity } : {}) },
      };
    },
  }]);
}
