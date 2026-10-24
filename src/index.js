// sutram: what app authors use. The registry, formats, the policy, and
// helpers to describe a command line or prompt a browser agent. No DOM.
// Building a client of your own (a terminal, a console, a test harness)?
// See @d34dman/sutram/client. The console, the WebMCP bridge and events are
// separate entry points: /console, /webmcp, /events, /browser.

export { EXIT, CommandError, ANNOTATIONS, createRegistry, getRegistry } from "./core.js";
export { createFormats, getFormats, STANDARD_FORMATS } from "./formats.js";
export { createPolicy, LEVELS } from "./policy.js";
export { commandLine } from "./format.js";
export { agentPrompt, defineAgentPrompt } from "./prompt.js";
