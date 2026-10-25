// Command lines as a person types or pastes them: read and checked before
// anything runs, then run one after another as one batch. The console and
// Sutram.exec() (webmcp.js) both use this, so a line means the same in both:
// help, man, status and clear, -h, --json[=fields] and --wide. Asking the
// user is theirs: the console asks a person, exec follows the agent policy.
// Internal: not an entry point. No DOM.

import { CommandError, EXIT, RESERVED_WORDS, checkInput, mayReinitialize, runStatus, unknownProviders } from "./core.js";
import { checkFields, formatBuiltInUsage, formatHelp, formatMan, formatResult, formatUsage } from "./format.js";
import { distance, parse, splitLines, tokenize } from "./parse.js";

/**
 * What lines say of their own, in plain English. The console's MESSAGES take
 * these as defaults, so a page can translate them there.
 */
export const LINE_TEXT = Object.freeze({
  manWhich: "What manual page do you want?\nFor example, try: man help",
  manMissing: (name) => `No manual entry for ${name}. See help.`,
  noStatus: "No provider on this page reports a status.",
  batchMistake: (line, n) => `Line ${line} of ${n} has a mistake, so nothing ran.`,
  batchNotLast: (name) => `${name} may start Sutram again, so it must be the last line. Run the rest after it.`,
  batchStopped: (line, n) => `Stopped after line ${line} of ${n}; the rest did not run.`,
  batchUndone: (line, n) => `Stopped at line ${line} of ${n}. The earlier lines were undone, so nothing changed.`,
  batchKept: (providers) => `What earlier lines changed in ${providers.join(", ")} stays.`,
});

/** Pasted text as command lines: prompt marks copied with them (›, $, >) and # comments are left out. */
export const readLines = (text) => splitLines(String(text))
  .map((l) => l.trim().replace(/^(?:›|\$|>)\s*/, ""))
  .filter((l) => l && !l.startsWith("#"));

/**
 * Reads and checks one line without running it. Resolves nothing; throws a
 * CommandError for a line that cannot run. Returns the step to run:
 * { line, words } for a word built into every client (help, man, status,
 * clear), { line, def, help: true } for -h, else { line, def, input, value,
 * json, wide, fields }, where value is the checked input.
 */
export function readLine(registry, line) {
  const words = tokenize(line).map((t) => t.value);
  if (words.length && RESERVED_WORDS.includes(words[0].toLowerCase())) return { line, words };
  const parsed = parse(registry, line);
  if (parsed.help) return { line, def: parsed.def, help: true };
  const fieldError = parsed.fields && checkFields(parsed.def, parsed.fields);
  if (fieldError) throw new CommandError(fieldError, EXIT.USAGE);
  const { errors, value } = checkInput(parsed.def.input, parsed.input, registry.formats);
  if (errors.length) throw new CommandError(`${parsed.def.name}: ${errors.join("; ")}. Try ${parsed.def.name} -h.`, EXIT.USAGE);
  return { line, ...parsed, value };
}

/**
 * Reads every line first, so a mistake anywhere runs nothing. A command that
 * may start Sutram again must be the last line. Returns { steps }, or
 * { failed: { index, code, message } } for the first line that cannot run.
 */
export function readBatch(registry, lines, text = LINE_TEXT) {
  const steps = [];
  for (const [index, line] of lines.entries()) {
    try {
      const step = readLine(registry, line);
      if (step.def && !step.help && mayReinitialize(step.def) && index < lines.length - 1) {
        throw new CommandError(text.batchNotLast(step.def.name), EXIT.USAGE);
      }
      steps.push(step);
    } catch (err) {
      const code = err instanceof CommandError ? err.code : EXIT.FAILED;
      return { failed: { index, code, message: (err && err.message) || String(err) } };
    }
  }
  return { steps };
}

/** The steps that run a command, and so may need the user's approval: not help, man, status or -h. */
export const commandSteps = (steps) => steps.filter((s) => s.def && !s.help);

/** The command or group closest to `name`, for help and man's "did you mean"; null when none is close. */
function closest(registry, name) {
  let best = null;
  for (const n of new Set(registry.list().flatMap((d) => [d.name, d.name.split(" ")[0]]))) {
    const score = distance(name, n);
    if (score <= 2 && (!best || score < best.score)) best = { n, score };
  }
  return best && best.n;
}

const usageError = (word, usage) => ({ code: EXIT.USAGE, blocks: [{ kind: "error", text: `${word}: usage: ${usage}`, code: EXIT.USAGE }] });
const USAGE = { help: "help [provider]", man: "man <command>", status: "status [provider …] [--json]", clear: "clear" };

/**
 * help, man, status and clear, the words every client owns. Resolves to
 * { code, blocks }, and clear: true when the screen is to be cleared.
 * -h or --help after any of them shows its usage. In a batch, `run` is the
 * batch's, so status runs inside it.
 */
