// sutram: the registry, the command line parser and the formatter.
// No DOM. The console, the WebMCP bridge and events are separate entry points:
//   @d34dman/sutram/console, /webmcp, /events, /browser

export {
  EXIT, RESERVED_WORDS, CLIENT_OPTIONS, CommandError,
  createRegistry, getRegistry, checkInput, checkOutput, deref, isStatusCommand, runStatus,
} from "./core.js";
export { tokenize, parse, suggest, distance, highlight } from "./parse.js";
export { createFormats, getFormats, STANDARD_FORMATS } from "./formats.js";
export {
  formatResult, formatValue, formatTable, blocksToText, formatHelp, formatUsage, formatMan,
  synopsis, longSynopsis, annotationLabel, describeShape, sentence,
  checkFields, selectFields, formatsUsed, commandLine,
} from "./format.js";
