// The command line: GNU long options, POSIX-style quoting, `--` to end options.
// Sutram parses one command line. It is not a shell: no pipes, redirection,
// variables or globbing.

import { CommandError, EXIT, RESERVED_WORDS, CLIENT_OPTIONS } from "./core.js";

/**
 * Splits a line into words. Double and single quotes group words, and a
 * backslash escapes the next character outside single quotes.
 * Each token is { value, quoted }; quoted means the word starts with a quote.
 */
export function tokenize(line) {
  const tokens = [];
  let current = null;
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) { quote = null; continue; }
      if (ch === "\\" && quote === '"' && i + 1 < line.length) { current.value += line[++i]; continue; }
      current.value += ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) { tokens.push(current); current = null; }
      continue;
    }
    if (!current) current = { value: "", quoted: false };
    // A word is quoted, and so never an option, when it starts with a quote:
    // --who="Grace Hopper" is an option with a quoted value.
    if (ch === '"' || ch === "'") { quote = ch; if (!current.value) current.quoted = true; continue; }
    if (ch === "\\" && i + 1 < line.length) { current.value += line[++i]; continue; }
    current.value += ch;
  }
  if (quote) throw new CommandError(`unclosed ${quote === '"' ? "double" : "single"} quote`, EXIT.USAGE);
  if (current) tokens.push(current);
  return tokens;
}

/** Edit distance, for "did you mean". */
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/** The closest command name to what was typed, like git's "did you mean". Suggests only; never runs it. */
export function suggest(registry, words) {
  const names = [...registry.list().map((d) => d.name), ...RESERVED_WORDS];
  const tries = [words.slice(0, 3).join(" "), words.slice(0, 2).join(" "), words[0]].filter(Boolean);
  let best = null;
  for (const attempt of tries) {
    for (const name of names) {
      const score = distance(attempt, name);
      if (score <= 2 && (!best || score < best.score)) best = { name, score };
    }
  }
  return best ? best.name : null;
}

/**
 * Parses a line against the registry. The longest registered name that the
 * line starts with wins. Returns { def, input, help, json, wide, fields }, or throws a
 * CommandError with exit code 2 (usage) or 127 (not found).
 */
export function parse(registry, line) {
  const tokens = tokenize(line);
  if (!tokens.length) throw new CommandError("nothing to run", EXIT.USAGE);

  for (let k = Math.min(tokens.length, 6); k > 0; k--) {
    if (tokens.slice(0, k).some((t) => t.quoted)) continue;
    const name = tokens.slice(0, k).map((t) => t.value).join(" ").toLowerCase();
    const def = registry.get(name);
    if (!def) continue;
    return parseArguments(def, tokens.slice(k));
  }

  const words = tokens.map((t) => t.value.toLowerCase());
  const guess = suggest(registry, words);
  throw new CommandError(
    `${words.slice(0, 2).join(" ")}: command not found.${guess ? ` The most similar command is: ${guess}` : " See help."}`,
    EXIT.NOT_FOUND,
  );
}

function parseArguments(def, rest) {
  const name = def.name;
  const props = def.input.properties || {};
  const input = {};
  const positional = [];
  let help = false;
  let json = false;
  let wide = false;
  let fields = null;
  let endOfOptions = false;

  for (let i = 0; i < rest.length; i++) {
    const { value: raw, quoted } = rest[i];
    const option = !endOfOptions && !quoted;
    if (option && raw === "--") { endOfOptions = true; continue; }
    if (option && (raw === "-h" || raw === "--help")) { help = true; continue; }
    if (option && raw === "--json") { json = true; continue; }
    if (option && raw.startsWith("--json=")) {
      fields = raw.slice(7).split(",").map((f) => f.trim()).filter(Boolean);
      if (!fields.length) throw new CommandError(`${name}: --json= needs field names, such as --json=sku,price`, EXIT.USAGE);
      json = true;
      continue;
    }
    if (option && raw === "--wide") { wide = true; continue; }
    if (option && raw.startsWith("--")) {
      const m = /^--([a-z][\w-]*)(?:=([\s\S]*))?$/i.exec(raw);
      if (!m) throw new CommandError(`${name}: cannot read option ${raw}`, EXIT.USAGE);
      let [, key, val] = m;
      const negated = key.startsWith("no-") ? key.slice(3) : null;
      if (!props[key] && negated && props[negated] && props[negated].type === "boolean") {
        input[negated] = false;
        continue;
      }
      if (!props[key]) throw new CommandError(`${name}: unknown option --${key}. See ${name} -h`, EXIT.USAGE);
      if (val === undefined) {
        if (props[key].type === "boolean") { input[key] = true; continue; }
        if (i + 1 >= rest.length) throw new CommandError(`${name}: --${key} needs a value`, EXIT.USAGE);
        val = rest[++i].value;
      }
      input[key] = val;
      continue;
    }
    if (option && /^-[a-z]/i.test(raw)) throw new CommandError(`${name}: unknown option ${raw}. See ${name} -h`, EXIT.USAGE);
    positional.push(raw);
  }

  const order = def.positional || [];
  if (positional.length && !order.length) {
    throw new CommandError(`${name}: takes no positional arguments. See ${name} -h`, EXIT.USAGE);
  }
  order.forEach((key, i) => {
    if (i >= positional.length || input[key] !== undefined) return;
    // The last positional takes the rest of the line, so `nav find pour over` works without quotes.
    input[key] = i === order.length - 1 ? positional.slice(i).join(" ") : positional[i];
  });
  return { def, input, help, json, wide, fields };
}

