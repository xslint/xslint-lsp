/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const {lint, baselined} = require('@maxonfjvipon/xslint')
const {file, canonical} = require('./corpus')

/**
 * The defects `xslint` reports for one document when run over its project
 * under the given settings: only the defects found in the document itself,
 * the other stylesheets being there so that a cross-file check can see a
 * declaration used elsewhere. A document the run does not read — one the
 * settings exclude, or one xslint's walk passes by — draws none of its own.
 * Of those, a defect the baseline records is dropped, by the same split the
 * command line runs, so a check whose count in the document rose past what
 * is recorded shows every one of its defects there. Sources are named as the
 * filesystem spells a path, and so is the document.
 * @param {TextDocument} document - The document to judge
 * @param {Array.<object>} sources - What the run reads, as `lint` takes it
 * @param {object} settings - What xslint's `settingsOf` answers for the
 *  document's project
 * @param {{counts: object, base: string}} ledger - The baseline of the
 *  document's project, as `baselined` takes it
 * @return {Array.<object>} - The document's defects
 */
const verdict = function(document, sources, settings, ledger) {
  const own = canonical(file(document.uri))
  let found = []
  if (sources.some((source) => source.file === own)) {
    found = baselined(
      lint(sources, settings).filter((defect) => defect.file === own), ledger,
    ).fresh
  }
  return found
}

module.exports = {
  verdict,
}
