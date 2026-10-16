// Builds dist/sutram.js: src/browser.js and everything it imports, as one ES
// module with no imports, for hosts that load a single file (a Drupal
// library, a <script type="module"> tag). No dependencies: each module of
// src/ becomes one closure, in dependency order. Also dist/sutram.min.js,
// the same code without comments and indentation (see strip()).
//
//   npm run build
import { gzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const FROM = /from\s*"\.\/(\w+)\.js";/;

const order = [];
const seen = new Set();
function visit(name) {
  if (seen.has(name)) return;
  seen.add(name);
  const text = readFileSync(resolve(root, "src", `${name}.js`), "utf8");
  for (const [, dep] of text.matchAll(new RegExp(FROM, "g"))) visit(dep);
  order.push({ name, text });
}
visit("browser");

// `a, b as c` → `a, b: c`
const destructure = (list) => list.split(",").map((s) => s.trim()).filter(Boolean)
  .map((s) => s.replace(/^(\w+)\s+as\s+(\w+)$/, "$1: $2")).join(", ");

const chunks = [];
const exportsOf = {};
for (const { name, text } of order) {
  const names = [];
  let s = text
    .replace(/^import\s*\*\s*as\s+(\w+)\s*from\s*"\.\/(\w+)\.js";/gm, "const $1 = __$2;")
    .replace(/^import\s*\{([^}]*)\}\s*from\s*"\.\/(\w+)\.js";/gm, (_, list, dep) => `const { ${destructure(list)} } = __${dep};`)
    .replace(/^export\s*\{([^}]*)\}\s*from\s*"\.\/(\w+)\.js";/gm, (_, list, dep) => {
      names.push(...list.split(",").map((n) => n.trim()).filter(Boolean));
      return `const { ${destructure(list)} } = __${dep};`;
    })
    .replace(/^export\s+default\s+/gm, () => { names.push("default: __default"); return "const __default = "; })
    .replace(/^export\s+((?:async\s+)?(?:function\*?|const|let|class)\s+(\w+))/gm, (_, decl, id) => { names.push(id); return decl; });
  const left = s.match(/^\s*(import|export)\b.*$/m);
  if (left) throw new Error(`build: src/${name}.js: cannot bundle "${left[0].trim()}"`);
  exportsOf[name] = names;
  chunks.push(`// src/${name}.js\nconst __${name} = (() => {\n${s.trimEnd()}\nreturn { ${names.join(", ")} };\n})();`);
}

const api = order.find((m) => m.name === "index");
const exported = [...api.text.matchAll(/^export\s*\{([^}]*)\}/gm)].flatMap(([, l]) => l.split(",").map((n) => n.trim()).filter(Boolean));
const out = [
  `// ${pkg.name} ${pkg.version}: src/browser.js bundled by scripts/build.mjs. Do not edit; run npm run build.`,
  `// ${pkg.homepage.replace(/#.*$/, "")} · ${pkg.license}`,
  ...chunks,
  `export default __browser.default;`,
  `export const { ${exported.join(", ")} } = __index;`,
  // What the sutram/client, sutram/events, sutram/webmcp and sutram/console entry points export.
  ...["client", "events", "webmcp", "console"].map((m) => `export const { ${exportsOf[m].join(", ")} } = __${m};`),
  "",
].join("\n\n");

/**
 * Removes comments, indentation and blank lines, and nothing else: no
 * renaming, so a stack trace still reads. A small scanner keeps strings,
 * template literals (with their ${} expressions) and regular expressions
 * exactly as written. Line breaks stay, so automatic semicolons still apply.
 */
function strip(code) {
  let out = "";
  const modes = ["code"]; // code | template; a template's ${ pushes "code"
  const braces = [0];      // open braces per code level, to find the } that ends ${
  let lastSignificant = "";  // last code character that is not a space, for regex detection
  let lastWord = "";
  const mode = () => modes[modes.length - 1];
  const REGEX_AFTER = "(,=:[!&|?{};+-*%<>~^";
  const REGEX_WORDS = new Set(["return", "typeof", "case", "in", "of", "new", "delete", "void", "throw", "else", "do", "yield", "await"]);
  const emitCode = (text) => {
    out += text;
    const t = text.trimEnd();
    if (t) { lastSignificant = t[t.length - 1]; const m = /([A-Za-z_$][\w$]*)$/.exec(t); lastWord = m ? m[1] : ""; }
  };
  const newline = () => {
    out = out.replace(/[ \t]+$/, "");
    if (out && !out.endsWith("\n")) out += "\n";
  };
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    if (mode() === "template") {
      if (ch === "\\") { out += code.slice(i, i + 2); i += 2; continue; }
      if (ch === "`") { out += ch; modes.pop(); braces.pop(); lastSignificant = "`"; lastWord = ""; i++; continue; }
      if (ch === "$" && code[i + 1] === "{") { out += "${"; modes.push("code"); braces.push(0); i += 2; continue; }
      out += ch; i++; continue;
    }
    // code
    if (ch === "/" && code[i + 1] === "/") { while (i < n && code[i] !== "\n") i++; continue; }
    if (ch === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      const body = code.slice(i, end < 0 ? n : end + 2);
      i = end < 0 ? n : end + 2;
      if (body.includes("\n")) newline(); else if (!/\s$/.test(out)) out += " ";
      continue;
    }
    if (ch === "\n") { newline(); i++; while (i < n && (code[i] === " " || code[i] === "\t")) i++; continue; }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && code[j] !== ch) j += code[j] === "\\" ? 2 : 1;
      emitCode(code.slice(i, j + 1)); i = j + 1; continue;
    }
    if (ch === "`") { out += ch; modes.push("template"); braces.push(0); i++; continue; }
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
    if (ch === " " || ch === "\t") { if (!/[ \t\n]$/.test(out)) out += " "; i++; continue; }
    emitCode(ch); i++;
  }
  return out.trim() + "\n";
}

const banner = out.split("\n").slice(0, 2).join("\n");
const min = `${banner}\n${strip(out.split("\n").slice(2).join("\n"))}`;
const dist = resolve(root, "dist");
mkdirSync(dist, { recursive: true });
writeFileSync(resolve(dist, "sutram.js"), out);
writeFileSync(resolve(dist, "sutram.min.js"), min);
const size = (s) => `${(s.length / 1024).toFixed(1)} kB, ${(gzipSync(s).length / 1024).toFixed(1)} kB gzipped`;
console.log(`build: wrote dist/sutram.js (${order.map((m) => m.name).join(", ")}; ${size(out)}) and dist/sutram.min.js (${size(min)})`);
