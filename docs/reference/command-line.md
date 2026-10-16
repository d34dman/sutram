---
title: The command line
description: Grammar, options, quoting, exit codes, annotations and the words clients own.
---

# The command line

Sutram parses one command line at a time. It is not a shell: no pipes,
redirection, variables or globbing.

## Grammar

```
<command name> [positional …] [option …] [-- value …]

option:  --name=value
         --name value
         --flag
         --no-flag
```

- **The command name** is one or more lowercase words: `cart add`,
  `form node-article-form set`. The longest registered name wins.
- **Positional values** fill the keys listed in `positional`, in order. The
  last one takes the rest of the line: `nav find menu settings` searches for
  "menu settings".
- **Options** are GNU long options: `--qty=2` or `--qty 2`. There are no
  short options except `-h`.
- **Booleans**: `--all` sets true, `--no-all` sets false.
- **`--`** ends options: everything after it is a value, even if it starts
  with `--`.

## Quoting

- Double or single quotes group words: `--who="Grace Hopper"`,
  `set title 'Pour-over, step by step'`.
- A backslash escapes the next character, except inside single quotes.
- A value that starts with a quote is never an option.
- An unclosed quote is a usage error (exit 2). In the console, <kbd>Enter</kbd>
  inside quotes starts a new line of the value instead.

## Several lines

Pasted text and multi-line entries are split into lines and run as one
[batch](../concepts/batches.md). Lines starting with `#` are comments.

## Options every command has

| Option | Does |
|---|---|
| `-h`, `--help` | Show the command's usage |
| `--json` | Print the data unchanged, as agents get it |
| `--json=a,b` | Print only those fields |
| `--wide` | Show every column |

A command cannot declare inputs named `help`, `json` or `wide`.

## Words clients own

| Word | Does |
|---|---|
| `help`, `help <provider>` | List commands |
| `man <command>` | Show a command's manual |
| `status` | Run every `<provider> status` |
| `clear` | Clear the console |

Command names cannot start with these words.

## Exit codes

| Code | Name | Means |
|---|---|---|
| `0` | `EXIT.OK` | Done |
| `1` | `EXIT.FAILED` | Ran, but failed |
| `2` | `EXIT.USAGE` | The input did not fit: unknown option, wrong type, missing value, bad quoting |
| `127` | `EXIT.NOT_FOUND` | No such command, with "did you mean" when one is close |
| `130` | `EXIT.CANCELLED` | Cancelled, or not allowed to run without approval |

## Annotations

| Annotation | `help` shows | WebMCP hint |
|---|---|---|
| `readOnly: true` | `[read-only]` | `readOnlyHint` |
| `consequential: true` | `[consequential]` | `consequentialHint` |
| `navigates: true` | `[navigates]` | in the description |
| `untrustedContent: true` | | `untrustedContentHint` |

## Tool names

A WebMCP tool's name is the command name with spaces replaced by
underscores: `cart add` → `cart_add`, `form node-article-form set` →
`form_node-article-form_set`. `commandLine(def, input)` turns a tool call back
into the command line a person would type.
