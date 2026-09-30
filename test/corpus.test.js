/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {settingsOf} = require('@maxonfjvipon/xslint')
const {file, rooted, gathered, sources} = require('../src/corpus')

/**
 * A project in a fresh temporary directory, under its real path, holding the
 * given files under the given names, each name relative to the directory.
 * @param {{[name: string]: string}} files - Content by relative name
 * @return {string} - The workspace directory
 */
const workspace = function(files) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'xslint-lsp-')),
  )
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true})
    fs.writeFileSync(path.join(root, name), content)
  }
  return root
}

/**
 * A committed fixture, as text.
 * @param {string} name - Fixture file name under test/fixtures
 * @return {string} - Its content
 */
const fixture = function(name) {
  return fs.readFileSync(path.resolve(__dirname, 'fixtures', name), 'utf-8')
}

/**
 * What a walk of a project found, as names relative to it in posix form,
 * sorted, without the temporary directory that changes on every run.
 * @param {string} root - The project directory
 * @return {Array.<string>} - The relative names
 */
const names = function(root) {
  return gathered(
    [root], settingsOf(root), path.join(root, 'any.xsl'),
  ).stylesheets
    .map((one) => path.relative(root, one).split(path.sep).join('/'))
    .sort()
}

test('reads the stylesheets of a project under either suffix', function() {
  assert.deepEqual(
    names(workspace({
      'lib.xsl': 'a library',
      'deep/nested.xslt': 'a nested one',
      'notes.txt': 'not a stylesheet',
    })),
    ['deep/nested.xslt', 'lib.xsl'],
    'a stylesheet the command line reads cannot be missing from the corpus',
  )
})

test('reads no stylesheet a gitignore of the project names', function() {
  assert.deepEqual(
    names(workspace({
      'lib.xsl': 'a library',
      'generated.xsl': 'a build product',
      '.gitignore': fixture('ignored.txt'),
    })),
    ['lib.xsl'],
    'a stylesheet the command line passes by cannot enter the corpus',
  )
})

test('reads a stylesheet under a directory only this server skipped',
  function() {
    assert.deepEqual(
      names(workspace({'target/lib.xsl': 'a library'})),
      ['target/lib.xsl'],
      'a stylesheet the command line reads cannot be skipped by a rule of ours',
    )
  })

test('reads no stylesheet the configuration excludes', function() {
  assert.deepEqual(
    names(workspace({
      'lib.xsl': 'a library',
      'vendor/reader.xsl': 'a vendored one',
      '.xslint.yml': fixture(path.join('project', '.xslint.yml')),
    })),
    ['lib.xsl'],
    'a stylesheet the configuration excludes cannot vouch for a declaration',
  )
})

test('warns of an exclusion that excluded nothing', function() {
  const root = workspace({
    'lib.xsl': 'a library',
    '.xslint.yml': fixture(path.join('project', '.xslint.yml')),
  })
  assert.deepEqual(
    gathered([root], settingsOf(root), path.join(root, 'lib.xsl')).problems,
    ['Exclusion \'vendor/**\' in configuration excluded nothing'],
    'a warning the command line prints about the walk cannot go unmentioned',
  )
})

test('reads a stylesheet with no project alone', function() {
  const loose = path.join(workspace({}), 'loose.xsl')
  assert.deepEqual(
    gathered([], {excluded: () => false}, loose).stylesheets,
    [loose],
    'a stylesheet outside every folder cannot go unread',
  )
})

test('reads nothing where the settings exclude everything', function() {
  const root = workspace({'lib.xsl': 'a library'})
  assert.deepEqual(
    gathered(
      [root], {excluded: () => true, exclude: [], base: root},
      path.join(root, 'lib.xsl'),
    ).stylesheets,
    [],
    'a configuration nobody could read cannot leave anything to lint',
  )
})

/**
 * Where `xslint` is run for a stylesheet of a workspace rooted at `/w`, by
 * where the configuration it reads sits, if anywhere.
 * @type {Array.<{name: string, config: Array.<string>, own: string,
 *  root: Array.<string>}>}
 */
const ROOTED = [
  {name: 'runs in the folder where no configuration was found',
    config: [], own: 'w/sub/lib.xsl', root: ['w']},
  {name: 'runs beside a configuration inside the folder',
    config: ['w', 'sub', '.xslint.yml'], own: 'w/sub/lib.xsl',
    root: ['w/sub']},
  {name: 'runs in the folder under a configuration above it',
    config: ['.xslint.yml'], own: 'w/sub/lib.xsl', root: ['w']},
  {name: 'runs nowhere for a stylesheet outside every folder',
    config: ['elsewhere', '.xslint.yml'], own: 'elsewhere/lib.xsl', root: []},
  {name: 'runs nowhere for a folder that is a sibling by prefix alone',
    config: [], own: 'w2/lib.xsl', root: []},
]

for (const row of ROOTED) {
  test(row.name, function() {
    const settings = {}
    if (row.config.length > 0) {
      settings.file = path.join(path.sep, ...row.config)
    }
    assert.deepEqual(
      rooted(
        [path.join(path.sep, 'w')], settings,
        path.join(path.sep, ...row.own.split('/')),
      ),
      row.root.map((dir) => path.join(path.sep, ...dir.split('/'))),
      'xslint cannot be run anywhere but where the project lives',
    )
  })
}

test('runs in the deepest of two nested folders', function() {
  assert.deepEqual(
    rooted(
      [path.join(path.sep, 'w'), path.join(path.sep, 'w', 'inner')], {},
      path.join(path.sep, 'w', 'inner', 'lib.xsl'),
    ),
    [path.join(path.sep, 'w', 'inner')],
    'a stylesheet cannot be judged by the outer of two folders holding it',
  )
})

test('runs nowhere for a stylesheet on another drive', function() {
  assert.deepEqual(
    rooted([path.join(path.sep, 'w')], {}, 'D:\\project\\lib.xsl'),
    [],
    'a stylesheet on another drive cannot belong to the workspace',
  )
})

test('stands the open buffer in for the copy read from disk', function() {
  const root = workspace({'lib.xsl': 'what the disk holds'})
  assert.equal(
    sources(
      [path.join(root, 'lib.xsl')],
      new Map([[path.join(root, 'lib.xsl'), 'what the editor holds']]),
    )[0].content,
    'what the editor holds',
    'an unsaved edit cannot be judged by what the disk holds',
  )
})

test('reads a stylesheet with no open buffer from disk', function() {
  const root = workspace({'lib.xsl': 'what the disk holds'})
  assert.equal(
    sources([path.join(root, 'lib.xsl')], new Map())[0].content,
    'what the disk holds',
    'a stylesheet nobody opened cannot be read as anything but its file',
  )
})

test('reads the missing hrefs beside a stylesheet', function() {
  const root = workspace({'index.xsl': fixture('discovery/index.xsl')})
  assert.deepEqual(
    [...sources([path.join(root, 'index.xsl')], new Map())[0].absent],
    ['absent.xsl'],
    'an import of a missing file cannot reach lint unannounced',
  )
})

test('stands a uri in for the path a buffer without a file cannot give',
  function() {
    assert.equal(file('untitled:Untitled-1'), 'untitled:Untitled-1')
  })
