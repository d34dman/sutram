// The command line: GNU long options, POSIX-style quoting, heredocs, `--` to
// end options. Sutram parses one command line. It is not a shell: no pipes,
// redirection, variables or globbing.

import { CommandError, EXIT, RESERVED_WORDS, CLIENT_OPTIONS, MAX_NAME_WORDS } from "./core.js";

const own = (obj, key) => !!obj && Object.hasOwn(obj, key);

// A heredoc: <<END (or <<'END', <<"END") as the last word of a line. The lines
// after it, up to a line holding only END, are one value, taken as written:
// quotes and backslashes in it mean nothing, so HTML needs no escaping.
const HEREDOC = /^<<(?:([A-Za-z_]\w*)|'([A-Za-z_]\w*)'|"([A-Za-z_]\w*)")[ \t]*(?=\r?\n|$)/;

/**
 * The heredoc opening at text[i], or null. Returns { tag, value, end, open }:
 * end is the index just after the closing line (its line break excluded), and
 * open is true when the text ends before the closing line.
 */
function heredocAt(text, i) {
  const m = HEREDOC.exec(text.slice(i));
  if (!m) return null;
  const tag = m[1] || m[2] || m[3];
  const nl = text.indexOf("\n", i + m[0].length);
  if (nl < 0) return { tag, value: "", end: text.length, open: true };
  const start = nl + 1;
  for (let at = start; at <= text.length;) {
    let le = text.indexOf("\n", at);
    if (le < 0) le = text.length;
    if (text.slice(at, le).trim() === tag) {
      const value = text.slice(start, at).replace(/\r\n/g, "\n").replace(/\n$/, "");
      return { tag, value, end: text[le - 1] === "\r" ? le - 1 : le, open: false };
    }
    if (le === text.length) break;
    at = le + 1;
  }
  return { tag, value: text.slice(start).replace(/\r\n/g, "\n"), end: text.length, open: true };
}

/** The length of a line continuation (backslash, then a line break) at text[i], or 0. */
const continuation = (text, i) => (text[i] !== "\\" ? 0 : text[i + 1] === "\n" ? 2 : text[i + 1] === "\r" && text[i + 2] === "\n" ? 3 : 0);

/** Whether a heredoc may open after this much of a word: at its start, or after --key= */
const heredocMayOpen = (word) => !word || /^--[a-z][\w-]*=$/i.test(word);

/**
 * Splits a line into words. Double and single quotes group words, and a
 * backslash escapes the next character outside single quotes. A backslash
 * at the end of a line joins the next line to it, as in a shell. A heredoc
 * (<<END ending a line) makes the lines up to END one word.
 * Each token is { value, quoted }; quoted means the word starts with a quote
 * or is a heredoc.
 */
