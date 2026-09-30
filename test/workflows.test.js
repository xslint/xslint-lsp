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

test('the cascade waits on the document npm install resolves through', function() {
  assert.doesNotMatch(
    script('cascade.yml', 'Bump @maxonfjvipon/xslint'),
    /npm view "@maxonfjvipon\/xslint@/,
    'npm view reads a packument the registry caches apart from the one npm install reads',
  )
})

test('the cascade probe revalidates what npm has cached', function() {
  assert.match(
    script('cascade.yml', 'Bump @maxonfjvipon/xslint'),
    /npm pack --dry-run --prefer-online "@maxonfjvipon\/xslint@\$\{NEW\}"/,
    'a probe that trusts the local cache sees a stale miss for five minutes',
  )
})

test('the cascade probe asks for several resolutions in a row', function() {
  assert.match(
    script('cascade.yml', 'Bump @maxonfjvipon/xslint'),
    /-ge [2-9]\b/,
    'one lucky edge of the registry cannot be allowed to stand for all of them',
  )
})

test('the cascade fails loudly when the release never resolves', function() {
  assert.match(
    script('cascade.yml', 'Bump @maxonfjvipon/xslint'),
    /::error::[^\n]+\n +exit 1/,
    'a probe that falls through silently blames the install for the wait',
  )
})

test('the cascade install resolves from what the probe left cached', function() {
  assert.match(
    script('cascade.yml', 'Bump @maxonfjvipon/xslint'),
    /npm install --save "@maxonfjvipon\/xslint@\^\$\{NEW\}"/,
    'an install that asks the registry again rolls the race the probe has just won',
  )
})

test('the cascade probe starts its count over on a miss', function() {
  assert.match(
    script('cascade.yml', 'Bump @maxonfjvipon/xslint'),
    /\n +else\n(?: +(?!fi\n)\S[^\n]*\n)*? +streak=0\n/,
    'a count that survives a miss asks for three resolutions at any time, not in a row',
  )
})

test('the cascade bump is bounded by a step timeout', function() {
  assert.match(
    script('cascade.yml', 'Bump @maxonfjvipon/xslint'),
    /^ +timeout-minutes: \d+$/m,
    'a bump without a timeout of its own can hold the job for six hours',
  )
})

test('the cascade probe bounds every call it makes', function() {
  assert.match(
    script('cascade.yml', 'Bump @maxonfjvipon/xslint'),
    /timeout \d+ npm pack /,
    'one hung request would spend the step timeout before the error is ever printed',
  )
})

test('the cascade probe keeps the reason of every miss', function() {
  assert.match(
    script('cascade.yml', 'Bump @maxonfjvipon/xslint'),
    /reason="\$\(timeout \d+ npm pack [^\n]*2>&1 > \/dev\/null\)"/,
    'a give-up that discards stderr cannot tell notarget from a network failure',
  )
})

test('the cascade probe does not sleep after its last attempt', function() {
  assert.match(
    script('cascade.yml', 'Bump @maxonfjvipon/xslint'),
    /seq 1 (\d+)\)[\s\S]*?if \[ "\$\{attempt\}" -lt \1 \]; then\n +sleep \d+/,
    'a sleep after the final miss only delays the error',
  )
})
