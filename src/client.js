// sutram/client: what a client of the registry needs, such as a console, a
// terminal or a test harness: parse and complete command lines, check input,
// run status, and turn results into text blocks. Covered by semver, like the
// main entry point. No DOM.

export { RESERVED_WORDS, CLIENT_OPTIONS, checkInput, checkOutput, isStatusCommand, runStatus } from "./core.js";
export { tokenize, parse, suggest, highlight, complete, splitLines, openQuote } from "./parse.js";
export { whoIs, ownQuestion } from "./policy.js";
export { formatResult, formatHelp, formatUsage, formatMan, blocksToText, checkFields, selectFields } from "./format.js";
