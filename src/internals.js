// sutram/internals: helpers Sutram uses itself. No semver promise: any
// release may change or remove them. Prefer the main entry and /client.

export { deref } from "./core.js";
export { distance } from "./parse.js";
export {
  formatValue, formatTable, synopsis, longSynopsis, annotationLabel, describeShape, sentence, formatsUsed,
} from "./format.js";
