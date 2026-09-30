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
 * A one-stylesheet corpus standing for the rest of a workspace, under a name
 * that is not the document's own.
 * @param {string} name - Fixture file name under test/fixtures
 * @return {Array.<{file: string, content: string}>} - The corpus
 */
const corpus = function(name) {
  return [{
    file: 'elsewhere.xsl',
    content: fs.readFileSync(
      path.resolve(__dirname, 'fixtures', name), 'utf-8',
    ),
  }]
}

/**
 * What xslint's `settingsOf` answers, spelled out for one run.
 * @param {object} said - The keys that differ from a bare run
 * @return {object} - The settings
 */
const settings = function(said) {
  return {
    suppress: [], overrides: {}, only: [], preset: 'recommended',
    excluded: () => false, problems: [], ...said,
  }
}

/**
 * A range covering the whole fixture.
 * @type {object}
 */
const WHOLE = {start: {line: 0, character: 0}, end: {line: 99, character: 0}}

test('offers a quick-fix for a fixable defect in range', function() {
  assert.ok(
    actions(document('fixable.xsl'), WHOLE, [], settings({})).some(
      (action) => action.kind === 'quickfix' &&
        action.title.includes('incorrect-use-of-boolean-constants'),
    ),
  )
})

test('the quick-fix edit writes the boolean the string stood for', function() {
  const fix = actions(document('fixable.xsl'), WHOLE, [], settings({})).find(
    (action) => action.kind === 'quickfix',
  )
  assert.ok(
    fix.edit.changes['file:///t.xsl'][0].newText.includes('test="true()"'),
    'a quick-fix cannot leave the string test in place',
  )
})

test('skips a fixable defect below the requested range', function() {
  assert.ok(
    !actions(
      document('fixable.xsl'),
      {start: {line: 0, character: 0}, end: {line: 0, character: 0}}, [],
      settings({}),
    ).some((action) => action.kind === 'quickfix'),
  )
})

test('skips a fixable defect above the requested range', function() {
  assert.ok(
    !actions(
      document('fixable.xsl'),
      {start: {line: 9, character: 0}, end: {line: 20, character: 0}}, [],
      settings({}),
    ).some((action) => action.kind === 'quickfix'),
  )
})

test('offers no quick-fix for a defect of another stylesheet', function() {
  assert.ok(
    !actions(document('library.xsl'), WHOLE, corpus('caller.xsl'),
      settings({})).some(
      (action) => action.title.includes('incorrect-use-of-boolean-constants'),
    ),
    'a fix belonging to a corpus stylesheet cannot be offered on the open one',
  )
})

test('offers a fix-all action for the safe fixes the settings run', function() {
  assert.ok(
    actions(document('project/main.xsl'), WHOLE, [], settings({preset: 'all'}))
      .some((action) => action.kind === 'source.fixAll'),
    'a workspace running safe fixes cannot go without a fix-all',
  )
})

test('the fix-all edit applies every safe fix', function() {
  const all = actions(
    document('project/main.xsl'), WHOLE, [], settings({preset: 'all'}),
  ).find((action) => action.kind === 'source.fixAll')
  const text = all.edit.changes['file:///t.xsl'][0].newText
  assert.ok(
    !text.includes('child::') && !text.includes('not(not('),
    'a fix-all cannot leave a safe fix unapplied',
  )
})

test('the fix-all edit leaves a suggestion alone', function() {
  const all = actions(
    document('project/main.xsl'), WHOLE, [], settings({preset: 'all'}),
  ).find((action) => action.kind === 'source.fixAll')
  assert.ok(
    all.edit.changes['file:///t.xsl'][0].newText.includes(`test="'true'"`),
    'a fix-all cannot apply what only --fix-suggestions writes',
  )
})

test('offers no fix-all when no safe fix runs', function() {
  assert.ok(
    !actions(document('fixable.xsl'), WHOLE, [], settings({})).some(
      (action) => action.kind === 'source.fixAll',
    ),
    'a fix-all cannot be offered with nothing safe to apply',
  )
})

test('offers no action for a stylesheet the settings exclude', function() {
  assert.deepEqual(
    actions(
      document('fixable.xsl'), WHOLE, [], settings({excluded: () => true}),
    ),
    [],
    'a stylesheet the configuration excludes cannot be offered a fix',
  )
})
