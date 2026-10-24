// What the kits share: checking an adapter and registering a kit's commands
// as one. Not an entry point; each kit's file (dist/nav.js and so on) gets
// its own copy from scripts/build.mjs.

/** The current path, for adapters that do not say: path and query, no host. */
export const currentPath = () => (globalThis.location ? globalThis.location.pathname + globalThis.location.search : "/");

/**
 * Checks an adapter against what a kit needs, such as { "menus()":
 * "function", reloads: "boolean", "here()": "function?" }: ? marks a key the
 * adapter may leave out. Throws a TypeError that names the kit and the key.
 */
export function checkAdapter(kit, adapter, needs) {
  if (!adapter || typeof adapter !== "object") throw new TypeError(`${kit}: the kit needs an adapter object`);
  for (const [shown, type] of Object.entries(needs)) {
    const key = shown.replace(/\(.*$/, "");
    const optional = type.endsWith("?");
    const want = optional ? type.slice(0, -1) : type;
    if (optional && adapter[key] === undefined) continue;
    if (typeof adapter[key] === want) continue;
    if (want === "boolean") throw new TypeError(`${kit}: the adapter must say whether it loads a new page: ${key}: true or false`);
    throw new TypeError(optional ? `${kit}: the adapter's ${key} must be a function` : `${kit}: the adapter needs a ${shown} function`);
  }
}

/**
 * Registers a kit's commands. If one cannot be registered, the ones before it
 * are removed again, so a kit is all there or not at all. Returns a function
 * that removes them.
 */
export function registerAll(registry, defs) {
  const offs = [];
  try {
    for (const def of defs) offs.push(registry.register(def));
  } catch (err) {
    for (const off of offs) off();
    throw err;
  }
  return () => { for (const off of offs) off(); };
}
