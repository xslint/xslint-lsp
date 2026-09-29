/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const {lint, fixed} = require('@maxonfjvipon/xslint')
const {diagnostics} = require('./diagnostics')
const {file, sources} = require('./corpus')

/**
 * The range that spans a whole document, so an edit can rewrite it entirely.
 * @param {TextDocument} document - The document
 * @return {object} - An LSP range from the start to the end of the text
 */
const whole = function(document) {
  return {
    start: {line: 0, character: 0},
    end: document.positionAt(document.getText().length),
  }
}

/**
 * A code action whose single edit replaces the whole document with `content`.
 * Rewriting the whole buffer keeps the server simple — the edited text comes
 * straight from xslint's `fixed`, so the result is exactly what `--fix` writes.
 * @param {string} uri - The document URI
 * @param {object} range - The whole-document range
 * @param {string} title - The action's title
 * @param {string} kind - The LSP code-action kind
 * @param {string} content - The rewritten document
 * @param {Array.<object>} resolves - Diagnostics this action fixes
 * @return {object} - An LSP CodeAction
 */
const rewrite = function(uri, range, title, kind, content, resolves) {
  return {
    title: title,
    kind: kind,
    diagnostics: resolves,
    edit: {changes: {[uri]: [{range: range, newText: content}]}},
  }
}

/**
 * Code actions for a document: a quick-fix for every fixable defect whose line
 * falls within the requested range, computed by xslint's own `fixed`, so an
 * editor fix is what `--fix-suggestions` writes. The corpus rides along so a
 * fix is offered beside the defects the diagnostics report.
 * @todo #58:30min Offer a fix-all action for the safe fixes again once the
 *  server reads `.xslint.yml`, since only a preset past `recommended` has
 *  one.
 * @param {TextDocument} document - The document to act on
 * @param {{start: object, end: object}} range - The requested range
 * @param {Array.<{file: string, content: string}>} corpus - The workspace's
 *  other stylesheets, which the cross-file checks are judged against
 * @return {Array.<object>} - The code actions
 */
const actions = function(document, range, corpus) {
  const own = file(document.uri)
  const all = sources(corpus, document)
  const defects = lint(all).filter((defect) => defect.file === own)
  const span = whole(document)
  const found = []
  for (const defect of defects) {
    const line = defect.line - 1
    if (defect.fix && line >= range.start.line && line <= range.end.line) {
      found.push(rewrite(
        document.uri, span, `xslint: fix ${defect.name}`, 'quickfix',
        fixed(all, [defect], true).contents.get(own),
        diagnostics([defect]),
      ))
    }
  }
  return found
}

module.exports = {
  actions,
}
