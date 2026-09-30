/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {settled} = require('../src/settings')

/**
 * A fresh temporary directory holding, as its `.xslint.yml`, a committed
 * configuration fixture, and an empty directory two levels below it.
 * @param {string} config - Configuration fixture name under test/fixtures
 * @return {string} - The directory holding the configuration
 */
const project = function(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xslint-lsp-'))
  fs.mkdirSync(path.join(root, 'deep', 'er'), {recursive: true})
  fs.copyFileSync(
    path.resolve(__dirname, 'fixtures', config), path.join(root, '.xslint.yml'),
  )
  return root
}

test('finds the configuration nearest a directory below it', function() {
  const root = project('silent.yml')
  assert.deepEqual(
    settled(path.join(root, 'deep', 'er')).configs,
    [path.join(root, '.xslint.yml')],
    'a configuration above the stylesheet cannot be missed',
  )
})

test('reads the rules of the configuration it finds', function() {
  assert.deepEqual(
    settled(path.join(project('silent.yml'), 'deep')).settings.suppress,
    ['incorrect-use-of-boolean-constants'],
    'a check the configuration turns off cannot stay on',
  )
})

test('names a problem of the configuration as a warning', function() {
  assert.deepEqual(
    settled(project('unknown.yml')).problems.map((one) => one.severity),
    [2],
    'a problem the command line warns about cannot be graded otherwise',
  )
})

test('excludes every stylesheet under a configuration no parser reads',
  function() {
    const root = project('broken.txt')
    assert.ok(
      settled(root).settings.excluded(path.join(root, 'any.xsl')),
      'a stylesheet cannot be linted by a configuration nobody could read',
    )
  })

test('names a configuration no parser reads as an error', function() {
  assert.deepEqual(
    settled(project('broken.txt')).problems.map((one) => one.severity),
    [1],
    'a configuration the command line refuses cannot be graded a warning',
  )
})
