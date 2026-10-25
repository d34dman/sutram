// The documentation build. One source, docs/*.md, for people and agents.
//
//   node scripts/docs.mjs              regenerate the committed generated files
//   node scripts/docs.mjs --check      fail when a committed generated file is stale
//   node scripts/docs.mjs --site[=dir] also build the website's docs into dir (default site/)
//
// Committed, because npm and GitHub readers see them too:
//   docs/reference/api.md             from types/*.d.ts, so the reference cannot fall behind
//   docs/measurements.md              the table between its markers, from scripts/measure.mjs
//   skills/use-sutram-page/SKILL.md   from DISCOVERY_RULES in src/prompt.js
//   docs/llms.txt                     the llms.txt index (https://llmstxt.org/)
//
// Built for the website only (not committed): docs/**/*.html with a .md copy
// of each page next to it, llms.txt, llms-full.txt, sitemap.xml, and the
// examples that need the bundled build.
//
// No dependencies: the Markdown renderer below covers what docs/ uses.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DISCOVERY_RULES } from "../src/prompt.js";
import { fileURLToPath } from "node:url";

// From the module URL: the dirname shortcut needs Node 20.11, and engines says >=20.
const root = fileURLToPath(new URL("..", import.meta.url));
const SITE = "https://d34dman.github.io/sutram/";
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const read = (p) => readFileSync(resolve(root, p), "utf8");

const NAV = [
  { title: "Get started", pages: ["index", "quick-start", "install", "drupal"] },
  { title: "Build commands", pages: ["guides/write-a-provider", "guides/nav-kit", "guides/page-kit", "guides/user-kit", "guides/messages-kit", "guides/lists-kit", "guides/forms-kit", "concepts/commands", "guides/descriptions", "guides/errors", "concepts/annotations-and-policy", "guides/testing"] },
  { title: "How agents reach them", pages: ["guides/webmcp", "guides/console", "guides/agent-prompt", "concepts/discovery"] },
  { title: "Going further", pages: ["guides/forms", "guides/drafts-and-saving", "concepts/batches", "concepts/results", "concepts/formats", "concepts/events"] },
  { title: "Reference", pages: ["reference/api", "reference/command-line"] },
  { title: "About", pages: ["why", "measurements", "design"], optional: ["design"] },
];
const ORDER = NAV.flatMap((s) => s.pages);

// --- Generated files ---------------------------------------------------------

// Long declarations read badly on one line: put one parameter (or interface
// member) per line. Splits only at commas and semicolons outside brackets.
function splitTop(text, sep) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if ("([{<".includes(ch)) depth++;
    else if (")]}".includes(ch) || (ch === ">" && text[i - 1] !== "=")) depth--;
    else if (ch === sep && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}
function wrapDeclaration(line, max = 84) {
  if (line.length <= max || /^\s*(\/\/|\/\*\*|\*)/.test(line)) return line;
  const indent = line.match(/^\s*/)[0];
  const iface = line.match(/^(\s*(?:export )?interface [^{]+)\{ (.*) \}$/);
  if (iface) return `${iface[1]}{\n${splitTop(iface[2], ";").map((m) => `${indent}  ${m};`).join("\n")}\n${indent}}`;
  // A function's parameters, one per line.
  const open = line.indexOf("(");
  const close = open < 0 ? -1 : matching(line, open);
  if (close > 0) {
    const params = splitTop(line.slice(open + 1, close), ",");
    if (params.length > 1) {
      return `${line.slice(0, open + 1)}\n${params.map((p) => wrapDeclaration(`${indent}  ${p},`, max)).join("\n")}\n${indent}${line.slice(close)}`;
    }
  }
  // A union type, one member per line.
  const union = line.match(/^(\s*(?:export )?type [^=]+=)(.*?)(;?)$/) || line.match(/^(.*\)):\s*(.*?)(;?)$/);
  if (union && splitTop(union[2], "|").length > 2) {
    const head = union[1].trimEnd() + (union[1].trimEnd().endsWith(")") ? ":" : "");
    return `${head}\n${splitTop(union[2], "|").map((m) => `${indent}  | ${m}`).join("\n")}${union[3]}`;
  }
  // The longest inline object type, one member per line.
  let best = null;
  for (let i = line.indexOf("{ "); i >= 0; i = line.indexOf("{ ", i + 1)) {
    const end = matching(line, i);
    if (end > 0 && line.slice(i, end).includes(";") && (!best || end - i > best[1] - best[0])) best = [i, end];
  }
  if (best) {
    const members = splitTop(line.slice(best[0] + 1, best[1]), ";");
    return `${line.slice(0, best[0] + 1)}\n${members.map((m) => wrapDeclaration(`${indent}  ${m};`, max)).join("\n")}\n${indent}${line.slice(best[1])}`;
  }
  return line;
}
function matching(text, open) {
  const pairs = { "(": ")", "{": "}", "[": "]" };
  const want = pairs[text[open]];
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === text[open]) depth++;
    else if (text[i] === want && --depth === 0) return i;
  }
  return -1;
}
const wrapDeclarations = (text) => text.split("\n").map((l) => wrapDeclaration(l)).join("\n");

