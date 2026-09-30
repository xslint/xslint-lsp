# xslint

Lint your XSL/XSLT stylesheets as you type — malformed XML, invalid XPath, and
stylistic defects — with quick-fixes, powered by
[xslint](https://github.com/xslint/xslint). Works in any VS Code-compatible
editor.

## Install

This extension is published on
[Open VSX](https://open-vsx.org/extension/maxonfjvipon/xslint-vscode) and
attached as a `.vsix` to every
[release](https://github.com/xslint/xslint-lsp/releases/latest). It is **not**
on the Microsoft VS Code Marketplace.

### Cursor, VSCodium, Windsurf

These editors use Open VSX as their gallery — open the Extensions view, search
**xslint**, and click Install.

### Gitpod

Add it to `.gitpod.yml`:

```yaml
vscode:
  extensions:
    - maxonfjvipon.xslint-vscode
```

### VS Code (Microsoft build)

VS Code searches only Microsoft's Marketplace, where this extension is not
listed, so install from the `.vsix`:

```bash
code --install-extension xslint-vscode-<version>.vsix
```

Or download the `.vsix` from the
[latest release](https://github.com/xslint/xslint-lsp/releases/latest) and run
*Extensions view → `⋯` → Install from VSIX…*.

### Any other LSP editor

The language server is editor-agnostic; point your client at it as described in
[xslint-lsp](https://github.com/xslint/xslint-lsp#run-it).

Once installed, open any `.xsl`/`.xslt` file — diagnostics appear as you type,
no save or build needed.

## Features

- **Live diagnostics** — the checks your project's `.xslint.yml` runs, or
  xslint's `recommended` ones without it, go over the buffer as you edit,
  surfacing problems with their exact line and column, no save or build needed.
- **Your configuration** — `preset:`, `only:`, `rules:` and `exclude:` in
  `.xslint.yml` mean in the editor exactly what they mean to the command line,
  a problem with the file shows up on the file itself, and an edit to it
  re-checks what you have open.
- **Quick-fixes** — a lightbulb on each fixable defect, plus a *fix all* action
  for the safe fixes. The edits come from xslint's own engine, so a fix in the
  editor is what a command-line `xslint --fix-suggestions` writes, and *fix
  all* what `xslint --fix` writes.
- **Any `.xsl`/`.xslt` file** — activates automatically.

## How it works

The extension bundles and launches the
[xslint-lsp](https://www.npmjs.com/package/xslint-lsp) language server, which
wraps xslint and speaks the Language Server Protocol. Because the same server
is editor-agnostic, xslint diagnostics are available in any LSP-capable editor.

## License

MIT