export function tokenize(line) {
  const tokens = [];
  let current = null;
  let quote = null;
  let quoteAt = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const joined = quote !== "'" && continuation(line, i);
    if (joined) { i += joined - 1; continue; }
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
    if (ch === "<" && heredocMayOpen(current ? current.value : "")) {
      const hd = heredocAt(line, i);
      if (hd) {
        if (hd.open) throw new CommandError(`unclosed heredoc: end it with a line holding only ${hd.tag}`, EXIT.USAGE);
        if (!current) current = { value: "", quoted: true, start: i };
        current.value += hd.value;
        i = hd.end - 1;
        continue;
      }
    }
    if (!current) current = { value: "", quoted: false, start: i };
    // A word is quoted, and so never an option, when it starts with a quote:
    // --who="Grace Hopper" is an option with a quoted value.
    if (ch === '"' || ch === "'") { quote = ch; quoteAt = i; if (!current.value) current.quoted = true; continue; }
    if (ch === "\\" && i + 1 < line.length) { current.value += line[++i]; continue; }
    current.value += ch;
  }
  if (quote) {
    // Name the word, so `don't` in a rest-of-line value is easy to spot.
    const after = line.slice(quoteAt + 1).search(/\s/);
    const word = line.slice(current.start, after < 0 ? line.length : quoteAt + 1 + after);
    const fix = quote === "'"
      ? "put text with an apostrophe in double quotes, or write \\'"
      : "close it, or write \\\" for a quote inside the text";
    throw new CommandError(`unclosed ${quote === '"' ? "double" : "single"} quote in ${word}: ${fix}`, EXIT.USAGE);
  }
  if (current) tokens.push(current);
  return tokens.map(({ value, quoted }) => ({ value, quoted }));
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

  for (let k = Math.min(tokens.length, MAX_NAME_WORDS); k > 0; k--) {
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

/** A boolean property, nullable or not: --key and --no-key. */
const isFlag = (prop) => [].concat(prop.type).includes("boolean");

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
      if (!own(props, key) && negated && own(props, negated) && isFlag(props[negated])) {
        input[negated] = false;
        continue;
      }
      if (!own(props, key)) throw new CommandError(`${name}: unknown option --${key}. See ${name} -h`, EXIT.USAGE);
      if (val === undefined) {
        if (isFlag(props[key])) {
          const next = rest[i + 1];
          if (next && !next.quoted && /^(true|false)$/i.test(next.value)) {
            throw new CommandError(`${name}: --${key} takes no value. Write --${key} or --no-${key}, or --${key}=${next.value.toLowerCase()}`, EXIT.USAGE);
          }
          input[key] = true;
          continue;
        }
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
  // Positional words fill the positional keys not given as options, in order.
  // The last positional key takes the rest of the line, so `nav find pour over`
  // works without quotes. A word with no key left is an error, never dropped.
  const free = order.filter((key) => !own(input, key));
  const last = order[order.length - 1];
  free.forEach((key, i) => {
    if (i >= positional.length) return;
    input[key] = key === last ? positional.slice(i).join(" ") : positional[i];
  });
  const taken = free.length && free[free.length - 1] === last ? positional.length : free.length;
  if (positional.length > taken) {
    throw new CommandError(`${name}: unexpected argument "${positional[taken]}". See ${name} -h`, EXIT.USAGE);
  }
  return { def, input, help, json, wide, fields };
}

/**
 * Words with their place in the line, by the same rules as tokenize(), but
 * never throwing. Returns { words: [{ start, end, value, quoted, heredoc }], quote },
 * where quote is what is still open at the end of the line (", ', <<TAG, or
 * \ for a line that ends in a continuation), or null.
 */
function scan(line) {
  const words = [];
  let w = null;
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const joined = quote !== "'" && continuation(line, i);
    if (joined) { i += joined - 1; continue; }
    if (ch === "\\" && i === line.length - 1 && quote !== "'") { if (w) { w.end = i; words.push(w); } return { words, quote: quote || "\\" }; }
    if (!quote && /\s/.test(ch)) { if (w) { w.end = i; words.push(w); w = null; } continue; }
    if (!quote && ch === "<" && heredocMayOpen(w ? w.value : "")) {
      const hd = heredocAt(line, i);
      if (hd) {
        if (!w) w = { start: i, value: "", quoted: true };
        w.value += hd.value;
        w.heredoc = true;
        if (hd.open) { w.end = line.length; words.push(w); return { words, quote: `<<${hd.tag}` }; }
        i = hd.end - 1;
        continue;
      }
    }
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
  return { words, quote };
}

/** What a text leaves open at its end (", ' or <<TAG for a heredoc), or null. Enter inside one starts a new line in the value. */
export const openQuote = (text) => scan(String(text)).quote;

/**
 * Splits pasted text into command lines. A line break inside quotes or a
 * heredoc belongs to the value, so a multi-line value stays one command, and
 * a backslash at the end of a line joins the next line to it.
 * Lines starting with # are comments; their quotes do not count.
 */
export function splitLines(text) {
  text = String(text);
  const lines = [];
  let cur = "";
  let quote = null;
  let comment = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\r" && text[i + 1] === "\n") continue;
    if (comment) {
      if (ch === "\n") { lines.push(cur); cur = ""; comment = false; } else cur += ch;
      continue;
    }
    const joined = quote !== "'" && continuation(text, i);
    if (joined) { cur += "\\\n"; i += joined - 1; continue; }
    if (quote) {
      if (ch === "\\" && quote === '"' && i + 1 < text.length) { cur += ch + text[++i]; continue; }
      if (ch === quote) quote = null;
      cur += ch;
      continue;
    }
    if (ch === "<") {
      const word = /(?:^|\s)(\S*)$/.exec(cur)[1];
      const hd = heredocMayOpen(word) ? heredocAt(text, i) : null;
      if (hd) { cur += text.slice(i, hd.end).replace(/\r\n/g, "\n"); i = hd.end - 1; continue; }
    }
    if (ch === "#" && !cur.trim()) comment = true;
    else if (ch === "\\" && i + 1 < text.length && text[i + 1] !== "\n") { cur += ch + text[++i]; continue; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "\n") { lines.push(cur); cur = ""; continue; }
    cur += ch;
  }
  lines.push(cur);
  return lines;
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
  const { words } = scan(line);

  const kinds = words.map(() => "arg");
  // The command: the longest registered name the line starts with.
  let def = null;
  let k = 0;
  for (let n = Math.min(words.length, MAX_NAME_WORDS); n > 0 && !def; n--) {
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
      const known = raw === "-h" || CLIENT_OPTIONS.includes(name) || !def || own(props, name)
        || (name.startsWith("no-") && own(props, name.slice(3)) && isFlag(props[name.slice(3)]));
      push(eq < 0 ? raw : raw.slice(0, eq + 1), known ? "option" : "bad-option");
      if (eq >= 0) push(raw.slice(eq + 1), x.heredoc || /["']/.test(raw.slice(eq + 1)) ? "string" : "value");
      return;
    }
    push(raw, x.quoted ? "string" : "arg");
  });
  push(line.slice(at), "space");
  return spans;
}

