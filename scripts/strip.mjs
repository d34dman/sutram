// The minifier behind dist/sutram.min.js. Kept apart from build.mjs so tests can import it.

/**
 * Removes comments, indentation and blank lines, and nothing else: no
 * renaming, so a stack trace still reads. A small scanner keeps strings,
 * template literals (with their ${} expressions) and regular expressions
 * exactly as written. Line breaks stay, so automatic semicolons still apply.
 */
export function strip(code) {
  let out = "";
  const modes = ["code"]; // code | template; a template's ${ pushes "code"
  const braces = [0];      // open braces per code level, to find the } that ends ${
  let lastSignificant = "";  // last code character that is not a space, for regex detection
  let lastWord = "";
  const mode = () => modes[modes.length - 1];
  const REGEX_AFTER = "(,=:[!&|?{};+-*%<>~^";
  const REGEX_WORDS = new Set(["return", "typeof", "case", "in", "of", "new", "delete", "void", "throw", "else", "do", "yield", "await"]);
  // Code arrives a character at a time, so the last word is built up across calls:
  // an identifier character extends it, anything else that is not a space ends it.
  let inWord = false;
  const emitCode = (text) => {
    out += text;
    const t = text.trimEnd();
    if (!t) { inWord = false; return; }
    lastSignificant = t[t.length - 1];
    const m = /([A-Za-z_$][\w$]*)$/.exec(t);
    if (!m) { lastWord = ""; inWord = false; return; }
    lastWord = inWord && m[1] === t ? lastWord + t : m[1];
    inWord = t === text;
  };
  const newline = () => {
    inWord = false;
    out = out.replace(/[ \t]+$/, "");
    if (out && !out.endsWith("\n")) out += "\n";
  };
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    if (mode() === "template") {
      if (ch === "\\") { out += code.slice(i, i + 2); i += 2; continue; }
      if (ch === "`") { out += ch; modes.pop(); braces.pop(); lastSignificant = "`"; lastWord = ""; inWord = false; i++; continue; }
      if (ch === "$" && code[i + 1] === "{") { out += "${"; modes.push("code"); braces.push(0); i += 2; continue; }
      out += ch; i++; continue;
    }
    // code
    if (ch === "/" && code[i + 1] === "/") { while (i < n && code[i] !== "\n") i++; continue; }
    if (ch === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      const body = code.slice(i, end < 0 ? n : end + 2);
      i = end < 0 ? n : end + 2;
      inWord = false;
      if (body.includes("\n")) newline(); else if (!/\s$/.test(out)) out += " ";
      continue;
    }
    if (ch === "\n") { newline(); i++; while (i < n && (code[i] === " " || code[i] === "\t")) i++; continue; }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && code[j] !== ch) j += code[j] === "\\" ? 2 : 1;
      emitCode(code.slice(i, j + 1)); i = j + 1; continue;
    }
    if (ch === "`") { inWord = false; out += ch; modes.push("template"); braces.push(0); i++; continue; }
    if (ch === "/" && (!lastSignificant || REGEX_AFTER.includes(lastSignificant) || REGEX_WORDS.has(lastWord))) {
      let j = i + 1;
      let inClass = false;
      while (j < n && (inClass || code[j] !== "/")) {
        if (code[j] === "\\") j++;
        else if (code[j] === "[") inClass = true;
        else if (code[j] === "]") inClass = false;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(code[j])) j++;
      emitCode(code.slice(i, j)); i = j; continue;
    }
    if (ch === "{") braces[braces.length - 1]++;
    if (ch === "}") {
      if (modes.length > 1 && braces[braces.length - 1] === 0) { out += "}"; modes.pop(); braces.pop(); i++; continue; }
      braces[braces.length - 1]--;
    }
    if (ch === " " || ch === "\t") { if (!/[ \t\n]$/.test(out)) out += " "; inWord = false; i++; continue; }
    emitCode(ch); i++;
  }
  return out.trim() + "\n";
}
