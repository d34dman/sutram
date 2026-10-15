// The website's demo: a small shop that registers its commands with Sutram,
// renders itself from its own state, and shows who ran what and what an
// agent would see. sutram.js is the package build, copied in at deploy time.
import Sutram, { toTool, STATUS_TOOL, commandLine, findModelContext } from "./sutram.js";

const { registry, events, CommandError, EXIT } = Sutram;

// --- The shop's own state and rendering -------------------------------------

const products = [
  { sku: "V60-02", name: "V60 dripper, size 02", price: 24, emoji: "☕" },
  { sku: "KALITA-185", name: "Kalita Wave 185", price: 32, emoji: "🫖" },
  { sku: "GUJI-250", name: "Ethiopia Guji, 250 g", price: 14.5, emoji: "🫘" },
  { sku: "FILTERS-02", name: "Paper filters, 100", price: 6.9, emoji: "📄" },
  { sku: "SCALE", name: "Brew scale with timer", price: 45, emoji: "⚖️" },
];
const bySku = new Map(products.map((p) => [p.sku, p]));
const cart = new Map(); // sku → qty
let lastOrder = null;
let nextOrder = 1001;

const euro = new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" });
const count = () => [...cart.values()].reduce((a, b) => a + b, 0);
const total = () => [...cart].reduce((sum, [sku, qty]) => sum + bySku.get(sku).price * qty, 0);
const items = () => [...cart].map(([sku, qty]) => ({ sku, name: bySku.get(sku).name, qty, price: bySku.get(sku).price }));
const summary = () => `${count()} item${count() === 1 ? "" : "s"}, ${euro.format(total())}`;

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function render() {
  document.getElementById("shop").replaceChildren(...products.map((p) => el("div", { className: "product" },
    el("span", { className: "emoji", ariaHidden: "true", textContent: p.emoji }),
    el("span", { className: "name", textContent: p.name }),
    el("span", { className: "sku", textContent: p.sku }),
    el("span", { className: "row" },
      el("span", { textContent: euro.format(p.price) }),
      el("button", { type: "button", textContent: "Add", onclick: () => registry.run("cart add", { sku: p.sku, qty: 1 }, { caller: "button" }) })),
  )));
  const cartEl = document.getElementById("cart");
  if (!cart.size) {
    cartEl.replaceChildren(el("div", { className: "empty", textContent: "Your cart is empty." }));
  } else {
    cartEl.replaceChildren(
      el("ul", {}, ...items().map((i) => el("li", {}, el("span", { textContent: `${i.qty} × ${i.name}` }), el("span", { textContent: euro.format(i.price * i.qty) })))),
      el("div", { className: "total" }, el("span", { textContent: "Total" }), el("span", { textContent: euro.format(total()) })),
    );
  }
  if (lastOrder) cartEl.append(el("div", { className: "order", textContent: `Order #${lastOrder} placed. Thank you!` }));
}

// --- Its commands -----------------------------------------------------------

Sutram.defineFormat("money", {
  type: "number",
  description: "an amount in euros",
  validate: (v) => Number.isFinite(v),
  display: (v) => euro.format(v),
  align: "right",
});

events.define("cart.changed", {
  description: "The cart changed",
  payload: { type: "object", required: ["count", "total"], properties: { count: { type: "integer" }, total: { type: "number" } } },
});

const NONE = { type: "object", properties: {} };
const SKU = { type: "string", enum: products.map((p) => p.sku), description: "A product code, as in shop list" };
const PRODUCT = { type: "object", required: ["sku", "name", "price"], properties: { sku: { type: "string", title: "SKU" }, name: { type: "string" }, price: { type: "number", format: "money" } } };
const LINE = { type: "object", required: ["sku", "qty"], properties: { sku: { type: "string", title: "SKU" }, name: { type: "string" }, qty: { type: "integer" }, price: { type: "number", format: "money" } } };

function changed(caller) {
  lastOrder = null;
  render();
  events.emit("cart.changed", { count: count(), total: total() }, { source: caller });
  toggleCheckout();
}

