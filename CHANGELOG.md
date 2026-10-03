# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

- List the extension on the VS Code Marketplace, and open an issue every month
  the listing trails the latest release, since CI cannot publish there (#75).

## 0.0.16 - 2026-09-30

- Read one `.xslint.yml` per run, the way `xslint` run in the workspace folder
  and xslint-action read it (#70). Every document of a folder is linted under
  the configuration found walking up from that folder, over that folder's
  stylesheets, so a nested `.xslint.yml` no longer overrides the root one and
  nothing is published on it. It applies only when its directory is opened as
  a workspace folder of its own, with no open folder holding it, since nested
  folders are read as the outermost of them. A document outside every folder
  is still linted alone, under the configuration found walking up from its
  directory.

## 0.0.15 - 2026-09-30

- Read exactly the stylesheets the command line reads, the way it reads them
  (#64). The corpus now comes from xslint's own walk over the project's
  directory, so an `.xslt` is read, a stylesheet a `.gitignore` names or
  `exclude:` covers is passed by (and shows no diagnostics of its own), a
  `target` directory is no longer skipped, and `broken-href` fires on an
  import of a missing file. The walk runs on every check, so files created or
  deleted outside the editor are read at the next one. The `.xslint.yml` the
  problems land on is the one xslint says it read (#63), and a walk warning,
  such as an exclusion that excluded nothing, lands there too. A folder or a
  document reached through a symbolic link, or spelled in another case, is
  matched against the files under its real path.

## 0.0.14 - 2026-09-30

- Bump `@maxonfjvipon/xslint` to 0.6.0.

- Honor `.xslint.yml` exactly like the command line (#58). Each document is
  linted under the configuration `xslint` run from its directory reads, so
  `preset:`, `only:`, `rules:` and `exclude:` apply in the editor too, and a
  problem with the file is shown on the file. A file no YAML parser reads is
  an error on it, and nothing is linted under it. An edit to a `.xslint.yml`
  re-checks the open documents, and the *fix all* action for the safe fixes is
  back for a workspace whose preset has some.

## 0.0.13 - 2026-09-30

- Bump `@maxonfjvipon/xslint` to 0.5.0.

## 0.0.12 - 2026-09-29

- Bump `@maxonfjvipon/xslint` to 0.4.0.

- Show what the command line shows. With xslint 0.4.0 the editor runs its
  `recommended` preset, the same checks a bare `xslint` runs, so the
  diagnostics and the quick-fixes now match the command line. The *fix all*
  action is gone with it, since no recommended check has a safe fix; #58 lets a
  workspace ask for more through `.xslint.yml`, and brings it back.

## 0.0.11 - 2026-09-27

- Bump `@maxonfjvipon/xslint` to 0.3.0.

## 0.0.10 - 2026-09-17

- Bump `@maxonfjvipon/xslint` to 0.2.0.

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
