// The nav kit: nav status, nav menu, nav search and nav go, the same on every
// site. The app supplies an adapter; the kit registers the commands, matches
// what was typed against the menus, writes the errors and offers completion.
// It never reads the page: the menus come from the adapter, asked each time
// a command runs, so they are never stale.
//
//   import { nav } from "@d34dman/sutram/nav";
//   nav({
//     menus: () => ({ main: { label: "Main", items: [{ title: "Docs", url: "/docs" }] } }),
//     go: (url) => location.assign(url),
//     reloads: true,
//   });
//
// Without a bundler, load dist/nav.js after dist/sutram.js and call
// Sutram.kits.nav(adapter).

import { CommandError, EXIT, getRegistry } from "./core.js";

const NONE = { type: "object", properties: {} };
const SEP = " › ";

/** The current path, for adapters that do not say: path and query, no host. */
const currentPath = () => (globalThis.location ? globalThis.location.pathname + globalThis.location.search : "/");

/**
 * Checks an adapter's menus and lists every link with its breadcrumb inside
 * its menu. A menu item needs a title and a url; id, description and
 * children are optional.
 */
function flatten(menus) {
  if (menus === null || typeof menus !== "object" || Array.isArray(menus)) {
    throw new CommandError("nav: the app's adapter returned no menus object", EXIT.FAILED);
  }
  const flat = [];
  for (const [menu, value] of Object.entries(menus)) {
    const label = (value && value.label) || menu;
    (function walk(list, trail) {
      for (const item of list || []) {
        if (!item || typeof item.title !== "string" || typeof item.url !== "string") {
          throw new CommandError(`nav: a link in menu "${menu}" has no title or url`, EXIT.FAILED);
        }
        const path = [...trail, item.title];
        flat.push({ menu, menuLabel: label, item, trail: path.join(SEP) });
        if (item.children) walk(item.children, path);
      }
    })(value && value.items, []);
  }
  return flat;
}

/** The menus and their links, from the adapter, for one run. */
async function load(adapter) {
  const menus = await adapter.menus();
  return { menus, names: Object.keys(menus || {}), flat: flatten(menus) };
}

// A breadcrumb may start with its menu, by label or name: "Footer › About".
const inMenu = (e, q) => [e.menuLabel, e.menu].some((m) => `${m}${SEP}${e.trail}`.toLowerCase() === q);

/** The links a target names: by url or id, then by title, then by breadcrumb. */
function find(flat, target) {
  const q = String(target).trim().toLowerCase();
  const exact = flat.filter((e) => e.item.url.toLowerCase() === q || (e.item.id && String(e.item.id).toLowerCase() === q));
  if (exact.length) return exact;
  const byTitle = flat.filter((e) => e.item.title.toLowerCase() === q);
  if (byTitle.length) return byTitle;
  // A breadcrumb may leave out the top of the trail: "Structure › Menus".
  return flat.filter((e) => {
    const trail = e.trail.toLowerCase();
    return trail === q || trail.endsWith(`${SEP}${q}`) || inMenu(e, q);
  });
}

const ITEM = {
  type: "object",
  required: ["title", "url"],
  properties: {
    trail: { type: "string", title: "Menu item" },
    url: { type: "string", format: "uri-reference", title: "Path", description: "Pass it to nav go" },
    menu: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
  },
};

/**
 * Registers the nav commands on a registry (the page's by default). The
 * adapter supplies:
 *
 *   menus()   the menus, keyed by name: { label, items: [{ title, url,
 *             id?, description?, children? }] }. May be async; called each
 *             time a command runs, so it should be cheap.
 *   go(url)   goes to a url. Called after nav go has delivered its result.
 *   reloads   true if going loads a new page (nav go is marked navigates);
 *             false for a client-side router (nav go is marked
 *             reinitializes, and the app calls initialized() once the new
 *             route has registered its commands).
 *   here()    optional: the current path, such as /admin?tab=2. Defaults to
 *             location.pathname + location.search.
 *
 * Only paths that start with a single "/" are taken as "any path on this
 * site"; anything else must name a menu link. Returns a function that
 * removes the commands again.
 */
