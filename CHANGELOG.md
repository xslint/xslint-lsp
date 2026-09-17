# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

- Lint a document among the workspace's other stylesheets, read at
  `initialize`, instead of on its own. Four of xslint's cross-file checks —
  `unused-function`, `unreachable-function`, `unused-variable`,
  `unused-named-template` — call a declaration dead when nothing in the corpus
  refers to it, so a library module used to be told every symbol it exports is
  unused, and `circular-import` and `redundant-import` read what an
  `xsl:import` names.
- Take a saved stylesheet of the workspace back into the corpus and re-check
  the open ones, so the edit that answers a cross-file complaint clears it. One
  saved from outside the announced folders is left out, rather than allowed to
  vouch for declarations the workspace never uses. Changes made outside the
  editor are still only picked up on restart.

## 0.0.9 - 2026-09-09

- Bump `@maxonfjvipon/xslint` to 0.1.0.

## 0.0.8 - 2026-07-28

- Bump `@maxonfjvipon/xslint` to 0.0.14.

## 0.0.7 - 2026-07-28

- Bump `@maxonfjvipon/xslint` to 0.0.13.

## 0.0.4 - 2026-07-27

- Bump `@maxonfjvipon/xslint` to 0.0.12.

## 0.0.3 - 2026-07-27

- Publish the VS Code extension to Open VSX on release, and attach the packaged
  `.vsix` to each GitHub release.

## 0.0.2 - 2026-07-26

- Bump `@maxonfjvipon/xslint` to 0.0.11.

## 0.0.1

- Initial release. A Language Server Protocol server that wraps
  [xslint](https://github.com/xslint/xslint): live diagnostics as you
  type over the editor buffer, quick-fixes for the fixable checks, and a
  fix-all action — all reusing xslint's own `lint` and `fixed` engine, so an
  editor fix is identical to a command-line `--fix`. Ships with a VS Code
  extension client, and works in any LSP-capable editor.
