# Sutram

A standard way for JavaScript apps to expose their commands, so their authors
never have to build or ship a console of their own.

An app registers its commands once. Then anyone on the page can run them: a
person in the Sutram console, or an AI agent such as Claude through WebMCP.

```
› help canvas
› canvas add block heading at:hero-2
› describe field_image
› canvas clear
  Clear the canvas? This removes 14 elements. (y/n)
```

- **Discovery first.** `help` and `describe` show what is possible on the page
  and what state it is in, for people and agents alike.
- **Runs in the browser.** Commands can do only what the user can already do on
  the page, so Sutram adds no way into the server.
- **Annotated.** Commands say whether they are read-only or consequential, so the
  console and agents can ask before acting.
- **Forms and widgets.** Form API forms, and widgets such as the media library,
  can expose themselves too, so agents stop guessing from screenshots.

See [docs/design.md](docs/design.md).

## Why "Sutram"

*Sūtram* (सूत्रम्) is Sanskrit for a short, exact rule. Pāṇini described all of
Sanskrit grammar in about 4,000 of them. In Malayalam, *sūtram* (സൂത്രം) is also
everyday speech for a knack, a clever little device.

## Status

Design stage. Nothing to use yet.