function apiReference() {
  const entries = [
    ["@d34dman/sutram", "index", "What app authors use: the registry, formats, the policy, commandLine() and agentPrompt(), and the types every entry point shares. No DOM."],
    ["@d34dman/sutram/client", "client", "For building a client of your own (a terminal, a console, a test harness): parse and complete command lines, check input, run status, format results. Covered by semver. No DOM."],
    ["@d34dman/sutram/console", "console", "The console, <sutram-console>."],
    ["@d34dman/sutram/approval", "approval", "The approval dialog, <sutram-approval>: where the person approves what an agent wants to run."],
    ["@d34dman/sutram/webmcp", "webmcp", "Commands as WebMCP tools, tools() and callTool()."],
    ["@d34dman/sutram/events", "events", "Declared events, and the events list and events recent commands."],
    ["@d34dman/sutram/browser", "browser", "globalThis.Sutram: the registry and its helpers in one object, with /client as Sutram.client. Also dist/sutram.js."],
    ["@d34dman/sutram/internals", "internals", "Helpers Sutram uses itself. No semver promise: any release may change them."],
  ];
  const out = [
    "---",
    "title: API",
    "description: Every export of every entry point, from the TypeScript declarations that ship with the package.",
    "---",
    "",
    "<!-- Generated by scripts/docs.mjs from types/*.d.ts. Edit those, not this file. -->",
    "",
    "# API",
    "",
    `Version ${pkg.version}. This page is generated from the TypeScript declarations in \`types/\`, which a test keeps in step with \`src/\`. For what the pieces are for, start with [Commands and providers](../concepts/commands.md).`,
    "",
  ];
  for (const [name, file, about] of entries) {
    const text = read(`types/${file}.d.ts`);
    out.push(`## \`${name}\``, "", about, "");
    // Sections are marked "// ---- name ----"; the part before the first is the start.
    // Imports are for the compiler, not the reader; an import may span lines.
    const body = text.replace(/^import type [\s\S]*?from "[^"]+";\n/gm, "")
      .replace(/^\/\/ Type declarations[^\n]*\n(\/\/[^\n]*\n)*/, "").trim();
    const parts = body.split(/^\/\/ ---- (.+?) -+$/m);
    const first = parts.shift().trim();
    if (first) out.push("```ts", wrapDeclarations(first), "```", "");
    for (let i = 0; i < parts.length; i += 2) {
      out.push(`### ${parts[i].replace(/:.*/, "")}`, "", "```ts", wrapDeclarations(parts[i + 1].trim()), "```", "");
    }
  }
  return out.join("\n");
}

function measurements() {
  const text = read("docs/measurements.md");
  const table = execFileSync(process.execPath, [resolve(root, "scripts/measure.mjs")], { encoding: "utf8" }).trim();
  return text.replace(/(<!-- measure:start -->\n)[\s\S]*?(\n<!-- measure:end -->)/, `$1${table}$2`);
}

