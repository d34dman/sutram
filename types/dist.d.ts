// dist/sutram.js and dist/sutram.min.js: one module with the main entry,
// client, events, webmcp, console and approval exports, and window.Sutram as default.
export * from "./index.js";
export * from "./client.js";
export * from "./events.js";
export * from "./webmcp.js";
export * from "./console.js";
export * from "./approval.js";
export { default } from "./browser.js";
export type { SutramGlobal } from "./browser.js";