/**
 * Splits a line into spans for syntax highlighting, covering every character,
 * so joining their text gives the line back. Never throws: a half-typed line
 * is the normal case. Each span is { text, kind }, where kind is one of
 * "space", "command" (a registered name), "client" (help, man, status,
 * clear), "unknown" (no such command), "option", "bad-option" (the command
 * has no such option), "value" (an option's value), "string" (a quoted word),
 * or "arg".
 */
export function highlight(registry, line) {
  line = String(line);
  // Words with their place in the line, by the same rules as tokenize().
  const words = [];
  let w = null;
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (!quote && /\s/.test(ch)) { if (w) { w.end = i; words.push(w); w = null; } continue; }
    if (!w) w = { start: i, value: "", quoted: false };
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"' && i + 1 < line.length) w.value += line[++i];
      else w.value += ch;
    } else if (ch === '"' || ch === "'") { quote = ch; if (i === w.start) w.quoted = true; }
    else if (ch === "\\" && i + 1 < line.length) w.value += line[++i];
    else w.value += ch;
  }
  if (w) { w.end = line.length; words.push(w); }

  const kinds = words.map(() => "arg");
  // The command: the longest registered name the line starts with.
  let def = null;
  let k = 0;
  for (let n = Math.min(words.length, 6); n > 0 && !def; n--) {
    if (words.slice(0, n).some((x) => x.quoted)) continue;
    def = registry.get(words.slice(0, n).map((x) => x.value).join(" ").toLowerCase()) || null;
    if (def) k = n;
  }
  if (def) kinds.fill("command", 0, k);
  else if (words.length && RESERVED_WORDS.includes(words[0].value.toLowerCase())) { kinds[0] = "client"; k = 1; }
  else if (words.length) {
    // Still typing a name: unknown only once no command starts with it.
    const typed = words.map((x) => x.value.toLowerCase()).join(" ") + (/\s$/.test(line) ? " " : "");
    const names = [...registry.list().map((d) => d.name), ...RESERVED_WORDS];
    if (names.some((n) => n.startsWith(typed))) kinds.fill("command");
    else kinds[0] = "unknown";
    k = words.length;
  }

  const props = (def && def.input && def.input.properties) || {};
  let endOfOptions = false;
  const spans = [];
  let at = 0;
  const push = (text, kind) => { if (text) spans.push({ text, kind }); };
  words.forEach((x, i) => {
    push(line.slice(at, x.start), "space");
    at = x.end;
    const raw = line.slice(x.start, x.end);
    if (i < k) { push(raw, kinds[i]); return; }
    if (!endOfOptions && !x.quoted && raw.startsWith("-")) {
      if (raw === "--") { endOfOptions = true; push(raw, "option"); return; }
      const eq = raw.indexOf("=");
      const name = (eq < 0 ? raw : raw.slice(0, eq)).replace(/^--?/, "");
      const known = raw === "-h" || CLIENT_OPTIONS.includes(name) || !def || props[name]
        || (name.startsWith("no-") && props[name.slice(3)] && props[name.slice(3)].type === "boolean");
      push(eq < 0 ? raw : raw.slice(0, eq + 1), known ? "option" : "bad-option");
      if (eq >= 0) push(raw.slice(eq + 1), /["']/.test(raw.slice(eq + 1)) ? "string" : "value");
      return;
    }
    push(raw, x.quoted ? "string" : "arg");
  });
  push(line.slice(at), "space");
  return spans;
}
