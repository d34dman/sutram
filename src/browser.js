// One script for pages without a bundler: loads everything, defines
// <sutram-console>, connects WebMCP when the browser has it, and exposes
// the shared API as globalThis.Sutram. Headless browsers and tests use
// Sutram.tools() and Sutram.call() from there, and Sutram.agentPrompt()
// hands a task to an agent that drives a browser. Sutram.client is @d34dman/sutram/client, for pages
// that build a client of their own. Kits loaded as their own files, such as
// dist/nav.js, add themselves to Sutram.kits.
//
//   <script type="module" src=".../sutram/src/browser.js"></script>
//   <script type="module">
//     Sutram.register({ name: "hello world", provider: "hello", ... });
//     Sutram.mountConsole();
//   </script>

import * as core from "./index.js";
import * as client from "./client.js";
import { getEvents } from "./events.js";
import { connectWebMCP, findModelContext, listTools, callTool } from "./webmcp.js";
import { defineConsole, mountConsole } from "./console.js";
import { watchNavigation } from "./leave.js";

const registry = core.getRegistry();

// Ready once the page's scripts have run. Module and deferred scripts run
// before DOMContentLoaded, so providers that register when their script
// loads have registered by then; the extra turn lets DOMContentLoaded
// listeners run first. After a command calls reinitializes(), Sutram.ready
// is a new promise: on a page that is being left it never resolves, and a
// single-page app resolves it with Sutram.initialized(). If a command meant
// to leave the page and the page stays (Stay on page, a #hash URL, a blocked
// submit, the back/forward cache), watchNavigation() resolves it here again.
const initialized = () => setTimeout(() => registry.initialized(), 0);
if (typeof document === "undefined" || document.readyState !== "loading") initialized();
else document.addEventListener("DOMContentLoaded", initialized, { once: true });
if (typeof window !== "undefined" && typeof window.addEventListener === "function" && !globalThis.Sutram) watchNavigation(registry, window);
const events = getEvents(registry);
defineConsole();

if (!globalThis.Sutram) {
  globalThis.Sutram = Object.freeze({
    EXIT: core.EXIT,
    CommandError: core.CommandError,
    registry,
    events,
    get ready() { return registry.ready; },
    initialized: () => registry.initialized(),
    formats: registry.formats,
    defineFormat: (name, def) => registry.formats.define(name, def),
    register: (def) => registry.register(def),
    // For code that drives the page from outside: what an agent sees, and a
    // call that asks first, as WebMCP would. App code that needs no asking
    // uses registry.run().
    tools: () => listTools(registry),
    call: (name, input, options) => callTool(name, input, { ...options, registry }),
    // The prompt that hands a task on this page to an agent that drives a browser.
    agentPrompt: (task, page = { title: document.title, url: location.href }) => core.agentPrompt(task, page),
    mountConsole,
    connectWebMCP: () => connectWebMCP(registry, findModelContext()),
    client: Object.freeze({ ...client }),
    // Kits loaded as their own file (dist/nav.js) add themselves here:
    // Sutram.kits.nav(adapter).
    kits: {},
  });
  connectWebMCP(registry, findModelContext());
}

export default globalThis.Sutram;