export async function clientWord(registry, words, { caller, signal, run, text = LINE_TEXT } = {}) {
  const [first, ...rest] = words.map((w, i) => (i === 0 ? w.toLowerCase() : w));
  if (rest.some((w) => w === "-h" || w === "--help")) return { code: EXIT.OK, blocks: formatBuiltInUsage(first) };
  const options = rest.filter((w) => w.startsWith("-"));
  if (first === "status") {
    if (options.some((w) => w !== "--json")) return usageError(first, USAGE.status);
    const names = rest.filter((w) => w !== "--json");
    const unknown = unknownProviders(registry, names.length ? names : undefined);
    if (unknown) return { code: EXIT.USAGE, blocks: [{ kind: "error", text: `status: ${unknown}`, code: EXIT.USAGE }] };
    const results = await runStatus(registry, { caller, signal, run, providers: names.length ? names : undefined });
    if (rest.includes("--json")) return { code: EXIT.OK, blocks: [{ kind: "json", text: JSON.stringify(results.map(({ provider, data }) => ({ provider, data })), null, 2) }] };
    if (!results.length) return { code: EXIT.OK, blocks: [{ kind: "dim", text: text.noStatus }] };
    const w = Math.max(...results.map((r) => r.provider.length));
    return { code: EXIT.OK, blocks: [{ kind: "text", text: results.map((r) => `${r.provider.padEnd(w)}  ${(r.code ? r.message : r.text || "").split("\n")[0]}`).join("\n") }] };
  }
  if (options.length) return usageError(first, USAGE[first]);
  if (first === "help") {
    const topic = rest.join(" ").toLowerCase();
    const blocks = formatHelp(registry, topic);
    if (blocks[0].kind !== "error") return { code: EXIT.OK, blocks };
    const guess = closest(registry, topic);
    return { code: EXIT.NOT_FOUND, blocks: [{ ...blocks[0], text: `${blocks[0].text} ${guess ? `Try help ${guess}.` : "See help."}`, code: EXIT.NOT_FOUND }] };
  }
  if (first === "man") {
    const name = rest.join(" ").toLowerCase();
    if (!name) return { code: EXIT.USAGE, blocks: [{ kind: "error", text: text.manWhich, code: EXIT.USAGE }] };
    const def = registry.get(name);
    if (!def && !RESERVED_WORDS.includes(name)) {
      const guess = closest(registry, name);
      const hint = guess && registry.get(guess) ? ` Try man ${guess}.` : "";
      return { code: EXIT.NOT_FOUND, blocks: [{ kind: "error", text: text.manMissing(name) + hint, code: EXIT.NOT_FOUND }] };
    }
    return { code: EXIT.OK, blocks: formatMan(def, name, registry.formats) };
  }
  if (rest.length) return usageError(first, USAGE.clear);
  return { code: EXIT.OK, blocks: [], clear: true };
}

/**
 * Runs steps from readBatch() as one batch, after the client has asked
 * whoever has to agree. A step with `asked`, the question the user said yes
 * to, runs only if the command still asks it. `start(step)` is called before each step runs, and
 * its output goes to `show(step, blocks, { result?, clear? })`;
 * `formatOptions` are passed to formatResult. Stops at the first
 * step that fails and rolls back what the providers' batch hooks can undo.
 * Resolves to { code, completed, notes }: notes say how it stopped, in the
 * words of `text`.
 */
export async function runSteps(registry, steps, { caller, signal, start = () => {}, show = () => {}, formatOptions = {}, text = LINE_TEXT } = {}) {
  const total = steps.length;
  const batch = registry.startBatch({ caller, signal });
  for (const [i, step] of steps.entries()) {
    start(step);
    let code;
    if (step.words) {
      const done = await clientWord(registry, step.words, { caller, signal, run: batch.run, text });
      show(step, done.blocks, done);
      code = done.code;
    } else if (step.help) {
      show(step, formatUsage(step.def), {});
      code = EXIT.OK;
    } else {
      const result = await batch.run(step.def.name, step.input, { expect: step.def, asked: step.asked });
      show(step, formatResult(result, step.def, { ...formatOptions, json: step.json, wide: step.wide, fields: step.fields }), { result });
      code = result.code;
    }
    if (code !== EXIT.OK) {
      const { rolledBack, kept } = await batch.rollback();
      const notes = i > 0 && rolledBack.length && !kept.length
        ? [text.batchUndone(i + 1, total)]
        : [i < total - 1 && text.batchStopped(i + 1, total), kept.length && text.batchKept(kept)].filter(Boolean);
      return { code, completed: i, notes };
    }
  }
  try { await batch.commit(); } catch (err) {
    return { code: EXIT.FAILED, completed: total, notes: [], error: `${(err && err.message) || err}` };
  }
  return { code: EXIT.OK, completed: total, notes: [] };
}
