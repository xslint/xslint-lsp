/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {pathToFileURL} = require('node:url')
const {TextDocument} = require('vscode-languageserver-textdocument')
const {verdict} = require('../src/verdict')
const {file, canonical} = require('../src/corpus')

/**
 * A committed fixture stylesheet, as text.
 * @param {string} name - Fixture file name under test/fixtures
 * @return {string} - Its content
 */
const fixture = function(name) {
  return fs.readFileSync(path.resolve(__dirname, 'fixtures', name), 'utf-8')
}

/**
 * The defects of a fixture document, read beside the named fixtures.
 * @param {string} name - Fixture file name of the document
 * @param {Array.<string>} names - Fixture file names read beside it
 * @param {object} settings - The options `lint` takes
 * @param {{counts: object, base: string}} ledger - The baseline the
 *  document is judged under, by default one recording nothing
 * @return {Array.<object>} - The document's defects
 */
const judged = function(
  name, names, settings, ledger = {counts: {}, base: path.sep},
) {
  const doc = TextDocument.create('file:///shelf.xsl', 'xsl', 1, fixture(name))
  return verdict(
    doc,
    [
      {file: file(doc.uri), content: doc.getText()},
      ...names.map((one, index) => ({
        file: `elsewhere-${index}.xsl`, content: fixture(one),
      })),
    ],
    settings,
    ledger,
  )
}

test('draws no defect for a stylesheet the run does not read', function() {
  assert.deepEqual(
    verdict(
      TextDocument.create(
        'file:///shelf.xsl', 'xsl', 1, fixture('violations.xsl'),
      ),
      [{file: 'elsewhere.xsl', content: fixture('caller.xsl')}],
      {}, {counts: {}, base: '/'},
    ),
    [],
    'a stylesheet the command line never reads cannot be reported',
  )
})

test('keeps a function another stylesheet read calls out of the report',
  function() {
    assert.ok(
      !judged('library.xsl', ['caller.xsl'], {}).some(
        (defect) => defect.name === 'unused-function',
      ),
      'a function called from a stylesheet the run reads cannot be unused',
    )
  })

test('publishes no defect of another stylesheet', function() {
  assert.ok(
    !judged('library.xsl', ['caller.xsl'], {}).some(
      (defect) => defect.name === 'incorrect-use-of-boolean-constants',
    ),
    'a defect of a stylesheet read beside the document cannot be its own',
  )
})

test('grades a check the way the settings re-grade it', function() {
  assert.deepEqual(
    judged(
      'violations.xsl', [],
      {overrides: {'incorrect-use-of-boolean-constants': 'error'}},
    ).map((defect) => defect.severity),
    ['error'],
    'a re-graded check cannot keep the severity it ships with',
  )
})

test('runs the preset the settings name', function() {
  assert.ok(
    judged('updated.xsl', [], {preset: 'all'}).some(
      (defect) => defect.name === 'missing-id-in-stylesheet',
    ),
    'a check of the whole catalog cannot go unrun under the all preset',
  )
})

/**
 * The defects of a fixture document saved in a fresh temporary directory,
 * under a baseline there recording the given counts for it.
 * @param {string} name - Fixture file name of the document
 * @param {object} settings - The options `lint` takes
 * @param {object} counts - What the baseline records of the document, by check
 * @return {Array.<object>} - The document's defects
 */
const recorded = function(name, settings, counts) {
  const root = canonical(fs.mkdtempSync(path.join(os.tmpdir(), 'xslint-lsp-')))
  const doc = TextDocument.create(
    pathToFileURL(path.join(root, 'shelf.xsl')).href, 'xsl', 1, fixture(name),
  )
  return verdict(
    doc, [{file: path.join(root, 'shelf.xsl'), content: doc.getText()}],
    settings, {counts: {'shelf.xsl': counts}, base: root},
  )
}

test('drops a defect the baseline records', function() {
  assert.deepEqual(
    recorded('violations.xsl', {}, {'incorrect-use-of-boolean-constants': 1}),
    [],
    'a defect the command line passes over cannot be shown',
  )
})

test('shows every defect of a check drawn more often than recorded',
  function() {
    assert.deepEqual(
      recorded(
        'project/shelf.xsl', {preset: 'all'},
        {
          'unabbreviated-axis': 1, 'unused-function': 1,
          'count-compared-to-zero': 1, 'missing-id-in-stylesheet': 1,
        },
      ).map((defect) => defect.name),
      ['unabbreviated-axis', 'unabbreviated-axis'],
      'a check whose count rose cannot hide the defect it added',
    )
  })
