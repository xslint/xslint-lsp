/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const {lint} = require('@maxonfjvipon/xslint')
const {file, canonical} = require('./corpus')

/**
 * The defects `xslint` reports for one document when run over its project
 * under the given settings: only the defects found in the document itself,
 * the other stylesheets being there so that a cross-file check can see a
 * declaration used elsewhere. A document the run does not read — one the
 * settings exclude, or one xslint's walk passes by — draws none of its own.
 * Sources are named as the filesystem spells a path, and so is the document.
 * @param {TextDocument} document - The document to judge
 * @param {Array.<object>} sources - What the run reads, as `lint` takes it
 * @param {object} settings - What xslint's `settingsOf` answers for the
 *  document's project
 * @return {Array.<object>} - The document's defects
 */
const verdict = function(document, sources, settings) {
  const own = canonical(file(document.uri))
  let found = []
  if (sources.some((source) => source.file === own)) {
    found = lint(sources, settings).filter((defect) => defect.file === own)
  }
  return found
}

module.exports = {
  verdict,
}
