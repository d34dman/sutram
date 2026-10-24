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
import { fileURLToPath } from "node:url";

// From the module URL: the dirname shortcut needs Node 20.11, and engines says >=20.
const root = fileURLToPath(new URL("..", import.meta.url));
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
// Both bundles start with this; the license line is the notice MIT asks for.
const banner = [
  `// ${pkg.name} ${pkg.version}: src/browser.js bundled by scripts/build.mjs. Do not edit; run npm run build.`,
  `// ${pkg.homepage.replace(/#.*$/, "")} · ${pkg.license}`,
].join("\n");
const body = [
  ...chunks,
  `export default __browser.default;`,
  `export const { ${exported.join(", ")} } = __index;`,
  // What the sutram/client, sutram/events, sutram/webmcp and sutram/console entry points export.
  ...["client", "events", "webmcp", "console"].map((m) => `export const { ${exportsOf[m].join(", ")} } = __${m};`),
  "",
].join("\n\n");

const out = `${banner}\n\n${body}`;
const min = `${banner}\n${strip(body)}`;
const dist = resolve(root, "dist");
mkdirSync(dist, { recursive: true });
writeFileSync(resolve(dist, "sutram.js"), out);
writeFileSync(resolve(dist, "sutram.min.js"), min);
const size = (s) => `${(s.length / 1024).toFixed(1)} kB, ${(gzipSync(s).length / 1024).toFixed(1)} kB gzipped`;
console.log(`build: wrote dist/sutram.js (${order.map((m) => m.name).join(", ")}; ${size(out)}) and dist/sutram.min.js (${size(min)})`);

// Kits: one file each, for hosts that load only the kits a page uses (a
// Drupal library per kit). A kit file has no copy of Sutram: it takes what
// it imports from the globalThis.Sutram that dist/sutram.js defined, so it
// uses the page's one registry, and adds itself to Sutram.kits. What the
// kits share (src/kit.js) is copied into each.
const KITS = ["nav", "page", "user", "messages", "lists", "forms"];
const KIT_IMPORTS = {
  CommandError: "Sutram.CommandError",
  EXIT: "Sutram.EXIT",
  getRegistry: "() => Sutram.registry",
  getEvents: "() => Sutram.events",
};
const kitHelpers = readFileSync(resolve(root, "src", "kit.js"), "utf8")
  .replace(/^export\s+((?:async\s+)?(?:function|const)\s)/gm, "$1")
  .replace(/^\/\/.*\n/gm, "")
  .trim();
for (const kit of KITS) {
  const text = readFileSync(resolve(root, "src", `${kit}.js`), "utf8");
  const s = text
    .replace(/^import\s*\{([^}]*)\}\s*from\s*"\.\/kit\.js";/gm, () => `// src/kit.js\n${kitHelpers}`)
    .replace(/^import\s*\{([^}]*)\}\s*from\s*"\.\/(core|events)\.js";/gm, (_, list) => list.split(",").map((n) => n.trim()).filter(Boolean).map((n) => {
      if (!KIT_IMPORTS[n]) throw new Error(`build: src/${kit}.js imports ${n}, which dist/sutram.js does not expose on globalThis.Sutram`);
      return `const ${n} = ${KIT_IMPORTS[n]};`;
    }).join("\n"))
    .replace(new RegExp(`^export\\s+function\\s+${kit}\\b`, "m"), `function ${kit}`);
  const left = s.match(/^\s*(import|export)\b.*$/m);
  if (left) throw new Error(`build: src/${kit}.js: cannot bundle "${left[0].trim()}"`);
  const kitBanner = [
    `// ${pkg.name} ${pkg.version}: the ${kit} kit (src/${kit}.js) for pages that load dist/sutram.js. Do not edit; run npm run build.`,
    `// ${pkg.homepage.replace(/#.*$/, "")} · ${pkg.license}`,
  ].join("\n");
  const kitBody = [
    `const Sutram = globalThis.Sutram;`,
    `if (!Sutram || !Sutram.kits) throw new Error("sutram: load dist/sutram.js ${pkg.version} before the ${kit} kit");`,
    s.trim(),
    `Sutram.kits.${kit} = ${kit};`,
    `export { ${kit} };`,
    "",
  ].join("\n\n");
  writeFileSync(resolve(dist, `${kit}.js`), `${kitBanner}\n\n${kitBody}`);
  writeFileSync(resolve(dist, `${kit}.min.js`), `${kitBanner}\n${strip(kitBody)}`);
  console.log(`build: wrote dist/${kit}.js (${size(kitBody)}) and dist/${kit}.min.js`);
}