/** What the words clients own do, for completion. */
const CLIENT_WORDS = Object.freeze({
  help: "List the commands on this page",
  man: "Read a command's manual",
  status: "Show what every provider reports",
  clear: "Clear the screen",
});

const CLIENT_OPTION_HELP = Object.freeze({
  "--help": "Show the command's usage",
  "--json": "Print the data as JSON, or only some fields with --json=a,b",
  "--wide": "Show every column",
});

/** Quotes a completed value when a shell user would have to. */
function quoteWord(s) {
  return s !== "" && /^[\w@%+=:,./-]+$/.test(s) && !s.startsWith("-") ? s : `"${s.replace(/(["\\])/g, "\\$1")}"`;
}

/** Next words of command names that start with what was typed. */
function nameItems(registry, typed, partial, withClientWords) {
  const prefix = [...typed, partial.toLowerCase()].join(" ");
  const at = typed.length;
  const byWord = new Map();
  for (const def of registry.list()) {
    if (!def.name.startsWith(prefix)) continue;
    const parts = def.name.split(" ");
    if (parts.length <= at) continue;
    const word = parts[at];
    if (!byWord.has(word)) byWord.set(word, []);
    byWord.get(word).push({ def, whole: parts.length === at + 1 });
  }
  const items = [...byWord.entries()].map(([word, hits]) => ({
    value: `${word} `,
    label: word,
    description: hits.length === 1 && hits[0].whole ? hits[0].def.description : `${hits.length} commands`,
  }));
  if (withClientWords && !at) {
    for (const [word, description] of Object.entries(CLIENT_WORDS)) {
      if (word.startsWith(prefix) && !byWord.has(word)) items.push({ value: `${word} `, label: word, description });
    }
  }
  return items.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Completions for the end of a line: command names, option names, and
 * values. Values come from the schema (enum, boolean, examples) and from the
 * command's own suggest(key, partial, { input, signal }), which may be async
 * and returns strings or { value, label?, description? }.
 *
 * Resolves to { start, end, items }: replace line.slice(start, end) with an
 * item's value, which is quoted where needed and ends in a space unless more
 * typing is expected (as after --key=).
 */
export async function complete(registry, line, { signal, limit = 50 } = {}) {
  line = String(line);
  const { words, quote } = scan(line);
  // Inside a heredoc everything is the value: nothing to complete.
  if (quote && quote.startsWith("<<")) return { start: line.length, end: line.length, items: [] };
  const atBreak = !quote && (!line || /\s$/.test(line));
  const current = atBreak || !words.length ? { start: line.length, end: line.length, value: "", quoted: false } : words[words.length - 1];
  const before = atBreak ? words : words.slice(0, -1);
  const lowered = before.map((w) => w.value.toLowerCase());
  const done = (items) => ({ start: current.start, end: line.length, items: items.slice(0, limit) });

  if (lowered.length && (lowered[0] === "help" || lowered[0] === "man")) {
    return done(nameItems(registry, lowered.slice(1), current.value, false));
  }
  if (lowered.length && RESERVED_WORDS.includes(lowered[0])) return done([]);

  let def = null;
  let k = 0;
  for (let n = Math.min(before.length, MAX_NAME_WORDS); n > 0 && !def; n--) {
    if (before.slice(0, n).some((x) => x.quoted)) continue;
    def = registry.get(lowered.slice(0, n).join(" ")) || null;
    if (def) k = n;
  }
  if (!def) return done(current.quoted ? [] : nameItems(registry, lowered, current.value, true));

  const props = (def.input && def.input.properties) || {};
  const order = def.positional || [];
  const args = before.slice(k);
  const asOption = new Set(); // keys given as --key
  let endOfOptions = false;
  let pendingKey = null;
  let positionals = 0;
  for (const w of args) {
    const raw = line.slice(w.start, w.end);
    if (pendingKey) { pendingKey = null; continue; }
    if (!endOfOptions && !w.quoted && raw === "--") { endOfOptions = true; continue; }
    if (!endOfOptions && !w.quoted && raw.startsWith("-")) {
      const m = /^--([a-z][\w-]*)(=?)/i.exec(raw);
      if (m) {
        const negated = m[1].startsWith("no-") && !own(props, m[1]) && own(props, m[1].slice(3)) ? m[1].slice(3) : null;
        asOption.add(negated || m[1]);
        if (!m[2] && !negated && own(props, m[1]) && !isFlag(props[m[1]])) pendingKey = m[1];
      }
      continue;
    }
    positionals++;
  }
  // As in parse: positional words fill the positional keys not given as options, in order; the last takes the rest.
  const free = order.filter((key) => !asOption.has(key));
  const positionalKey = (i) => free[Math.min(i, free.length - 1)];
  const given = new Set([...asOption, ...free.slice(0, positionals)]);

  // The input typed so far, for suggest(): parse leniently, never fail.
  let input = {};
  try {
    const from = args.length ? args[0].start : current.start;
    input = parseArguments(def, tokenize(line.slice(from, current.start))).input;
  } catch { /* half-typed */ }

  const values = async (key, partial, prefix) => {
    const prop = props[key] || {};
    const fixed = [...(prop.enum || (isFlag(prop) ? [true, false] : [])), ...(prop.examples || [])];
    const out = fixed.map(String).filter((v) => v.toLowerCase().startsWith(partial.toLowerCase())).map((v) => ({ value: v }));
    if (def.suggest) {
      try {
        const got = (await def.suggest(key, partial, { input, signal })) || [];
        for (const g of got) out.push(g !== null && typeof g === "object" ? { value: String(g.value), label: g.label, description: g.description } : { value: String(g) });
      } catch (err) { console.warn(`sutram: ${def.name} suggest failed: ${err && err.message}`); }
    }
    const seen = new Set();
    return out.filter((o) => !seen.has(o.value) && seen.add(o.value))
      .map((o) => ({ value: `${prefix}${quoteWord(o.value)} `, label: o.label || o.value, description: o.description || "" }));
  };

  const options = (typed) => {
    const items = Object.keys(props).filter((key) => !given.has(key)).map((key) => ({
      value: isFlag(props[key]) ? `--${key} ` : `--${key}=`,
      label: `--${key}`,
      description: props[key].description || "",
    }));
    for (const [opt, description] of Object.entries(CLIENT_OPTION_HELP)) items.push({ value: opt === "--json" ? opt : `${opt} `, label: opt, description });
    return items.filter((i) => i.label.startsWith(typed));
  };

  const raw = line.slice(current.start);
  if (pendingKey && !(raw.startsWith("-") && !current.quoted)) return done(await values(pendingKey, current.value, ""));
  if (!endOfOptions && !current.quoted && raw.startsWith("--") && raw.includes("=")) {
    const eq = current.value.indexOf("=");
    return done(await values(current.value.slice(2, eq), current.value.slice(eq + 1), current.value.slice(0, eq + 1)));
  }
  if (!endOfOptions && !current.quoted && raw.startsWith("-")) return done(options(raw));

  const key = free.length ? positionalKey(positionals) : undefined;
  if (key) {
    const items = await values(key, current.value, "");
    if (items.length || current.value) return done(items);
  }
  return done(current.value || endOfOptions ? [] : options(""));
}
