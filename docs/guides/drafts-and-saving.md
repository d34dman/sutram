---
title: Drafts and saving
description: The convention for providers that keep a working copy: status, save, discard.
---

# Drafts and saving

Many apps already keep a working copy of their data in the browser: a form,
an editor, a canvas. Sutram commands act on that copy. Many changes cost no
requests, and one save sends the result.

It works like git. The working copy is the working tree, `status` shows
unsaved work, and `save` is the commit.

## The convention

A provider that holds a draft:

- reports unsaved work in `<provider> status`: a list of what changed in
  `data.unsaved`, empty when there is nothing to save;
- registers `<provider> save` and `<provider> discard`.

Whether `save` is consequential is the provider's call. Publishing probably
is; saving a draft that nobody else sees probably is not. `discard` throws
work away, so it usually is.

## Why save once

Compared with a server call per change:

- one request, one save, one revision with one intended change;
- validation, access checks and hooks run once;
- the agent's changes are local calls, not round trips;
- the person can look at the result before it is sent.

## What save must report

Server validation and access checks run only at the save, so:

- **Field errors**, by field, in `<provider> status` after the save comes
  back. Drupal's form commands do this.
- **Conflicts**, plainly: Drupal refuses to save a node that changed since
  the form loaded. Say that, and what to do.
- **Where it went**: if saving leaves the page (`navigates`), call
  `reinitializes()` before it does, and say in the result where it went, so
  the agent knows what to read with `status` once the next page is ready.

## Keeping the draft

An unsaved draft lives only in the tab. If keeping it across reloads
matters, that is the app's job, not Sutram's.
