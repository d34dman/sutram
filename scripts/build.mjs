// Builds dist/sutram.js: src/browser.js and everything it imports, as one ES
// module with no imports, for hosts that load a single file (a Drupal
// library, a <script type="module"> tag). No dependencies: each module of
// src/ becomes one closure, in dependency order. Also dist/sutram.min.js,
// the same code without comments and indentation (see strip.mjs).
//
//   npm run build
import { gzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { strip } from "./strip.mjs";

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

const banner = out.split("\n").slice(0, 2).join("\n");
const min = `${banner}\n${strip(out.split("\n").slice(2).join("\n"))}`;
const dist = resolve(root, "dist");
mkdirSync(dist, { recursive: true });
writeFileSync(resolve(dist, "sutram.js"), out);
writeFileSync(resolve(dist, "sutram.min.js"), min);
const size = (s) => `${(s.length / 1024).toFixed(1)} kB, ${(gzipSync(s).length / 1024).toFixed(1)} kB gzipped`;
console.log(`build: wrote dist/sutram.js (${order.map((m) => m.name).join(", ")}; ${size(out)}) and dist/sutram.min.js (${size(min)})`);