function useSkill() {
  return `---
name: use-sutram-page
description: Use a web page that has Sutram, from a browser you drive (Playwright, Puppeteer, CDP, a browser agent). Signs of Sutram are window.Sutram, a <sutram-console> element, or WebMCP tools such as sutram_status and cart_add. Find the page's commands, read its state, change one thing per command, handle errors and approval.
---

<!-- Generated by scripts/docs.mjs from src/prompt.js (DISCOVERY_RULES). Edit those, not this file. -->

# Use a Sutram page

Sutram pages expose what they can do as commands. Use them instead of
clicking and reading screenshots: they are exact, they say what went wrong,
and they ask the person before anything consequential.

## Three ways in, tools first

Use the first one you have. Tools answer as text, while the console has to
be read off the screen. The person sees the commands you run in the
console whichever way you use.

- **WebMCP tools**, if your browser gives you the page's tools. Call
  \`sutram_status\` first. Tool names are command names with underscores:
  \`cart add\` is \`cart_add\`.
- **JavaScript in the page**, if you can evaluate code:
  \`await Sutram.exec("cart add V60-02")\` runs command lines as the console
  would and answers with its text; send several lines in one call to run
  them as one batch. \`Sutram.tools()\` lists the tools (the same list WebMCP
  gets), and \`await Sutram.call("cart_add", { sku: "V60-02" })\` calls one
  and answers with its data.
- **Type into the page's console** otherwise. The console is the
  \`<sutram-console>\` element; open it with the key left of 1, or Ctrl with
  it. Type a command and press Enter, or paste several lines to run them as
  one batch.

## Rules

${DISCOVERY_RULES.map((r) => `- ${r}`).join("\n")}
- Start with help, then status (with tools: the tool list, then \`sutram_status\`).

## Approval

In the console, a command that needs the person's approval asks a y/n
question. Leave the answer to the person; never type it yourself.

Through tools (WebMCP, \`Sutram.exec()\`, \`Sutram.call()\`), a call that
needs the person's approval waits while the page asks them in its approval
dialog; leave the answer to them. When they say no, or the page has
nobody to ask (exit 130), stop and tell them.

## Results

Every call returns \`{ code, text?, data? }\` or \`{ code, message }\`:

| Code | Means | Do |
|---|---|---|
| 0 | Done | Read \`data\`; follow hints in \`text\` |
| 1 | Ran, but failed | Read the message; fix the cause |
| 2 | The input did not fit | Fix the arguments; \`man <command>\` shows them |
| 127 | No such command | Use the suggestion, or run help again |
| 130 | Not run: needs approval, or cancelled | Ask the person (see above) |

## Several changes at once

\`sutram_batch\` runs several tools as one change:
\`{ calls: [{ tool: "cart_add", input: { sku: "V60" } }, …] }\`. It checks
every call first, asks once, and stops at the first failure.

## More

${SITE}llms.txt · ${SITE}docs/why.md
`;
}

// --- Pages -------------------------------------------------------------------

function frontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = {};
  if (m) for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
  }
  const body = m ? src.slice(m[0].length) : src;
  if (!meta.title) meta.title = (body.match(/^# (.+)$/m) || [, "Sutram"])[1];
  return { meta, body };
}

function loadPages(generated) {
  return ORDER.map((page) => {
    const path = `docs/${page}.md`;
    const src = generated[path] ?? read(path);
    return { page, path, src, ...frontmatter(src) };
  });
}

function llmsTxt(pages) {
  const by = Object.fromEntries(pages.map((p) => [p.page, p]));
  const line = (page) => `- [${by[page].meta.title}](${SITE}docs/${page}.md)${by[page].meta.description ? `: ${by[page].meta.description}` : ""}`;
  const out = [
    "# Sutram",
    "",
    `> ${pkg.description}`,
    "",
    "Sutram is an npm package (`@d34dman/sutram`, MIT OR GPL-2.0-or-later) and a Drupal module (`drupal/sutram`). An app registers commands: a name, a JSON Schema for the input, annotations, a function. Agents reach them as WebMCP tools, through `Sutram.tools()`, `Sutram.call()` and `Sutram.exec()` in the page, or as command lines typed into the page's console. `Sutram.agentPrompt()` hands a task to an agent that drives a browser.",
    "",
    "Sutram sits on top of WebMCP: WebMCP is how a page hands tools to an agent, and Sutram decides what those tools are. It is one registry that every part of an app (a form, the navigation, a module) registers its commands with, so they are named and found the same way, and people can use the same commands in the console. Sutram registers tools through WebMCP's own `registerTool()` and never reads or changes the page's HTML. It does not replace Playwright or browser agents: they call its commands instead of clicking. Without WebMCP in the browser, the same commands work through `Sutram.call()`.",
    "",
    "Agents using a page: start with `status` (or the `sutram_status` tool), then `help`; read `man <command>` before using a command; change one thing per command; ask the person when a call returns exit 130. Coding agents adding Sutram to an app: read the quick start, then Write a provider and Write descriptions agents can use.",
    "",
  ];
  for (const section of NAV) {
    const pagesHere = section.pages.filter((p) => !(section.optional || []).includes(p));
    if (pagesHere.length) out.push(`## ${section.title}`, "", ...pagesHere.map(line), "");
  }
  out.push("## Optional", "", ...NAV.flatMap((s) => s.optional || []).map(line),
    `- [All pages in one file](${SITE}llms-full.txt)`,
    `- [Skill: use a Sutram page](https://github.com/d34dman/sutram/blob/main/skills/use-sutram-page/SKILL.md)`,
    `- [Skill: add Sutram to an app](https://github.com/d34dman/sutram/blob/main/skills/add-sutram/SKILL.md)`, "");
  return out.join("\n");
}

// --- Markdown to HTML ----------------------------------------------------------

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => s.toLowerCase().replace(/<[^>]+>|`/g, "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");

// --- Syntax highlighting -------------------------------------------------------
// A few regular expressions per language, enough for the docs' examples. Each
// rule is [class, regex]; the first that matches at a position wins, and text
// no rule matches stays plain. Classes: c comment, k keyword, s string,
// n number, f function, o option or property, t tag or type, p prompt,
// out a console session's output.

const JS_KEYWORDS = "async|await|break|case|catch|class|const|continue|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|let|new|null|of|return|static|switch|this|throw|true|try|typeof|undefined|var|void|while|yield";
const TS_EXTRA = "declare|interface|type|readonly|keyof|implements|namespace|enum|as|is|any|unknown|never|string|number|boolean|Record|Partial|Promise|Readonly|Exclude";
const STRINGS = [["s", /"(?:[^"\\\n]|\\.)*"/y], ["s", /'(?:[^'\\\n]|\\.)*'/y]];
const LANGS = {
  js: [
    ["c", /\/\/[^\n]*/y], ["c", /\/\*[\s\S]*?\*\//y], ...STRINGS, ["s", /`(?:[^`\\]|\\.)*`/y],
    ["k", new RegExp(`\\b(?:${JS_KEYWORDS})\\b`, "y")], ["n", /\b\d[\d_.]*\b/y],
    ["f", /\b[A-Za-z_$][\w$]*(?=\s*\()/y], ["o", /\b[A-Za-z_$][\w$]*(?=\??:(?!:))/y],
  ],
  html: [
    ["c", /<!--[\s\S]*?-->/y], ["t", /<\/?[A-Za-z][\w-]*|\/?>/y], ["o", /\b[\w-]+(?==)/y], ...STRINGS,
  ],
  css: [
    ["c", /\/\*[\s\S]*?\*\//y], ["o", /--?[\w-]+(?=\s*:)/y], ["t", /::?[\w-]+(?:\([^)]*\))?/y], ...STRINGS, ["n", /\b\d[\d.]*(?:px|em|rem|vh|vw|%)?/y], ["s", /#[0-9a-fA-F]{3,8}\b/y],
  ],
  yaml: [["c", /#[^\n]*/y], ["o", /[\w./-]+(?=:\s)/y], ...STRINGS, ["n", /\b\d[\d.]*\b/y], ["k", /\b(?:true|false|null)\b/y]],
  sh: [
    ["p", /^[›$](?= )/my], ["c", /#[^\n]*/y], ...STRINGS, ["o", /(?<=\s)--?[\w-]+(?:=[^\s"']*)?/y], ["o", /(?<=\s)--(?=\s|$)/y],
    ["t", /\[(?:read-only|consequential|navigates)\]/y],
  ],
};
LANGS.ts = [...LANGS.js.slice(0, 5), ["k", new RegExp(`\\b(?:${JS_KEYWORDS}|${TS_EXTRA})\\b`, "y")], ...LANGS.js.slice(6)];
LANGS.json = [["o", /"(?:[^"\\\n]|\\.)*"(?=\s*:)/y], ...STRINGS, ["n", /-?\b\d[\d.eE+-]*\b/y], ["k", /\b(?:true|false|null)\b/y]];

/** Highlights code for `lang`. A block without a language that looks like a console session is treated as sh. */
function highlight(code, lang) {
  const rules = LANGS[lang] || (!lang && /^› /m.test(code) ? LANGS.sh : null);
  if (!rules) return esc(code);
  // In a console session, only the lines after a prompt are commands; the rest is output.
  if (!lang) return code.split("\n").map((l) => (l.startsWith("› ") ? highlight(l, "sh") : l ? `<span class="out">${esc(l)}</span>` : "")).join("\n");
  let out = "";
  let plain = "";
  for (let i = 0; i < code.length;) {
    let hit = null;
    for (const [cls, re] of rules) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m[0]) { hit = [cls, m[0]]; break; }
    }
    if (!hit) { plain += code[i++]; continue; }
    out += esc(plain) + `<span class="${hit[0]}">${esc(hit[1])}</span>`;
    plain = "";
    i += hit[1].length;
  }
  return out + esc(plain);
}

function inline(text, link) {
  const codes = [];
  const kbds = [];
  // Keys first: <kbd>`</kbd> is a backtick, not the start of a code span.
  let s = text.replace(/<kbd>(.*?)<\/kbd>/g, (_, k) => `\u0001${kbds.push(k) - 1}\u0001`);
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = esc(s).replace(/&lt;br&gt;/g, "<br>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${esc(link(u.replace(/&amp;/g, "&")))}">${t}</a>`);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^\w*])\*([^*\n]+)\*(?![\w*])/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`)
    .replace(/\u0001(\d+)\u0001/g, (_, i) => `<kbd>${esc(kbds[i])}</kbd>`);
}

function render(src, link) {
  const lines = src.replace(/<!--[\s\S]*?-->\n?/g, "").split("\n");
  const out = [];
  let i = 0;
  const isTableSep = (l) => /^\|[\s:|-]+\|\s*$/.test(l || "");
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
  const listItem = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(/^```(\w*)/))) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++;
      const code = body.join("\n");
      const lang = m[1] || (/^› /m.test(code) ? "console" : "");
      const label = lang === "console" ? "Copy the commands" : "Copy the code";
      out.push(`<div class="codebox"><pre class="code"${lang ? ` data-lang="${lang}"` : ""}><code>${highlight(code, m[1])}</code></pre><button class="copy" type="button" aria-label="${label}" title="${label}">Copy</button></div>`);
    } else if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      const level = m[1].length;
      out.push(`<h${level} id="${slug(m[2])}">${inline(m[2], link)}${level > 1 ? ` <a class="anchor" href="#${slug(m[2])}" aria-hidden="true">#</a>` : ""}</h${level}>`);
      i++;
    } else if (line.startsWith("|") && isTableSep(lines[i + 1])) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (c.endsWith(":") ? (c.startsWith(":") ? "center" : "right") : ""));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(cells(lines[i++]));
      const td = (tag, c, j) => `<${tag}${align[j] ? ` style="text-align:${align[j]}"` : ""}>${inline(c, link)}</${tag}>`;
      out.push(`<div class="table"><table><thead><tr>${head.map((c, j) => td("th", c, j)).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, j) => td("td", c, j)).join("")}</tr>`).join("")}</tbody></table></div>`);
    } else if (line.startsWith(">")) {
      const body = [];
      while (i < lines.length && lines[i].startsWith(">")) body.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${render(body.join("\n"), link)}</blockquote>`);
    } else if (/^-{3,}\s*$/.test(line)) {
      out.push("<hr>");
      i++;
    } else if ((m = line.match(listItem))) {
      const indent = m[1].length;
      const ordered = /\d/.test(m[2]);
      const items = [];
      while (i < lines.length) {
        const im = lines[i].match(listItem);
        if (!im || im[1].length !== indent || /\d/.test(im[2]) !== ordered) break;
        const body = [im[3]];
        i++;
        // Continuation: indented lines, or blank lines followed by indented ones.
        while (i < lines.length && (/^\s+\S/.test(lines[i]) && lines[i].search(/\S/) > indent || (!lines[i].trim() && /^\s+\S/.test(lines[i + 1] || "") && lines[i + 1].search(/\S/) > indent))) {
          body.push(lines[i].slice(Math.min(lines[i].search(/\S/) < 0 ? 0 : lines[i].search(/\S/), indent + 2)));
          i++;
        }
        items.push(body);
      }
      const li = (body) => {
        let first = body[0];
        let box = "";
        const cb = first.match(/^\[( |x)\]\s+(.*)$/);
        if (cb) { box = `<input type="checkbox" disabled${cb[1] === "x" ? " checked" : ""}> `; first = cb[2]; }
        const rest = body.slice(1);
        const nested = rest.findIndex((l) => listItem.test(l) || l.startsWith("```"));
        const text = [first, ...(nested < 0 ? rest : rest.slice(0, nested))].join(" ");
        const tail = nested < 0 ? "" : render(rest.slice(nested).join("\n"), link);
        return `<li${cb ? ' class="task"' : ""}>${box}${inline(text, link)}${tail}</li>`;
      };
      out.push(`<${ordered ? "ol" : "ul"}>${items.map(li).join("")}</${ordered ? "ol" : "ul"}>`);
    } else {
      const body = [];
      while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|>|\|)/.test(lines[i]) && !listItem.test(lines[i])) body.push(lines[i++]);
      out.push(`<p>${inline(body.join(" "), link)}</p>`);
    }
  }
  return out.join("\n");
}

