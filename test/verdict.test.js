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
const {settings} = require('./fixtures/settings')

/**
 * A committed fixture stylesheet, as text.
 * @param {string} name - Fixture file name under test/fixtures
 * @return {string} - Its content
 */
const fixture = function(name) {
  return fs.readFileSync(path.resolve(__dirname, 'fixtures', name), 'utf-8')
}

/**
 * A TextDocument built from a committed fixture.
 * @param {string} name - Fixture file name under test/fixtures
 * @return {TextDocument} - The document
 */
const document = function(name) {
  return TextDocument.create('file:///shelf.xsl', 'xsl', 1, fixture(name))
}

test('draws no defect for a stylesheet the settings exclude', function() {
  assert.deepEqual(
    verdict(document('violations.xsl'), [], settings({excluded: () => true})),
    [],
    'a stylesheet the configuration excludes cannot be reported',
  )
})

test('lets no excluded stylesheet vouch for a declaration', function() {
  assert.ok(
    verdict(
      document('library.xsl'),
      [{file: 'elsewhere.xsl', content: fixture('caller.xsl')}],
      settings({excluded: (name) => name === 'elsewhere.xsl'}),
    ).some((defect) => defect.name === 'unused-function'),
    'a stylesheet the command line never reads cannot keep a function alive',
  )
})

test('grades a check the way the settings re-grade it', function() {
  assert.deepEqual(
    verdict(
      document('violations.xsl'), [],
      settings({overrides: {'incorrect-use-of-boolean-constants': 'error'}}),
    ).map((defect) => defect.severity),
    ['error'],
    'a re-graded check cannot keep the severity it ships with',
  )
})

test('runs the preset the settings name', function() {
  assert.ok(
    verdict(document('updated.xsl'), [], settings({preset: 'all'})).some(
      (defect) => defect.name === 'missing-id-in-stylesheet',
    ),
    'a check of the whole catalog cannot go unrun under the all preset',
  )
})
