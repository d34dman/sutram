# Contributing

Thank you for helping. Issues and pull requests are welcome at
https://github.com/d34dman/sutram.

## Set up

```sh
git clone https://github.com/d34dman/sutram.git
cd sutram
npm test              # no dependencies to install
```

Node.js 20 or later. The package has no dependencies, runtime or dev, and
should stay that way.

## Before a pull request

```sh
npm test              # unit tests, the types check, and the docs check
npm run build         # dist/sutram.js still bundles
npm run docs          # if you changed types/, docs/measurements, src/prompt.js or a docs page title
```

- **Tests** live in `test/`, one file per area, with `node:test`. The core has
  no DOM; test it in Node. The console is checked by hand in a browser
  (`npm run example`).
- **Types**: every export of `src/` needs a declaration in `types/`;
  `test/types.test.js` checks it.
- **Docs**: the pages are `docs/**/*.md`. Some files are generated and
  committed: `docs/reference/api.md`, the table in `docs/measurements.md`,
  `skills/use-sutram-page/SKILL.md` and `docs/llms.txt`. Edit their sources
  (`types/`, `scripts/measure.mjs`, `src/prompt.js`, the pages), then run
  `npm run docs`. `npm test` fails when they are stale.
- **The website**: `npm run site` builds the docs into `site/` and serves it
  at http://localhost:8080/site/. GitHub Pages deploys `main`.
- **Changelog**: add a line under *Unreleased* in `CHANGELOG.md`.

## Principles

- Sutram holds no markup, no domain logic, no app state and no permission
  checks. Providers own all of those.
- Commands are the contract: a name, a JSON Schema, annotations, a function.
  Everything else (help, man, tools, prompts) is generated from them.
- Plain English in messages and docs: short sentences, the caller's point of
  view, what to do next.

## License

By contributing, you agree that your contribution is licensed under
`MIT OR GPL-2.0-or-later`, like the rest of the package.