// --- The website ---------------------------------------------------------------

const CSS = `
@font-face { font-family: "Geist"; src: url("{root}fonts/Geist-Variable.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }
@font-face { font-family: "Geist Mono"; src: url("{root}fonts/GeistMono-Variable.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }
:root { --bg: #fafaf8; --bg-2: #f3f2ee; --surface: #ffffff; --ink: #0f1222; --ink-2: #3a3f52; --muted: #646a7d; --line: #e7e5df; --line-2: #d9d6ce;
  --accent: #4b52d6; --accent-soft: #eef0fe; --term: #10121b; --term-line: #252939; --term-ink: #e6e8f0;
  --mono: "Geist Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; --sans: "Geist", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
@media (prefers-color-scheme: dark) { :root { --bg: #0b0d14; --bg-2: #10131c; --surface: #131622; --ink: #eceef6; --ink-2: #c3c7d6; --muted: #9298ad; --line: #232737; --line-2: #2e3346; --accent: #a3aaff; --accent-soft: #1b1f3a; --term: #0d0f18; } }
* { box-sizing: border-box; }
html { scroll-padding-top: 80px; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16.5px/1.65 var(--sans); -webkit-font-smoothing: antialiased; }
a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 3px; }
code, kbd, pre { font-family: var(--mono); font-size: 0.86em; font-variant-ligatures: none; }
:not(pre) > code { background: var(--bg-2); border: 1px solid var(--line); border-radius: 5px; padding: 0 5px; overflow-wrap: anywhere; }
kbd { display: inline-block; min-width: 1.6em; text-align: center; border: 1px solid var(--line-2); border-bottom-width: 2px; border-radius: 6px; padding: 0 6px; background: var(--surface); line-height: 1.5; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px; }
header.top { position: sticky; top: 0; z-index: 10; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); background: color-mix(in srgb, var(--bg) 85%, transparent); border-bottom: 1px solid var(--line); }
header.top .wrap { display: flex; align-items: center; justify-content: space-between; height: 60px; gap: 16px; }
.wrap { max-width: 1160px; margin: 0 auto; padding: 0 24px; }
.brand { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; font-weight: 620; font-size: 19px; letter-spacing: -0.04em; }
.brand img { width: 26px; height: 26px; border-radius: 7px; }
.brand span { color: var(--muted); font-weight: 450; letter-spacing: 0; font-size: 15px; }
nav.links { display: flex; gap: 4px; font-size: 14.5px; }
nav.links a { color: var(--muted); text-decoration: none; padding: 6px 10px; border-radius: 8px; white-space: nowrap; }
nav.links a:hover { color: var(--ink); background: var(--bg-2); }
.layout { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 48px; padding-top: 32px; padding-bottom: 80px; }
aside nav { position: sticky; top: 84px; max-height: calc(100vh - 100px); overflow: auto; font-size: 14.5px; }
aside h2 { font: 600 12px var(--mono); text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 18px 0 6px; }
aside ul { list-style: none; margin: 0; padding: 0; }
aside a { display: block; color: var(--ink-2); text-decoration: none; padding: 4px 10px; border-radius: 7px; }
aside a:hover { background: var(--bg-2); }
aside a[aria-current] { background: var(--accent-soft); color: var(--accent); font-weight: 560; }
details.toc { display: none; }
@media (max-width: 860px) { .layout { grid-template-columns: minmax(0, 1fr); gap: 0; padding-top: 16px; } aside { display: none; } details.toc { display: block; margin-bottom: 8px; border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; background: var(--surface); } details.toc summary { cursor: pointer; color: var(--muted); } details.toc nav { position: static; max-height: none; } .wrap { padding: 0 16px; } nav.links .hide-sm { display: none; } }
article { max-width: 760px; }
article h1 { font-size: clamp(30px, 4vw, 40px); line-height: 1.15; letter-spacing: -0.03em; margin: 8px 0 18px; }
article h2 { font-size: 24px; letter-spacing: -0.02em; margin: 40px 0 12px; padding-top: 8px; }
article h3 { font-size: 18.5px; margin: 28px 0 8px; }
article .anchor { color: var(--line-2); text-decoration: none; font-weight: 400; opacity: 0; }
article :is(h2, h3):hover .anchor { opacity: 1; }
article p, article li { color: var(--ink-2); }
article strong { color: var(--ink); }
pre.code { background: var(--term); color: var(--term-ink); border: 1px solid var(--term-line); border-radius: 12px; padding: 14px 18px; overflow: auto; font-size: 13.5px; line-height: 1.65; }
pre.code code { font-size: inherit; }
/* A console session's output is one long line in the console; wrap it here. */
pre.code[data-lang="console"] { white-space: pre-wrap; overflow-wrap: anywhere; }
.codebox { position: relative; margin: 16px 0; }
.codebox pre.code { margin: 0; padding-right: 72px; }
.codebox .copy { position: absolute; top: 8px; right: 8px; font: 500 12px var(--sans); color: #e6e8f0; background: #ffffff12; border: 1px solid #ffffff26; border-radius: 6px; padding: 4px 9px; cursor: pointer; opacity: .75; }
.codebox .copy:hover, .codebox .copy:focus-visible { opacity: 1; background: #ffffff20; }
pre.code .c { color: #8a91a6; font-style: italic; } pre.code .k { color: #c792ea; } pre.code .s { color: #c3e88d; } pre.code .n { color: #f78c6c; }
pre.code .f { color: #82aaff; } pre.code .o { color: #7dcfff; } pre.code .t { color: #f07178; } pre.code .p { color: #a3aaff; } pre.code .out { color: #9aa1b5; }
.table { overflow-x: auto; margin: 16px 0; border: 1px solid var(--line); border-radius: 12px; }
table { border-collapse: collapse; width: 100%; font-size: 14.5px; }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { background: var(--bg-2); font-weight: 600; }
tr:last-child td { border-bottom: 0; }
/* A name in a cell stays whole; the table scrolls instead. */
td > code { overflow-wrap: normal; }
blockquote { margin: 16px 0; padding: 4px 18px; border-left: 3px solid var(--accent); background: var(--bg-2); border-radius: 0 10px 10px 0; }
li.task { list-style: none; margin-left: -1.2em; }
.meta { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 14px; color: var(--muted); margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--line); }
.pager { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 24px; }
.pager a { display: block; border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; text-decoration: none; background: var(--surface); }
.pager a small { display: block; color: var(--muted); font-size: 13px; }
.pager a.next { text-align: right; grid-column: 2; }
`;

