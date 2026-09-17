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
 * A range covering the whole fixture.
 * @type {object}
 */
const WHOLE = {start: {line: 0, character: 0}, end: {line: 99, character: 0}}

test('offers a quick-fix for a fixable defect in range', function() {
  assert.ok(
    actions(document('fixable.xsl'), WHOLE, []).some(
      (action) => action.kind === 'quickfix' &&
        action.title.includes('redundant-namespace-declarations'),
    ),
  )
})

test('offers a fix-all action when there are auto-fixes', function() {
  assert.ok(
    actions(document('fixable.xsl'), WHOLE, []).some(
      (action) => action.kind === 'source.fixAll',
    ),
  )
})

test('the fix-all edit removes every auto-fixable defect', function() {
  const all = actions(document('fixable.xsl'), WHOLE, []).find(
    (action) => action.kind === 'source.fixAll',
  )
  const text = all.edit.changes['file:///t.xsl'][0].newText
  assert.ok(!text.includes('xmlns:unused') && !text.includes('child::'))
})

test('offers no fix-all when nothing is auto-fixable', function() {
  assert.ok(
    !actions(document('violations.xsl'), WHOLE, []).some(
      (action) => action.kind === 'source.fixAll',
    ),
  )
})

test('skips a fixable defect below the requested range', function() {
  assert.ok(
    !actions(
      document('fixable.xsl'),
      {start: {line: 0, character: 0}, end: {line: 0, character: 0}}, [],
    ).some((action) => action.kind === 'quickfix'),
  )
})

test('skips a fixable defect above the requested range', function() {
  assert.ok(
    !actions(
      document('fixable.xsl'),
      {start: {line: 9, character: 0}, end: {line: 20, character: 0}}, [],
    ).some((action) => action.kind === 'quickfix'),
  )
})
