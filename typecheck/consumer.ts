// Type-checked in CI (.github/workflows/test.yml) with node16 and bundler resolution,
// outside test/ so node --test does not run it:
// code that uses every entry point the way an app would.
import { getRegistry, createRegistry, CommandError, EXIT, commandLine, type Result, type ExitCode } from "@d34dman/sutram";
import { parse, checkInput, formatResult } from "@d34dman/sutram/client";
import { createEvents } from "@d34dman/sutram/events";
import { callTool, listTools, connectWebMCP } from "@d34dman/sutram/webmcp";
import { mountConsole, MESSAGES } from "@d34dman/sutram/console";
import Sutram from "@d34dman/sutram/dist/sutram.js";
import { nav, type NavMenus } from "@d34dman/sutram/nav";
import { page } from "@d34dman/sutram/page";
import { user } from "@d34dman/sutram/user";
import { messages, type Message } from "@d34dman/sutram/messages";
import { lists, type ListState } from "@d34dman/sutram/lists";
import { forms, type FormField } from "@d34dman/sutram/forms";

const registry = getRegistry();
const off = registry.register({
  name: "cart add", provider: "cart", description: "Add a product",
  input: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] },
  annotations: {},
  run: ({ sku }) => {
    if (!sku) throw new CommandError("cart add: sku is required", EXIT.USAGE);
    return { text: `Added ${sku}.` };
  },
});

async function main() {
  const r: Result = await registry.run("cart add", { sku: "V60" });
  if (r.code === 0) { const text: string | undefined = r.text; void text; }
  if ("message" in r && r.message) { const message: string = r.message; void message; }
  const custom: ExitCode = 8;
  void custom;
  const batch = await createRegistry().batch([{ name: "cart add", input: { sku: "x" } }]);
  void batch.completed;
  void parse(registry, "cart add V60").input;
  void checkInput({ type: "object" }, {}).errors;
  void formatResult(r);
  void commandLine(registry.get("cart add")!, { sku: "V60" });
  createEvents(registry).define("cart.changed", { description: "The cart changed" });
  void (await callTool("cart_add", { sku: "V60" }, { confirmed: true })).code;
  void listTools().length;
  connectWebMCP()();
  void MESSAGES.withdrawn;
  const el = mountConsole({ hotkey: "none" });
  el.setInput("cart add ");
  void Sutram.tools();
}
void main;
off();

// The nav kit with a static adapter; Sutram.kits.nav is the same function from dist/nav.js.
const menus: NavMenus = { main: { label: "Main", items: [{ title: "Docs", url: "/docs", children: [{ title: "Install", url: "/docs/install" }] }] } };
const offNav: () => void = nav({ menus: () => menus, go: (url) => { location.assign(url); }, reloads: true });
offNav();
Sutram.kits.nav?.({ menus: async () => menus, go: () => {}, reloads: false, here: () => "/docs" });

// The page, user and messages kits.
page({ page: () => ({ title: "Hello", route: "article", entity: { type: "node", id: 5, label: "Hello" } }) })();
user({ user: async () => ({ authenticated: true, id: 7, name: "ada", roles: ["editor", { id: "admin", label: "Admin" }] }), login() {}, logout() {}, reloads: true })();
const shown: Message[] = [{ type: "status", text: "Saved." }];
messages({ messages: () => shown, watch: (changed) => { addEventListener("message", changed); return () => removeEventListener("message", changed); } })();
Sutram.kits.messages?.({ messages: async () => shown });

// The lists kit.
lists({
  lists: () => ({ content: { label: "Content", columns: [{ key: "title", label: "Title" }], rows: [{ title: "Hello", url: "/node/5" }], page: 1, pages: 2, sorts: ["title"], filters: [{ key: "type", value: "", options: ["article"] }] } }),
  go: (list: string, state: ListState) => { location.assign(`/${list}?page=${state.page - 1}`); },
  reloads: true,
})();
Sutram.kits.lists?.({ lists: async () => ({}), go() {}, reloads: false });

// The forms kit.
const values: Record<string, unknown> = {};
forms({
  forms: () => [{ id: "contact", label: "Contact", fields: [{ field: "email", type: "string", required: true, value: "" }] }],
  read: (form, field: FormField) => values[field.field] ?? "",
  write: (form, field, value) => { values[field.field] = value; },
  submit: () => ({ text: "Sent." }),
  reloads: false,
  types: { date: { coerce: (field, raw) => raw, format: "YYYY-MM-DD" } },
  upload: async (form, field, files) => ({ data: { uploaded: (files || []).map((f) => ({ field, filename: f.name })) } }),
})();
Sutram.kits.forms?.({ forms: async () => [], read() {}, write() {}, submit() {}, reloads: true });
