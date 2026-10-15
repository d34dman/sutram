// Builds dist/sutram.js: src/browser.js and everything it imports, as one ES
// module with no imports, for hosts that load a single file (a Drupal
// library, a <script type="module"> tag). No dependencies: each module of
// src/ becomes one closure, in dependency order.
//
//   npm run build
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
  "",
].join("\n\n");

const target = resolve(root, "dist/sutram.js");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, out);
console.log(`build: wrote dist/sutram.js (${order.map((m) => m.name).join(", ")}; ${(out.length / 1024).toFixed(1)} kB)`);
