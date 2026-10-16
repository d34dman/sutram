---
title: Write descriptions agents can use
description: The documentation agents read is your command definitions. How to write them.
---

# Write descriptions agents can use

Agents do not read your docs site. They read `help`, `man` and the tool
list, and all three are generated from your command definitions. So the
`description`, the schemas and the `examples` are the documentation that
matters most.

## Names

- Start with the provider, then a verb: `cart add`, `nav go`,
  `form node-article-form set`.
- Use the same verbs everywhere: `status`, `list`, `find`, `get`, `set`,
  `add`, `remove`, `save`, `discard`.
- Lowercase words, single spaces. Hyphens are fine inside a word.

## The description

One line, what the command does, from the caller's side:

| Weak | Better |
|---|---|
| `Cart` | `Add a product to the cart` |
| `Handles saving` | `Save the article form, the same as clicking Save. The page reloads` |
| `Set field value` | `Change one field. Nothing is saved until form <id> save` |

Say what happens that the caller cannot see: that nothing is saved yet, that
the page reloads, that new fields can appear.

## Input properties

- Give every property a `type`.
- Add a `description` when the name does not say enough: where the value
  comes from ("Product code, from shop list"), what format it takes, what a
  yes/no field accepts.
- Prefer `enum` for a closed list. It checks input, completes with
  <kbd>Tab</kbd>, and tells agents the choices.
- Set `default` when there is a sensible one, and `minimum`/`maximum` when
  there are limits.
- For dynamic choices, add `suggest`.

## Output

Add an `output` schema. Agents see "Returns { count, total }" in the tool
description and know what to read. Give properties a `title` when the column
heading should differ from the key.

## Examples

Add `examples` for any command with more than one argument, or with a value
that needs quoting. Write them as command lines: `man` shows them, and agents
copy their shape.

```js
examples: ["cart add V60-02", "cart add GUJI-250 2", "cart add SCALE --qty=1"],
```

## Annotations

They are part of the description too. A missing `readOnly: true` makes a
harmless command look risky; a missing `consequential: true` lets an agent
place an order without asking. Decide each one on purpose.

## Check your work

```
› help <provider>
› man <command>
```

Then read `Sutram.tools()` as if you had never seen the app. If you would
not know what to call, neither will an agent.