Sutram.register({
  name: "shop list",
  provider: "shop",
  description: "List the products for sale",
  input: NONE,
  output: { type: "object", required: ["products"], properties: { products: { type: "array", items: PRODUCT } } },
  view: { columns: ["sku", "name", "price"] },
  annotations: { readOnly: true },
  examples: ["shop list", "shop list --json=sku,price"],
  seeAlso: ["shop find", "cart add"],
  run: () => ({ data: { products: products.map(({ sku, name, price }) => ({ sku, name, price })) } }),
});

Sutram.register({
  name: "shop find",
  provider: "shop",
  description: "Find products whose name contains all the words",
  input: { type: "object", properties: { query: { type: "string", description: "Words to look for" } }, required: ["query"] },
  positional: ["query"],
  output: { type: "object", required: ["products"], properties: { products: { type: "array", items: PRODUCT } } },
  annotations: { readOnly: true },
  examples: ["shop find filter", "shop find dripper"],
  run: ({ query }) => {
    const words = query.toLowerCase().split(/\s+/);
    const found = products.filter((p) => words.every((w) => `${p.name} ${p.sku}`.toLowerCase().includes(w))).map(({ sku, name, price }) => ({ sku, name, price }));
    return found.length ? { data: { products: found } } : { text: `Nothing matches "${query}". Try shop list.`, data: { products: [] } };
  },
});

Sutram.register({
  name: "cart status",
  provider: "cart",
  description: "Show what is in the cart",
  input: NONE,
  output: { type: "object", required: ["count", "total", "items"], properties: { count: { type: "integer" }, total: { type: "number", format: "money" }, items: { type: "array", items: LINE } } },
  view: { columns: ["sku", "name", "qty", "price"] },
  annotations: { readOnly: true },
  seeAlso: ["cart add", "checkout"],
  run: () => cart.size
    ? { text: `${summary()}.`, data: { count: count(), total: total(), items: items() } }
    : { text: "The cart is empty. Try shop list, then cart add.", data: { count: 0, total: 0, items: [] } },
});

Sutram.register({
  name: "cart add",
  provider: "cart",
  description: "Add a product to the cart",
  input: { type: "object", properties: { sku: SKU, qty: { type: "integer", minimum: 1, maximum: 20, default: 1, description: "How many" } }, required: ["sku"] },
  positional: ["sku", "qty"],
  output: { type: "object", required: ["count", "total"], properties: { count: { type: "integer" }, total: { type: "number", format: "money" } } },
  annotations: {},
  examples: ["cart add V60-02", "cart add GUJI-250 2", "cart add SCALE --qty=1"],
  seeAlso: ["cart remove", "cart status", "checkout"],
  run: ({ sku, qty }, { caller }) => {
    cart.set(sku, (cart.get(sku) || 0) + qty);
    changed(caller);
    return { text: `Added ${qty} × ${bySku.get(sku).name}. The cart has ${summary()}.`, data: { count: count(), total: total() } };
  },
});

Sutram.register({
  name: "cart remove",
  provider: "cart",
  description: "Remove a product from the cart",
  input: { type: "object", properties: { sku: SKU }, required: ["sku"] },
  positional: ["sku"],
  output: { type: "object", required: ["count", "total"], properties: { count: { type: "integer" }, total: { type: "number", format: "money" } } },
  annotations: {},
  seeAlso: ["cart status"],
  run: ({ sku }, { caller }) => {
    if (!cart.has(sku)) throw new CommandError(`cart remove: ${sku} is not in the cart.`, EXIT.FAILED);
    cart.delete(sku);
    changed(caller);
    return { text: `Removed ${bySku.get(sku).name}. The cart has ${summary()}.`, data: { count: count(), total: total() } };
  },
});

