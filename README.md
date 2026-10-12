# Sutram

Site building for Drupal in short, exact commands. Same input, same config,
every time.

```
add type event "Event"
add field event.field_date datetime --label "Starts"
grant content_editor "create event content"
```

Every command is checked against the live site and staged. You review the
config diff, apply everything in one step, and can export what you did as a
recipe. People, the built-in assistant and browser agents (WebMCP) all use the
same commands.

## Why "Sutram"

*Sūtram* (सूत्रम्) is Sanskrit for a short, exact rule. Pāṇini described all of
Sanskrit grammar in about 4,000 of them: terse rules that, applied in order,
always give the same result. In Malayalam, *sūtram* (സൂത്രം) is also everyday
speech for a knack, a clever little device: one line instead of a three-step
form wizard.

## Status

Early development. Nothing to use yet.

## Requirements

Drupal 10.3 or later (core recipes and config actions).
