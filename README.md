# xslint-lsp

A [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
server that surfaces [xslint](https://github.com/xslint/xslint)'s
diagnostics as you type — squiggles in your editor instead of a failed build.

[![DevOps By Rultor.com](https://www.rultor.com/b/xslint/xslint-lsp)](https://www.rultor.com/p/xslint/xslint-lsp)

[![npm](https://img.shields.io/npm/v/xslint-lsp.svg?style=flat)](https://www.npmjs.com/package/xslint-lsp)
[![test](https://github.com/xslint/xslint-lsp/actions/workflows/test.yml/badge.svg)](https://github.com/xslint/xslint-lsp/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/xslint/xslint-lsp/branch/master/graph/badge.svg)](https://codecov.io/gh/xslint/xslint-lsp)
[![PDD status](http://www.0pdd.com/svg?name=xslint/xslint-lsp)](http://www.0pdd.com/p?name=xslint/xslint-lsp)
[![Hits-of-Code](https://hitsofcode.com/github/xslint/xslint-lsp)](https://hitsofcode.com/view/github/xslint/xslint-lsp)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/xslint/xslint-lsp/blob/master/LICENSE.txt)

xslint lints XSL/XSLT stylesheets — malformed XML, invalid XPath, and stylistic
defects — but only in the terminal and CI. This wraps xslint's engine in an LSP
server, so the same defects light up in any LSP-capable editor: VS Code,
Neovim, and JetBrains IDEs (via [LSP4IJ](https://github.com/redhat-developer/lsp4ij)
or their built-in LSP support).

Because it is a thin transport over xslint — it calls xslint's `lint(sources,
settings)` in-process and maps each defect onto an LSP `Diagnostic` — there is
no second rule engine to keep in sync, and no second reading of the project's
`.xslint.yml` either.

## How it works

```text
editor  ──(LSP over stdio)──▶  src/server.js
                                  │  settingsOf(dir)    → @xslint/xslint
                                  │  stylesheetsOf([root], settings) → @xslint/xslint
                                  │  sourceOf(file, buffer ?? disk)  → @xslint/xslint
                                  │  lint(sources, settings) → @xslint/xslint
                                  │  diagnostics(defects)  → src/diagnostics.js
                                  ▼
editor  ◀──(publishDiagnostics)──  { range, severity, code: rule, message }
```

The server keeps open documents in sync, re-lints on every change (checking the
live buffer, not the saved file), and clears a file's diagnostics when it
closes. Each xslint defect `{name, severity, message, line, pos}` becomes an LSP
diagnostic whose `code` is the rule name and whose `source` is `xslint`.

A document is linted **among the other stylesheets of its project**, exactly
the ones `xslint` run with no path argument in the project's directory reads:
the directory of the `.xslint.yml` that applies, when that file sits inside the
workspace folder holding the document, or else that folder. The server does not
walk the tree itself; it asks xslint's own `stylesheetsOf`, so `.xsl` and
`.xslt` are both read, what a `.gitignore` names (unless git tracks it) and
what `exclude:` covers are passed by, and nothing else is skipped. Each
stylesheet reaches `lint` through xslint's `sourceOf`, with the text of its
open buffer where there is one and of its file otherwise, so unsaved edits
count and the parameter entities and missing hrefs are read beside it the way
the command line reads them — `broken-href` fires in the editor too. Four of
xslint's cross-file checks — `unused-function`, `unreachable-function`,
`unused-variable` and `unused-named-template` — call a declaration dead when
nothing in the corpus refers to it, so a library module linted on its own would
be told every symbol it exports is unused, and two more — `circular-import` and
`redundant-import` — read the files an `xsl:import` names. Only the defects
found in the open document are published; the rest of the project is there so
those checks can see a declaration used elsewhere.

A document the walk passes by — one a `.gitignore` names, say — shows no
diagnostics, because the run over the project that the editor mirrors does not
read it either. A document outside every workspace folder has no project and is
linted alone, as `xslint` naming that one file lints it. The walk runs afresh
on every check, so a stylesheet created, deleted or newly ignored is read the
way the next command-line run reads it; it costs a few percent of the lint
itself (40 ms beside 1.2 s over TEI's 363 stylesheets). Saving a document
re-checks every open one, so writing the call that brings a template to life
clears the complaint on the stylesheet that declares it. A stylesheet changed
**outside** the editor re-checks nothing until the next edit, and a folder
added to the workspace after startup is not a root until the server restarts.

The editor honors **`.xslint.yml` exactly like the command line**. Each
document is linted under the configuration `xslint` would read if run from the
document's directory — the nearest `.xslint.yml` there or above it, which in a
project with one configuration at its root is the one a bare `xslint` in that
root reads — through xslint's own `settingsOf`, so `preset:`, `only:`, `rules:`
(`off` and re-grades) and `exclude:` mean the same in both, and the file the
problems land on is the one xslint says it read. A stylesheet outside a nested
project keeps none of its declarations alive, since `xslint` run in that
project never reads it. A stylesheet the configuration excludes shows no
diagnostics and, as on the command line, keeps no declaration of another
stylesheet alive. The problems xslint warns about in the file — an unknown key,
a severity it does not know, a rule naming no check, an exclusion that excluded
nothing — appear as warnings on the `.xslint.yml` itself. A file no YAML parser reads, or
one naming a preset that does not exist, fails the command line before it
lints, so it shows as an error on the `.xslint.yml` and the editor lints nothing
under it rather than guessing at what it meant. The configuration is read
afresh on every check, and a client that lets the server register file watchers
is asked to report changes to any `.xslint.yml`, whereupon the file's problems
are published afresh, or cleared when it is deleted, whether or not a document
under it is open, and every open document is checked again.

It also offers **code actions**: a quick-fix on each fixable defect and a
*fix all* action for the safe fixes. Both are computed by xslint's own `fixed`
engine over the defects the diagnostics show, so a quick-fix is byte-for-byte
what a command-line `--fix-suggestions` writes and *fix all* what `--fix`
writes.

## Run it

The server speaks LSP over stdio:

```bash
npm install
node src/server.js --stdio
```

Point any LSP client at that command for `.xsl`/`.xslt` files.

### Editor extension

A VS Code-compatible extension lives in [`client/`](client); it bundles and
launches this server. It's published to
[Open VSX](https://open-vsx.org/extension/maxonfjvipon/xslint-vscode) and
attached as a `.vsix` to every
[release](https://github.com/xslint/xslint-lsp/releases/latest) — it is **not**
on the Microsoft VS Code Marketplace.

- **Cursor, VSCodium, Windsurf, Gitpod** — search **xslint** in the Extensions
  view (they install from Open VSX).
- **VS Code** — `code --install-extension xslint-vscode-<version>.vsix`, or
  *Extensions → `⋯` → Install from VSIX…* with the release's `.vsix`.

See [`client/README.md`](client/README.md) for the full guide. To hack on the
extension, open this repo and press `F5`; to build a `.vsix`, run
`cd client && npm run package`. Releases publish it automatically (see
[RELEASING.md](RELEASING.md)).

## Development

```bash
npm test        # unit tests + an end-to-end LSP round-trip
npm run coverage   # the same, under c8 with a 100% gate
npm run lint    # eslint (google + @stylistic)
```

Tests run on Node's built-in runner (`node --test`). `test/diagnostics.test.js`
covers the defect→diagnostic mapping; `test/corpus.test.js` covers where
`xslint` is run for a document, what its walk reads, and the buffer swap; `test/settings.test.js` and
`test/verdict.test.js` cover how `.xslint.yml` is read and applied;
`test/server.test.js` spawns the server and drives it through
open/change/close, asserting the diagnostics it publishes — and it exits the
server cleanly so its subprocess coverage is captured. It also holds the parity
test: over the committed project in `test/fixtures/project`, whose
`.xslint.yml` sets a preset, turns a check off, re-grades another and excludes
a directory, over a workspace holding a nested project of its own, over a
project whose root stylesheet is called only from a nested one, and over
`test/fixtures/discovery`, which holds an `.xslt`, a gitignored stylesheet and
an import of a missing file, the server must publish for every stylesheet
exactly what the `xslint` command line run in that project reports for it.

## License

MIT — see [LICENSE.txt](LICENSE.txt).
