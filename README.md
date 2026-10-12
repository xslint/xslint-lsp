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

The editor sees what `xslint` run at the workspace root sees, except that it
ignores `baseline:` until xslint lets a library apply one (#86):

- **Live buffer.** Every change re-lints the unsaved text; closing a file
  clears its diagnostics.
- **Whole project.** A document is linted among every stylesheet of its
  workspace folder, so `unused-function` sees a call made elsewhere and
  `circular-import` follows imports into other files. Only the open
  document's defects are shown.
- **Same files.** `.xsl` and `.xslt` are read; what `.gitignore` or
  `exclude:` skips shows nothing. A file outside every folder is linted alone.
- **Same config.** One `.xslint.yml`, the first found walking up from the
  folder; `preset:`, `only:`, `rules:` and `exclude:` mean what they mean on
  the command line. Its problems show up as diagnostics on the file itself,
  and a file xslint refuses puts an error on each open stylesheet it
  governs too.
- **Fresh on save.** Saving re-checks every open document; so does editing
  `.xslint.yml`, where the client lets the server watch files.
- **Code actions.** A quick-fix per fixable defect (`--fix-suggestions`) and
  *fix all* for the safe ones (`--fix`), byte-for-byte what the CLI writes.

Two limits: a stylesheet changed outside the editor is not re-checked until
the next edit, and a folder added after startup needs a server restart.

## Run it

The server speaks LSP over stdio:

```bash
npm install
node src/server.js --stdio
```

Point any LSP client at that command for `.xsl`/`.xslt` files.

### Editor extension

A VS Code-compatible extension lives in [`client/`](client); it bundles and
launches this server. It's published to the
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=maxonfjvipon.xslint-vscode)
and [Open VSX](https://open-vsx.org/extension/maxonfjvipon/xslint-vscode), and
attached as a `.vsix` to every
[release](https://github.com/xslint/xslint-lsp/releases/latest).

- **VS Code** — search **xslint** in the Extensions view, or run
  `code --install-extension maxonfjvipon.xslint-vscode`.
- **Cursor, VSCodium, Windsurf, Gitpod** — search **xslint** in the Extensions
  view (they install from Open VSX).

See [`client/README.md`](client/README.md) for the full guide. To hack on the
extension, open this repo and press `F5`; to build a `.vsix`, run
`cd client && npm run package`. Releases publish it to Open VSX automatically (see
[RELEASING.md](RELEASING.md)).

## Development

```bash
npm test           # unit tests + an end-to-end LSP round-trip
npm run coverage   # the same, under c8 with a 100% gate
npm run lint       # eslint (google + @stylistic)
```

| Test | Covers |
| --- | --- |
| `test/diagnostics.test.js` | defect → diagnostic mapping |
| `test/actions.test.js` | quick-fix and *fix all* code actions |
| `test/corpus.test.js` | which stylesheets a document is linted among |
| `test/settings.test.js`, `test/verdict.test.js` | reading and applying `.xslint.yml` |
| `test/server.test.js` | the server end to end, and parity with the CLI over `test/fixtures/` |
| `test/workflows.test.js` | the CI workflows themselves |

## License

MIT — see [LICENSE.txt](LICENSE.txt).
