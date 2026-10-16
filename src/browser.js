// One script for pages without a bundler: loads everything, defines
// <sutram-console>, connects WebMCP when the browser has it, and exposes
// the shared API as globalThis.Sutram. Headless browsers and tests use
// Sutram.tools() and Sutram.call() from there, and Sutram.agentPrompt()
// hands a task to an agent that drives a browser. Sutram.client is @d34dman/sutram/client, for pages
// that build a client of their own.
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

const registry = core.getRegistry();
const events = getEvents(registry);
defineConsole();

if (!globalThis.Sutram) {
  globalThis.Sutram = Object.freeze({
    EXIT: core.EXIT,
    CommandError: core.CommandError,
    registry,
    events,
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
  });
  connectWebMCP(registry, findModelContext());
}

export default globalThis.Sutram;