function sidebar(current, toPage) {
  return NAV.map((s) => `<h2>${s.title}</h2><ul>${s.pages.map((p) => `<li><a href="${toPage(p)}"${p === current.page ? ' aria-current="page"' : ""}>${esc(pageTitle(p))}</a></li>`).join("")}</ul>`).join("");
}
let titles = {};
const pageTitle = (p) => titles[p] || p;

function htmlPage(p, pages) {
  const depth = p.page.split("/").length; // docs/x.html → 1
  const rootRel = "../".repeat(depth);
  const docsRel = "../".repeat(depth - 1);
  const toPage = (q) => `${docsRel}${q}.html`;
  const link = (u) => {
    if (/^[a-z]+:|^#/.test(u)) return u;
    return u.replace(/\.md(#|$)/, ".html$1");
  };
  const i = ORDER.indexOf(p.page);
  const prev = pages[i - 1];
  const next = pages[i + 1];
  const nav = `<nav aria-label="Documentation">${sidebar(p, toPage)}</nav>`;
  const title = p.page === "index" ? "Sutram documentation" : `${p.meta.title} · Sutram`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${p.meta.description ? `<meta name="description" content="${esc(p.meta.description)}">` : ""}
<link rel="canonical" href="${SITE}docs/${p.page}.html">
<link rel="alternate" type="text/markdown" href="${p.page.split("/").pop()}.md">
<meta property="og:title" content="${esc(title)}">
<meta property="og:image" content="${SITE}social-preview.png">
<meta name="theme-color" content="#fafaf8" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d14" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${rootRel}logo.svg" type="image/svg+xml">
<style>${CSS.replace(/\{root\}/g, rootRel)}</style>
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="${rootRel}"><img src="${rootRel}logo.svg" alt="" width="26" height="26">sutram <span>docs</span></a>
  <nav class="links" aria-label="Main">
    <a href="${toPage("index")}">Docs</a>
    <a class="hide-sm" href="${rootRel}#demo">Demo</a>
    <a class="hide-sm" href="${rootRel}llms.txt">llms.txt</a>
    <a href="https://github.com/d34dman/sutram">GitHub</a>
  </nav>
</div></header>
<div class="wrap layout">
<aside>${nav}</aside>
<main>
<details class="toc"><summary>All pages</summary>${nav}</details>
<article>
${render(p.body, link)}
<p class="meta"><a href="${p.page.split("/").pop()}.md">This page as Markdown</a><a href="https://github.com/d34dman/sutram/blob/main/${p.path}">Edit on GitHub</a></p>
<div class="pager">${prev ? `<a href="${toPage(prev.page)}"><small>Previous</small>${esc(prev.meta.title)}</a>` : ""}${next ? `<a class="next" href="${toPage(next.page)}"><small>Next</small>${esc(next.meta.title)}</a>` : ""}</div>
</article>
</main>
</div>
<script>
// Copy buttons. For a console session, copy only the commands, without the
// prompt and the output, so they can be pasted into a console.
for (const button of document.querySelectorAll(".codebox .copy")) {
  button.addEventListener("click", async () => {
    const pre = button.previousElementSibling;
    const code = pre.textContent;
    const text = pre.dataset.lang === "console"
      ? code.split("\\n").filter((l) => l.startsWith("› ")).map((l) => l.slice(2)).join("\\n")
      : code;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
    } catch {
      getSelection().selectAllChildren(pre);
      button.textContent = "Press Ctrl+C";
    }
    setTimeout(() => { button.textContent = "Copy"; }, 1600);
  });
}
</script>
</body>
</html>
`;
}

function buildSite(dir, pages, llms) {
  const out = resolve(root, dir);
  const write = (p, s) => { mkdirSync(dirname(resolve(out, p)), { recursive: true }); writeFileSync(resolve(out, p), s); };
  titles = Object.fromEntries(pages.map((p) => [p.page, p.meta.title]));
  for (const p of pages) {
    write(`docs/${p.page}.html`, htmlPage(p, pages));
    write(`docs/${p.page}.md`, p.src);
  }
  cpSync(resolve(root, "docs/measurements"), resolve(out, "docs/measurements"), { recursive: true });
  write("llms.txt", llms);
  write("llms-full.txt", [
    `# Sutram: all documentation pages\n\n> ${pkg.description}\n`,
    ...pages.map((p) => `\n\n---\n\nSource: ${SITE}docs/${p.page}.md\n\n${p.body.trim()}\n`),
  ].join(""));
  write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${SITE}</loc></url>\n${pages.map((p) => `<url><loc>${SITE}docs/${p.page}.html</loc></url>`).join("\n")}\n<url><loc>${SITE}example/forms.html</loc></url>\n</urlset>\n`);
  write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);
  // Examples load ../src in the repository; on the website they load the build.
  write("example/forms.html", read("example/forms.html").replace('src="../src/browser.js"', 'src="../sutram.js"'));
  for (const p of ["skills/use-sutram-page/SKILL.md", "skills/add-sutram/SKILL.md"]) write(p, read(p));
  return pages.length;
}

// --- Main ----------------------------------------------------------------------

const generated = {
  "docs/reference/api.md": apiReference(),
  "docs/measurements.md": measurements(),
  "skills/use-sutram-page/SKILL.md": useSkill(),
};
const pages = loadPages(generated);
generated["docs/llms.txt"] = llmsTxt(pages);

const args = process.argv.slice(2);
if (args.includes("--check")) {
  const stale = Object.entries(generated).filter(([p, s]) => !existsSync(resolve(root, p)) || read(p) !== s).map(([p]) => p);
  if (stale.length) {
    console.error(`docs: out of date: ${stale.join(", ")}. Run npm run docs.`);
    process.exit(1);
  }
  console.log("docs: generated files are up to date");
} else {
  for (const [p, s] of Object.entries(generated)) {
    mkdirSync(dirname(resolve(root, p)), { recursive: true });
    if (!existsSync(resolve(root, p)) || read(p) !== s) { writeFileSync(resolve(root, p), s); console.log(`docs: wrote ${p}`); }
  }
}
const site = args.find((a) => a === "--site" || a.startsWith("--site="));
if (site) {
  const dir = site.includes("=") ? site.split("=")[1] : "site";
  console.log(`docs: built ${buildSite(dir, pages, generated["docs/llms.txt"])} pages into ${dir}/`);
}
