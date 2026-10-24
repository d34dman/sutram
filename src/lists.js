// The lists kit: list status, list rows and list go, the same on every site.
// It reads listings, such as an admin's content overview: the rows shown,
// the page, the sort and the filters, and shows another page, sort or
// filter. It changes nothing on the rows themselves. The app's adapter
// describes the lists and goes to the one asked for; the kit checks what was
// asked against what the list offers, writes the errors and offers
// completion.
//
//   import { lists } from "@d34dman/sutram/lists";
//   lists({
//     lists: () => ({ content: { label: "Content", columns: [{ key: "title", label: "Title" }], rows: [...], page: 1, pages: 3 } }),
//     go: (list, state) => location.assign(urlFor(list, state)),
//     reloads: true,
//   });
//
// Without a bundler, load dist/lists.js after dist/sutram.js and call
// Sutram.kits.lists(adapter).

import { CommandError, EXIT, getRegistry } from "./core.js";
import { checkAdapter, registerAll } from "./kit.js";

const ORDERS = ["asc", "desc"];

/** One list from the adapter, checked, with defaults filled in. */
function check(name, l) {
  const bad = (what) => new CommandError(`list: the app's adapter describes list "${name}" ${what}`, EXIT.FAILED);
  if (!l || typeof l !== "object") throw bad("as nothing");
  if (!Array.isArray(l.columns) || l.columns.some((c) => !c || typeof c.key !== "string")) throw bad("without columns: [{ key, label }]");
  if (!Array.isArray(l.rows)) throw bad("without rows");
  const sorts = (l.sorts || []).map((s) => (typeof s === "string" ? { key: s, label: s } : { key: String(s.key), label: String(s.label || s.key) }));
  const filters = (l.filters || []).map((f) => {
    if (!f || typeof f.key !== "string") throw bad("with a filter that has no key");
    return {
      key: f.key,
      label: String(f.label || f.key),
      value: f.value === undefined || f.value === null ? "" : String(f.value),
      ...(Array.isArray(f.options) ? { options: f.options.map((o) => (typeof o === "object" ? { value: String(o.value), label: String(o.label || o.value) } : { value: String(o), label: String(o) })) } : {}),
    };
  });
  return {
    name,
    label: String(l.label || name),
    columns: l.columns.map((c) => ({ key: c.key, label: String(c.label || c.key) })),
    rows: l.rows,
    page: Number.isInteger(l.page) && l.page > 0 ? l.page : 1,
    ...(Number.isInteger(l.pages) ? { pages: l.pages } : {}),
    ...(Number.isInteger(l.total) ? { total: l.total } : {}),
    ...(l.sort ? { sort: String(l.sort), order: ORDERS.includes(l.order) ? l.order : "asc" } : {}),
    sorts,
    filters,
  };
}

/** The lists on the page, from the adapter, for one run. */
async function load(adapter) {
  const all = await adapter.lists();
  if (all === null || typeof all !== "object" || Array.isArray(all)) {
    throw new CommandError("list: the app's adapter returned no lists object", EXIT.FAILED);
  }
  return Object.entries(all).map(([name, l]) => check(name, l));
}

/** The list a command names, or the only one when it names none. */
function pick(all, name, cmd) {
  const names = all.map((l) => l.name);
  if (!name) {
    if (all.length === 1) return all[0];
    throw new CommandError(all.length
      ? `${cmd}: this page has ${all.length} lists; say which: ${names.join(", ")}.`
      : `${cmd}: this page has no lists.`, EXIT.USAGE);
  }
  const l = all.find((x) => x.name === name) || all.find((x) => x.label.toLowerCase() === name.toLowerCase());
  if (!l) throw new CommandError(`${cmd}: no list "${name}". ${names.length ? `Lists: ${names.join(", ")}.` : "This page has no lists."}`, EXIT.FAILED);
  return l;
}

/** "Rows 21–40 of 95, page 2 of 5" and the like. */
function where(l) {
  const parts = [`${l.rows.length} row${l.rows.length === 1 ? "" : "s"}${l.total !== undefined ? ` of ${l.total}` : ""}`];
  parts.push(l.pages !== undefined ? `page ${l.page} of ${l.pages}` : `page ${l.page}`);
  return parts.join(", ");
}

const LIST = { type: "string", description: "Which list. Leave it out when the page has only one" };

/**
 * Registers list status, list rows and list go on a registry (the page's by
 * default). The adapter supplies:
 *
 *   lists()            the lists on this page, keyed by name: { label,
 *                      columns: [{ key, label }], rows: [{ [key]: value,
 *                      url? }], page, pages?, total?, sort?, order?,
 *                      sorts?: [{ key, label }], filters?: [{ key, label,
 *                      value, options? }] }. Pages count from 1. May be
 *                      async; called each time a command runs.
 *   go(list, state)    shows the list in a new state: { page, sort, order,
 *                      filters: { [key]: value } }, complete, so the
 *                      adapter only builds its URL or query. Called after
 *                      list go has delivered its result.
 *   reloads            true if that loads a new page (list go is marked
 *                      navigates); false if the app shows it in place
 *                      (reinitializes, and the app calls initialized()).
 *
 * Returns a function that removes the commands again.
 */
