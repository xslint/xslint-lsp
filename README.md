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

Because it is a thin transport over xslint — it calls xslint's `lint(sources)`
in-process and maps each defect onto an LSP `Diagnostic` — there is no second
rule engine to keep in sync.

## How it works

```text
editor  ──(LSP over stdio)──▶  src/server.js
                                  │  sources(corpus, buffer) → src/corpus.js
                                  │  lint(sources)      → @xslint/xslint
                                  │  diagnostics(defects)  → src/diagnostics.js
                                  ▼
editor  ◀──(publishDiagnostics)──  { range, severity, code: rule, message }
```

The server keeps open documents in sync, re-lints on every change (checking the
live buffer, not the saved file), and clears a file's diagnostics when it
closes. Each xslint defect `{name, severity, message, line, pos}` becomes an LSP
diagnostic whose `code` is the rule name and whose `source` is `xslint`.

A document is linted **among the workspace's other stylesheets**, read once at
`initialize` from the folders the client announces, with the live buffer
standing in for its own file. xslint's cross-file checks — `unused-function`,
`unreachable-function`, `unused-variable`, `unused-named-template` — call a
declaration dead when nothing in the corpus refers to it, so a library module
linted on its own would be told every symbol it exports is unused. Only the
defects found in the open document are published; the rest of the corpus is
there so those checks can see a declaration used elsewhere.

It also offers **code actions**: a quick-fix on each fixable defect and a
*fix all* action for the safe fixes. Both are computed by xslint's own `fixed`
engine, so an editor fix is byte-for-byte identical to a command-line `--fix`.

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
covers the defect→diagnostic mapping; `test/corpus.test.js` covers the
workspace walk and the buffer swap; `test/server.test.js` spawns the server
and drives it through open/change/close, asserting the diagnostics it publishes
— and it exits the server cleanly so its subprocess coverage is captured.

## License

MIT — see [LICENSE.txt](LICENSE.txt).
