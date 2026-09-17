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
const {file, stylesheets, sources} = require('../src/corpus')

/**
 * A project in a fresh temporary directory, holding the given files under the
 * given names, each name relative to the directory.
 * @param {{[name: string]: string}} files - Content by relative name
 * @return {string} - The workspace directory
 */
const workspace = function(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xslint-lsp-'))
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true})
    fs.writeFileSync(path.join(root, name), content)
  }
  return root
}

/**
 * The corpus as names relative to a workspace, in posix form, sorted — what a
 * walk found, without the temporary directory that changes on every run.
 * @param {string} root - The workspace directory
 * @return {Array.<string>} - The relative names
 */
const names = function(root) {
  return stylesheets([root])
    .map((source) => path.relative(root, source.file).split(path.sep).join('/'))
    .sort()
}

test('reads the stylesheets of a workspace and nothing else', function() {
  assert.deepEqual(
    names(workspace({
      'lib.xsl': 'a library',
      'deep/nested.xsl': 'a nested one',
      'notes.txt': 'not a stylesheet',
    })),
    ['deep/nested.xsl', 'lib.xsl'],
  )
})

test('reads no stylesheet of a directory a workspace never lints', function() {
  assert.deepEqual(
    names(workspace({
      'lib.xsl': 'a library',
      'node_modules/dep/vendored.xsl': 'a dependency',
      '.git/hooks/stale.xsl': 'version control metadata',
    })),
    ['lib.xsl'],
  )
})

test('reads nothing from a folder the client no longer has', function() {
  assert.deepEqual(
    stylesheets([path.join(os.tmpdir(), 'xslint-lsp-none-of-it')]), [],
  )
})

test('stands the open buffer in for the copy read from disk', function() {
  const root = workspace({'lib.xsl': 'what the disk holds'})
  assert.deepEqual(
    sources(
      stylesheets([root]),
      TextDocument.create(
        pathToFileURL(path.join(root, 'lib.xsl')).href, 'xsl', 1,
        'what the editor holds',
      ),
    ),
    [{file: path.join(root, 'lib.xsl'), content: 'what the editor holds'}],
  )
})

test('keeps a document that lives outside the workspace', function() {
  const loose = path.join(os.tmpdir(), 'loose.xsl')
  assert.deepEqual(
    sources(
      [],
      TextDocument.create(pathToFileURL(loose).href, 'xsl', 1, 'alone'),
    ),
    [{file: loose, content: 'alone'}],
  )
})

test('stands a uri in for the path a buffer without a file cannot give',
  function() {
    assert.equal(file('untitled:Untitled-1'), 'untitled:Untitled-1')
  })
