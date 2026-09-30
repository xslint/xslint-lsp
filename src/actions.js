/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const {fixed} = require('@maxonfjvipon/xslint')
const {diagnostics} = require('./diagnostics')
const {file, canonical} = require('./corpus')
const {verdict} = require('./verdict')

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
 * falls within the requested range, and a fix-all action for the safe fixes.
 * Each is computed by xslint's own `fixed`, so a quick-fix is what
 * `--fix-suggestions` writes and the fix-all what `--fix` writes. The sources
 * and the settings ride along so a fix is offered beside exactly the defects
 * the diagnostics report.
 * @param {TextDocument} document - The document to act on
 * @param {{start: object, end: object}} range - The requested range
 * @param {Array.<object>} sources - What the run over the document's project
 *  reads, as `lint` takes it
 * @param {object} settings - What xslint's `settingsOf` answers for the
 *  document's project
 * @return {Array.<object>} - The code actions
 */
const actions = function(document, range, sources, settings) {
  const own = canonical(file(document.uri))
  const defects = verdict(document, sources, settings)
  const span = whole(document)
  const found = []
  for (const defect of defects) {
    const line = defect.line - 1
    if (defect.fix && line >= range.start.line && line <= range.end.line) {
      found.push(rewrite(
        document.uri, span, `xslint: fix ${defect.name}`, 'quickfix',
        fixed(sources, [defect], true).contents.get(own),
        diagnostics([defect]),
      ))
    }
  }
  const every = fixed(sources, defects, false).contents.get(own)
  if (every !== undefined) {
    found.push(rewrite(
      document.uri, span, 'xslint: fix all auto-fixable problems',
      'source.fixAll', every, [],
    ))
  }
  return found
}

module.exports = {
  actions,
}