export function lists(adapter, { registry = getRegistry() } = {}) {
  checkAdapter("list", adapter, { "lists()": "function", "go(list, state)": "function", reloads: "boolean" });

  const quietly = async (fn) => { try { return fn(await load(adapter)); } catch { return []; } };
  const startsWith = (partial) => (s) => s.toLowerCase().startsWith(partial.toLowerCase());
  // Completion for list go: the list is the first word typed after the command.
  const listOf = (all, input) => (input && input.list ? all.find((l) => l.name === input.list) : all.length === 1 ? all[0] : undefined);

  return registerAll(registry, [
    {
      name: "list status",
      title: "Show the lists on this page",
      provider: "list",
      description: "Show the lists on this page: rows shown, page, sort, and the sorts and filters each offers",
      input: { type: "object", properties: {} },
      output: {
        type: "object",
        required: ["lists"],
        properties: {
          lists: {
            type: "array",
            items: {
              type: "object",
              required: ["list", "label", "rows", "page"],
              properties: {
                list: { type: "string", description: "Pass it to list rows and list go" },
                label: { type: "string" },
                rows: { type: "integer", description: "Rows shown" },
                total: { type: "integer" },
                page: { type: "integer" },
                pages: { type: "integer" },
                sort: { type: "string" },
                order: { type: "string", enum: ORDERS },
                sorts: { type: "array", items: { type: "string" }, description: "Columns list go --sort takes" },
                filters: {
                  type: "array",
                  description: "Filters list go --filter takes, with their value now",
                  items: {
                    type: "object",
                    properties: {
                      key: { type: "string" },
                      label: { type: "string" },
                      value: { type: "string" },
                      options: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      view: { columns: ["list", "label", "rows", "total", "page", "pages", "sort", "order"] },
      annotations: { readOnly: true },
      seeAlso: ["list rows", "list go"],
      async run() {
        const all = await load(adapter);
        const data = all.map((l) => ({
          list: l.name,
          label: l.label,
          rows: l.rows.length,
          ...(l.total !== undefined ? { total: l.total } : {}),
          page: l.page,
          ...(l.pages !== undefined ? { pages: l.pages } : {}),
          ...(l.sort ? { sort: l.sort, order: l.order } : {}),
          sorts: l.sorts.map((s) => s.key),
          filters: l.filters.map((f) => ({ key: f.key, label: f.label, value: f.value, ...(f.options ? { options: f.options.map((o) => o.value) } : {}) })),
        }));
        if (!all.length) return { text: "This page has no lists.", data: { lists: [] } };
        const lines = all.map((l) => {
          const sort = l.sort ? `, sorted by ${l.sort} ${l.order}` : "";
          const set = l.filters.filter((f) => f.value !== "").map((f) => `${f.key}=${f.value}`);
          const filtered = set.length ? `, filtered by ${set.join(", ")}` : "";
          return `${l.label} (${l.name}): ${where(l)}${sort}${filtered}.`;
        });
        return { text: `${lines.join(" ")} See list rows.`, data: { lists: data } };
      },
    },
    {
      name: "list rows",
      title: "Show a list's rows",
      provider: "list",
      description: "Show the rows a list shows now, with their links",
      input: { type: "object", properties: { list: LIST } },
      positional: ["list"],
      output: {
        type: "object",
        required: ["list", "columns", "rows", "page"],
        properties: {
          list: { type: "string" },
          page: { type: "integer" },
          pages: { type: "integer" },
          total: { type: "integer" },
          columns: { type: "array", items: { type: "string" }, description: "The keys of each row, in the list's order" },
          rows: { type: "array", items: { type: "object", description: "One value per column, and url when the row links somewhere" } },
        },
      },
      annotations: { readOnly: true },
      examples: ["list rows", "list rows content", "list rows content --json"],
      seeAlso: ["list go", "list status"],
      suggest: (key, partial) => (key === "list" ? quietly((all) => all.map((l) => l.name).filter(startsWith(partial))) : []),
      async run({ list }) {
        const l = pick(await load(adapter), list, "list rows");
        const keys = l.columns.map((c) => c.key);
        const rows = l.rows.map((r) => {
          const row = {};
          for (const k of keys) row[k] = r[k] === undefined || r[k] === null ? "" : r[k];
          if (r.url) row.url = String(r.url);
          return row;
        });
        const next = l.pages !== undefined && l.page < l.pages ? ` Next: list go ${l.name} --page=${l.page + 1}.` : "";
        return {
          text: rows.length ? `${l.label}: ${where(l)}.${next}` : `${l.label} shows no rows.`,
          data: {
            list: l.name,
            page: l.page,
            ...(l.pages !== undefined ? { pages: l.pages } : {}),
            ...(l.total !== undefined ? { total: l.total } : {}),
            columns: keys,
            rows,
          },
        };
      },
    },
    {
      name: "list go",
      title: "Show another page of a list",
      provider: "list",
      description: "Show a list at another page, sorted another way, or filtered: all in one go. A new sort or filter starts at page 1",
      input: {
        type: "object",
        properties: {
          list: LIST,
          page: { type: "integer", minimum: 1, description: "The page, from 1" },
          sort: { type: "string", description: "A column the list can be sorted by; see list status" },
          order: { type: "string", enum: ORDERS, description: "asc or desc" },
          filter: {
            type: "array",
            items: { type: "string" },
            description: "Filters as key=value, such as type=article; key= clears one",
          },
        },
      },
      positional: ["list"],
      output: {
        type: "object",
        required: ["list", "page"],
        properties: {
          list: { type: "string" },
          page: { type: "integer" },
          sort: { type: "string" },
          order: { type: "string" },
          filters: { type: "object", additionalProperties: { type: "string" } },
        },
      },
      annotations: adapter.reloads ? { navigates: true } : { reinitializes: true },
      examples: ["list go content --page=2", "list go content --sort=title --order=asc", "list go content --filter=type=article,status=1"],
      seeAlso: ["list rows", "list status"],
      suggest: (key, partial, { input } = {}) => {
        if (key === "list") return quietly((all) => all.map((l) => l.name).filter(startsWith(partial)));
        if (key === "sort") return quietly((all) => (listOf(all, input) || { sorts: [] }).sorts.filter((s) => startsWith(partial)(s.key)).map((s) => ({ value: s.key, description: s.label })));
        if (key === "filter") {
          return quietly((all) => {
            const l = listOf(all, input);
            if (!l) return [];
            // Filters are a comma-separated list: complete the last one.
            const comma = partial.lastIndexOf(",") + 1;
            const [before, last] = [partial.slice(0, comma), partial.slice(comma)];
            const eq = last.indexOf("=");
            if (eq < 0) return l.filters.filter((f) => startsWith(last)(f.key)).map((f) => ({ value: `${before}${f.key}=`, label: `${f.key}=`, description: f.label }));
            const f = l.filters.find((x) => x.key === last.slice(0, eq));
            return f && f.options ? f.options.filter((o) => startsWith(last.slice(eq + 1))(o.value)).map((o) => ({ value: `${before}${f.key}=${o.value}`, label: o.value, description: o.label })) : [];
          });
        }
        return [];
      },
      async run({ list, page, sort, order, filter }, { reinitializes }) {
        const l = pick(await load(adapter), list, "list go");
        if (page === undefined && sort === undefined && order === undefined && filter === undefined) {
          throw new CommandError("list go: say what to change: --page, --sort, --order or --filter.", EXIT.USAGE);
        }
        const filters = Object.fromEntries(l.filters.map((f) => [f.key, f.value]));
        for (const pair of filter || []) {
          const eq = pair.indexOf("=");
          const key = eq < 0 ? pair : pair.slice(0, eq);
          const f = l.filters.find((x) => x.key === key);
          if (eq < 0 || !f) {
            throw new CommandError(`list go: ${eq < 0 ? `write the filter as key=value: "${pair}"` : `${l.name} has no filter "${key}"`}. Filters: ${l.filters.map((x) => x.key).join(", ") || "none"}.`, EXIT.USAGE);
          }
          const value = pair.slice(eq + 1);
          if (value && f.options && !f.options.some((o) => o.value === value)) {
            throw new CommandError(`list go: filter ${key} takes ${f.options.map((o) => o.value).join(", ")}, not "${value}".`, EXIT.USAGE);
          }
          filters[key] = value;
        }
        if (sort !== undefined && !l.sorts.some((s) => s.key === sort)) {
          throw new CommandError(`list go: ${l.name} cannot be sorted by "${sort}". ${l.sorts.length ? `Sorts: ${l.sorts.map((s) => s.key).join(", ")}.` : "It has no sorts."}`, EXIT.USAGE);
        }
        if (order !== undefined && sort === undefined && !l.sort) {
          throw new CommandError(`list go: ${l.name} is not sorted; give --sort too.`, EXIT.USAGE);
        }
        if (page !== undefined && l.pages !== undefined && page > l.pages) {
          throw new CommandError(`list go: ${l.name} has ${l.pages} page${l.pages === 1 ? "" : "s"}.`, EXIT.USAGE);
        }
        const changed = sort !== undefined || order !== undefined || filter !== undefined;
        const state = {
          page: page !== undefined ? page : changed ? 1 : l.page,
          ...(sort !== undefined || l.sort ? { sort: sort !== undefined ? sort : l.sort, order: order || (sort !== undefined && sort !== l.sort ? "asc" : l.order) } : {}),
          filters,
        };
        reinitializes();
        setTimeout(() => adapter.go(l.name, state), 0);
        const how = [`page ${state.page}`, state.sort ? `sorted by ${state.sort} ${state.order}` : ""];
        const set = Object.entries(filters).filter(([, v]) => v !== "").map(([k, v]) => `${k}=${v}`);
        if (set.length) how.push(`filtered by ${set.join(", ")}`);
        return { text: `Showing ${l.label}, ${how.filter(Boolean).join(", ")}. Then run list rows.`, data: { list: l.name, ...state } };
      },
    },
  ]);
}
