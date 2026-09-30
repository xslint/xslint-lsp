/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const {TextDocument} = require('vscode-languageserver-textdocument')
const {actions} = require('../src/actions')
const {file} = require('../src/corpus')

/**
 * A TextDocument built from a committed fixture.
 * @param {string} name - Fixture file name under test/fixtures
 * @return {TextDocument} - The document
 */
const document = function(name) {
  return TextDocument.create(
    'file:///t.xsl', 'xsl', 1,
    fs.readFileSync(path.resolve(__dirname, 'fixtures', name), 'utf-8'),
  )
}

/**
 * What a run reads beside a document: the document's own text under its own
 * path, and each named fixture under a name that is not the document's.
 * @param {TextDocument} doc - The document
 * @param {Array.<string>} names - Fixture file names under test/fixtures
 * @return {Array.<{file: string, content: string}>} - The sources
 */
const read = function(doc, names) {
  return [
    {file: file(doc.uri), content: doc.getText()},
    ...names.map((name, index) => ({
      file: `elsewhere-${index}.xsl`,
      content: fs.readFileSync(
        path.resolve(__dirname, 'fixtures', name), 'utf-8',
      ),
    })),
  ]
}

/**
 * The code actions offered on a fixture document, read beside the named ones.
 * @param {string} name - Fixture file name of the document
 * @param {object} range - The requested range
 * @param {Array.<string>} names - Fixture file names read beside it
 * @param {object} settings - The options `lint` takes
 * @return {Array.<object>} - The code actions
 */
const offered = function(name, range, names, settings) {
  const doc = document(name)
  return actions(doc, range, read(doc, names), settings)
}

/**
 * A range covering the whole fixture.
 * @type {object}
 */
const WHOLE = {start: {line: 0, character: 0}, end: {line: 99, character: 0}}

test('offers a quick-fix for a fixable defect in range', function() {
  assert.ok(
    offered('fixable.xsl', WHOLE, [], {}).some(
      (action) => action.kind === 'quickfix' &&
        action.title.includes('incorrect-use-of-boolean-constants'),
    ),
  )
})

test('the quick-fix edit writes the boolean the string stood for', function() {
  const fix = offered('fixable.xsl', WHOLE, [], {}).find(
    (action) => action.kind === 'quickfix',
  )
  assert.ok(
    fix.edit.changes['file:///t.xsl'][0].newText.includes('test="true()"'),
    'a quick-fix cannot leave the string test in place',
  )
})

test('skips a fixable defect below the requested range', function() {
  assert.ok(
    !offered(
      'fixable.xsl',
      {start: {line: 0, character: 0}, end: {line: 0, character: 0}}, [], {},
    ).some((action) => action.kind === 'quickfix'),
  )
})

test('skips a fixable defect above the requested range', function() {
  assert.ok(
    !offered(
      'fixable.xsl',
      {start: {line: 9, character: 0}, end: {line: 20, character: 0}}, [], {},
    ).some((action) => action.kind === 'quickfix'),
  )
})

test('offers no quick-fix for a defect of another stylesheet', function() {
  assert.ok(
    !offered('library.xsl', WHOLE, ['caller.xsl'], {}).some(
      (action) => action.title.includes('incorrect-use-of-boolean-constants'),
    ),
    'a fix belonging to a corpus stylesheet cannot be offered on the open one',
  )
})

test('offers a fix-all action for the safe fixes the settings run', function() {
  assert.ok(
    offered('project/main.xsl', WHOLE, [], {preset: 'all'})
      .some((action) => action.kind === 'source.fixAll'),
    'a workspace running safe fixes cannot go without a fix-all',
  )
})

test('the fix-all edit applies every safe fix', function() {
  const all = offered('project/main.xsl', WHOLE, [], {preset: 'all'}).find((action) => action.kind === 'source.fixAll')
  const text = all.edit.changes['file:///t.xsl'][0].newText
  assert.ok(
    !text.includes('child::') && !text.includes('not(not('),
    'a fix-all cannot leave a safe fix unapplied',
  )
})

test('the fix-all edit leaves a suggestion alone', function() {
  const all = offered('project/main.xsl', WHOLE, [], {preset: 'all'}).find((action) => action.kind === 'source.fixAll')
  assert.ok(
    all.edit.changes['file:///t.xsl'][0].newText.includes(`test="'true'"`),
    'a fix-all cannot apply what only --fix-suggestions writes',
  )
})

test('offers no fix-all when no safe fix runs', function() {
  assert.ok(
    !offered('fixable.xsl', WHOLE, [], {}).some(
      (action) => action.kind === 'source.fixAll',
    ),
    'a fix-all cannot be offered with nothing safe to apply',
  )
})

test('offers no action for a stylesheet the run does not read', function() {
  assert.deepEqual(
    actions(document('fixable.xsl'), WHOLE, [], {}),
    [],
    'a stylesheet the command line never reads cannot be offered a fix',
  )
})