// checkout exists only while there is something to buy: commands come and go
// with the page's state, and the console and agents follow.
let removeCheckout = null;
function toggleCheckout() {
  if (cart.size && !removeCheckout) {
    removeCheckout = Sutram.register({
      name: "checkout",
      provider: "cart",
      description: "Place the order for everything in the cart",
      input: NONE,
      output: { type: "object", required: ["order", "total"], properties: { order: { type: "integer" }, total: { type: "number", format: "money" } } },
      annotations: { consequential: true },
      confirm: () => `Place an order for ${summary()}?`,
      seeAlso: ["cart status"],
      run: (_, { caller }) => {
        const order = nextOrder++;
        const paid = total();
        cart.clear();
        changed(caller);
        lastOrder = order;
        render();
        return { text: `Order #${order} placed: ${euro.format(paid)}. Thank you!`, data: { order, total: paid } };
      },
    });
  } else if (!cart.size && removeCheckout) {
    removeCheckout();
    removeCheckout = null;
  }
}

// --- Who ran what -----------------------------------------------------------

const log = document.getElementById("log");
registry.onResult(({ name, input, caller, result }) => {
  // checkout removes itself when the cart empties, so its definition may be gone.
  const def = registry.get(name);
  if (log.querySelector(".empty")) log.replaceChildren();
  const who = caller === "console" ? "console" : caller === "agent" ? "agent" : "button";
  const row = el("li", { className: "fresh" },
    el("span", { className: `who ${who}`, textContent: who }),
    el("span", { className: "cmd", textContent: def ? commandLine(def, input) : name }),
    el("span", { className: `exit${result.code ? " bad" : ""}`, textContent: `exit ${result.code}` }));
  log.prepend(row);
  while (log.children.length > 12) log.lastChild.remove();
});

// --- What an agent sees -----------------------------------------------------

let known = new Set();
function renderTools() {
  const tools = [STATUS_TOOL, ...registry.list().map((def) => toTool(def, registry.formats))];
  document.getElementById("tool-count").textContent = `${tools.length} WebMCP tools`;
  document.getElementById("tools").replaceChildren(...tools.map((t) => {
    const hints = t.annotations || {};
    return el("li", { className: known.size && !known.has(t.name) ? "new" : "" },
      el("span", { className: "name", textContent: t.name }),
      ...(hints.readOnlyHint ? [el("span", { className: "tag ro", textContent: "read-only" })] : []),
      ...(hints.consequentialHint ? [el("span", { className: "tag cq", textContent: "asks first" })] : []),
      el("div", { className: "desc", textContent: t.description }));
  }));
  known = new Set(tools.map((t) => t.name));
}
registry.onChange(renderTools);

document.getElementById("webmcp").textContent = findModelContext()
  ? "This browser supports WebMCP: an agent on this page can call these tools now. Try asking it to buy filters."
  : "In a browser with WebMCP, these are registered as tools for agents. Add something to the cart: checkout appears.";

// --- The console and the page's buttons ---------------------------------------

const consoleEl = Sutram.mountConsole({ greeting: "Welcome to the Brew & Co. demo. Type help, or click a command on the page. Esc closes." });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let typing = Promise.resolve();

function type(line) {
  typing = typing.then(async () => {
    consoleEl.open();
    await sleep(150);
    for (let i = 1; i <= line.length; i++) {
      consoleEl.setInput(line.slice(0, i));
      await sleep(22);
    }
    await sleep(180);
    consoleEl.setInput("");
    await consoleEl.submit(line);
  });
}

for (const chip of document.querySelectorAll("[data-run]")) chip.addEventListener("click", () => type(chip.dataset.run));
for (const b of document.querySelectorAll("[data-open-console]")) b.addEventListener("click", () => {
  document.getElementById("demo").scrollIntoView();
  type("help");
});
for (const b of document.querySelectorAll("[data-copy], [data-copy-from]")) b.addEventListener("click", async () => {
  const text = b.dataset.copy || document.getElementById(b.dataset.copyFrom).textContent;
  try { await navigator.clipboard.writeText(text); b.textContent = "Copied"; } catch { b.textContent = "Select and copy"; }
  setTimeout(() => { b.textContent = "Copy"; }, 1500);
});

render();
renderTools();