export function nav(adapter, { registry = getRegistry() } = {}) {
  if (!adapter || typeof adapter.menus !== "function") throw new TypeError("nav: the adapter needs a menus() function");
  if (typeof adapter.go !== "function") throw new TypeError("nav: the adapter needs a go(url) function");
  if (typeof adapter.reloads !== "boolean") throw new TypeError("nav: the adapter must say whether going reloads the page: reloads: true or false");
  if (adapter.here !== undefined && typeof adapter.here !== "function") throw new TypeError("nav: the adapter's here must be a function");
  const here = () => (adapter.here ? adapter.here() : currentPath());

  // Completion for menu names and link targets. A failing adapter offers nothing.
  const quietly = async (fn) => { try { return fn(await load(adapter)); } catch { return []; } };
  const startsWith = (partial) => (s) => s.toLowerCase().startsWith(partial.toLowerCase());

  const defs = [
    {
      name: "nav status",
      title: "Show where you are",
      provider: "nav",
      description: "Show where this page is in the menus",
      input: NONE,
      output: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string" },
          trail: { type: "string" },
          menu: { type: "string" },
          menus: { type: "array", items: { type: "string" } },
        },
      },
      annotations: { readOnly: true },
      seeAlso: ["nav menu", "nav search"],
      async run() {
        const { names, flat } = await load(adapter);
        const path = here();
        const bare = path.replace(/[?#].*$/, "");
        // The deepest link to this page: its url with the query, or without.
        const e = flat
          .filter((x) => x.item.url === path || x.item.url === bare)
          .sort((a, b) => b.trail.split(SEP).length - a.trail.split(SEP).length)[0];
        const links = names.length ? `${flat.length} links in ${names.join(", ")}; see nav menu.` : "There are no menus.";
        return {
          text: e ? `On ${e.trail} (${e.menuLabel}). ${links}` : `On ${path}, which is in none of the menus. ${links}`,
          data: { path, trail: e ? e.trail : "", menu: e ? e.menu : "", menus: names },
        };
      },
    },
    {
      name: "nav menu",
      title: "Show a menu",
      provider: "nav",
      description: "List the menus, or show one menu's links with their path and description",
      input: {
        type: "object",
        properties: {
          menu: { type: "string", description: "Which menu. Leave it out to list the menus" },
          depth: { type: "integer", minimum: 1, default: 2, description: "How many levels to show" },
        },
      },
      positional: ["menu"],
      output: {
        type: "object",
        properties: {
          menus: {
            type: "array",
            description: "Without a menu: the menus there are",
            items: {
              type: "object",
              required: ["menu", "label", "links"],
              properties: {
                menu: { type: "string", description: "Pass it to nav menu" },
                label: { type: "string" },
                links: { type: "integer", description: "Links the user may open" },
              },
            },
          },
          items: { type: "array", items: { $ref: "#/$defs/item" } },
        },
        $defs: {
          item: {
            type: "object",
            required: ["title", "url"],
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              url: { type: "string", format: "uri-reference", title: "Path" },
              description: { type: "string" },
              children: { type: "array", items: { $ref: "#/$defs/item" } },
            },
          },
        },
      },
      view: { columns: ["menu", "label", "links", "title", "url", "description"] },
      annotations: { readOnly: true },
      examples: ["nav menu", "nav menu main", "nav menu main --depth=3"],
      seeAlso: ["nav search", "nav go"],
      suggest: (key, partial) => (key === "menu" ? quietly(({ names }) => names.filter(startsWith(partial))) : []),
      async run({ menu, depth }) {
        const { menus, names, flat } = await load(adapter);
        if (!menu) {
          const list = names.map((m) => ({ menu: m, label: (menus[m] && menus[m].label) || m, links: flat.filter((e) => e.menu === m).length }));
          return {
            text: `${list.length} menu${list.length === 1 ? "" : "s"}. nav menu <menu> shows one; nav search looks through all of them.`,
            data: { menus: list },
          };
        }
        // By name, or by label when no name matches.
        const name = names.includes(menu) ? menu : names.find((m) => menus[m] && String(menus[m].label).toLowerCase() === menu.toLowerCase());
        if (!name) {
          throw new CommandError(`nav menu: no menu "${menu}". ${names.length ? `Menus: ${names.join(", ")}.` : "There are no menus."}`, EXIT.FAILED);
        }
        const strip = (items, d) => items.map(({ id, title, description, url, children }) => ({
          ...(id === undefined ? {} : { id: String(id) }),
          title,
          ...(description === undefined ? {} : { description }),
          url,
          ...(children && children.length && d < depth ? { children: strip(children, d + 1) } : {}),
        }));
        return { data: { items: strip(menus[name].items || [], 1) } };
      },
    },
    {
      name: "nav search",
      title: "Search the menus",
      provider: "nav",
      description: "Search the menu links for those whose title or description contains all the words",
      input: {
        type: "object",
        properties: { query: { type: "string", description: "Words to look for" } },
        required: ["query"],
      },
      positional: ["query"],
      output: {
        type: "object",
        required: ["matches"],
        properties: { matches: { type: "array", items: ITEM } },
      },
      view: { columns: ["trail", "url", "description"] },
      annotations: { readOnly: true },
      examples: ["nav search content type", 'nav search "text format"'],
      seeAlso: ["nav go", "nav menu"],
      async run({ query }) {
        const { flat } = await load(adapter);
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        const matches = flat
          .filter((e) => words.every((w) => `${e.item.title} ${e.item.description || ""}`.toLowerCase().includes(w)))
          .map((e) => ({ trail: e.trail, url: e.item.url, menu: e.menu, title: e.item.title, description: e.item.description || "" }));
        return matches.length ? { data: { matches } } : { text: `No menu link matches "${query}".`, data: { matches } };
      },
    },
    {
      name: "nav go",
      title: "Go to a page",
      provider: "nav",
      description: "Go to a menu link, by path, title or breadcrumb, or to any path on this site",
      input: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: 'A path such as /admin/structure, a link title, or a breadcrumb such as "Structure › Content types", which may start with its menu ("Footer › About")',
          },
        },
        required: ["target"],
      },
      positional: ["target"],
      output: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", format: "uri-reference" },
          title: { type: "string" },
        },
      },
      annotations: adapter.reloads ? { navigates: true } : { reinitializes: true },
      examples: ["nav go /admin/content", 'nav go "Content types"', "nav go Structure › Menus"],
      seeAlso: ["nav search", "nav status"],
      suggest: (key, partial) => (key === "target"
        ? quietly(({ flat }) => flat
          .filter((e) => startsWith(partial)(e.item.title) || startsWith(partial)(e.item.url))
          .map((e) => ({ value: e.item.title, label: e.trail, description: e.item.url })))
        : []),
      async run({ target }, { reinitializes }) {
        const { flat } = await load(adapter);
        const hits = find(flat, target);
        let url;
        let title;
        if (hits.length && hits.every((h) => h.item.url === hits[0].item.url)) {
          ({ url, title } = hits[0].item);
        } else if (hits.length > 1) {
          throw new CommandError(
            `nav go: "${target}" matches ${hits.length} links: ${hits.slice(0, 4).map((h) => `${h.menuLabel}${SEP}${h.trail}`).join("; ")}. Use the path or the breadcrumb, with its menu if need be.`,
            EXIT.FAILED,
          );
        } else if (/^\/(?!\/)/.test(target)) {
          // Any path on this site: the same as following a link to it.
          url = target;
          title = target;
        } else {
          throw new CommandError(`nav go: no menu link "${target}". Try nav search ${target.split(/\s+/)[0]}.`, EXIT.FAILED);
        }
        reinitializes();
        // Go after the result has been delivered to the caller.
        setTimeout(() => adapter.go(url), 0);
        return { text: `Going to ${title} (${url}).`, data: { url, title } };
      },
    },
  ];

  const offs = [];
  try {
    for (const def of defs) offs.push(registry.register(def));
  } catch (err) {
    for (const off of offs) off();
    throw err;
  }
  return () => { for (const off of offs) off(); };
}
