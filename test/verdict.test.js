/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const {TextDocument} = require('vscode-languageserver-textdocument')
const {verdict} = require('../src/verdict')
const {file} = require('../src/corpus')

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
 * @return {Array.<object>} - The document's defects
 */
const judged = function(name, names, settings) {
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
  )
}

test('draws no defect for a stylesheet the run does not read', function() {
  assert.deepEqual(
    verdict(
      TextDocument.create(
        'file:///shelf.xsl', 'xsl', 1, fixture('violations.xsl'),
      ),
      [{file: 'elsewhere.xsl', content: fixture('caller.xsl')}],
      {},
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
