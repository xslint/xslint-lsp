/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

/**
 * The directory every workflow of this repository sits in.
 * @type {string}
 */
const WORKFLOWS = path.resolve(__dirname, '..', '.github', 'workflows')

/**
 * The text of one workflow.
 * @param {string} name - File name under .github/workflows
 * @return {string} - What the file holds
 */
const workflow = function(name) {
  return fs.readFileSync(path.resolve(WORKFLOWS, name), 'utf-8')
}

/**
 * Every line of every workflow.
 * @return {Array.<string>} - The lines
 */
const lines = function() {
  return fs.readdirSync(WORKFLOWS).flatMap(
    (name) => workflow(name).split('\n'),
  )
}

/**
 * What one named step of a workflow holds, up to the step behind it.
 * @param {string} name - File name under .github/workflows
 * @param {string} step - The name the step is given
 * @return {string} - Its own text
 */
const script = function(name, step) {
  return workflow(name).split(/^ +- name: /m).find(
    (block) => block.startsWith(step),
  )
}

test('every upload of a release asset overwrites what stands there', function() {
  assert.deepStrictEqual(
    lines().filter((line) => line.includes('gh release upload')).map(
      (line) => line.includes('--clobber'),
    ),
    [true],
    'an upload without --clobber fails every re-run of its own job',
  )
})

test('the Open VSX publish outlives one refusal by the registry', function() {
  assert.match(
    script('release.yml', 'Publish to Open VSX'),
    /for \w+ in \$\(seq 1 \d+\); do[\s\S]*?ovsx publish[\s\S]*?done/,
    'one 503 from Open VSX cannot be allowed to strand a release',
  )
})

test('the Open VSX publish waits between its attempts', function() {
  assert.match(
    script('release.yml', 'Publish to Open VSX'),
    /^ +sleep \d+$/m,
    'a retry with no wait spends every attempt on the same bad second',
  )
})
