// One script for pages without a bundler: loads everything, defines
// <sutram-console>, connects WebMCP when the browser has it, and exposes
// the shared API as globalThis.Sutram.
//
//   <script type="module" src=".../sutram/src/browser.js"></script>
//   <script type="module">
//     Sutram.register({ name: "hello world", provider: "hello", ... });
//     Sutram.mountConsole();
//   </script>

import * as core from "./index.js";
import { getEvents } from "./events.js";
import { connectWebMCP, findModelContext } from "./webmcp.js";
import { defineConsole, mountConsole } from "./console.js";

const registry = core.getRegistry();
const events = getEvents(registry);
defineConsole();

if (!globalThis.Sutram) {
  globalThis.Sutram = Object.freeze({
    ...core,
    registry,
    events,
    register: (def) => registry.register(def),
    run: (name, input, ctx) => registry.run(name, input, ctx),
    mountConsole,
    connectWebMCP: () => connectWebMCP(registry, findModelContext()),
  });
  connectWebMCP(registry, findModelContext());
}

export default globalThis.Sutram;
