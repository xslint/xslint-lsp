/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const {lint} = require('@maxonfjvipon/xslint')
const {file, sources} = require('./corpus')

/**
 * The defects `xslint` reports for one document when run over its project
 * under the given settings: the document's live text among the workspace's
 * other stylesheets, and only the defects found in the document itself. A
 * stylesheet the settings exclude is one the command line never reads, so it
 * draws no defect of its own and vouches for no declaration of another.
 * @param {TextDocument} document - The document to judge
 * @param {Array.<{file: string, content: string}>} corpus - The workspace's
 *  other stylesheets, which the cross-file checks are judged against
 * @param {object} settings - What xslint's `settingsOf` answers for the
 *  document's project
 * @return {Array.<object>} - The document's defects
 */
const verdict = function(document, corpus, settings) {
  const own = file(document.uri)
  let found = []
  if (!settings.excluded(own)) {
    found = lint(
      sources(corpus, document).filter(
        (source) => !settings.excluded(source.file),
      ),
      settings,
    ).filter((defect) => defect.file === own)
  }
  return found
}

module.exports = {
  verdict,
}
