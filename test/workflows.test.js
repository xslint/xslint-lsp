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

/**
 * Every wait on a release reaching npm: the workflow, the step, the package.
 * @type {Array.<Array.<string>>}
 */
const PROBES = [
  ['cascade.yml', 'Bump @maxonfjvipon/xslint', '@maxonfjvipon/xslint', 'NEW'],
  ['release.yml', 'Wait for the released server', 'xslint-lsp', 'VERSION'],
]

/**
 * The text a regular expression reads as the one given.
 * @param {string} text - Anything
 * @return {string} - The same text, every special character escaped
 */
const escaped = function(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

/**
 * The seconds a probe may spend at worst, every call timing out.
 * @param {string} text - The step holding the probe
 * @return {number} - Seconds
 * @throws {Error} - When the step sleeps in more than one place
 */
const worst = function(text) {
  const sleeps = text.match(/^ +sleep \d+$/gm) ?? []
  if (sleeps.length !== 1) {
    throw new Error(`a probe must sleep in exactly one place, this one sleeps in ${sleeps.length}`)
  }
  const attempts = Number(text.match(/seq 1 (\d+)\)/)[1])
  return attempts * Number(text.match(/timeout (\d+) npm pack /)[1]) +
    (attempts - 1) * Number(sleeps[0].trim().split(' ')[1])
}

PROBES.forEach(([name, step, pkg, variable]) => {
  test(`${name} waits on the document npm install resolves through`, function() {
    assert.doesNotMatch(
      script(name, step),
      new RegExp(`npm view "${escaped(pkg)}@`),
      'npm view reads a packument the registry caches apart from the one npm install reads',
    )
  })
  test(`${name} probe revalidates what npm has cached`, function() {
    assert.match(
      script(name, step),
      new RegExp(`npm pack --dry-run --prefer-online "${escaped(pkg)}@\\$\\{${variable}\\}"`),
      'a probe that trusts the local cache sees a stale miss for five minutes',
    )
  })
  test(`${name} probe asks for several resolutions in a row`, function() {
    assert.match(
      script(name, step),
      /-ge [2-9]\b/,
      'one lucky edge of the registry cannot be allowed to stand for all of them',
    )
  })
  test(`${name} fails loudly when the release never resolves`, function() {
    assert.match(
      script(name, step),
      /::error::[^\n]+\n +exit 1/,
      'a probe that falls through silently blames the install for the wait',
    )
  })
  test(`${name} probe starts its count over on a miss`, function() {
    assert.match(
      script(name, step),
      /\n +else\n(?: +(?!fi\n)\S[^\n]*\n)*? +streak=0\n/,
      'a count that survives a miss asks for three resolutions at any time, not in a row',
    )
  })
  test(`${name} probe is bounded by a step timeout`, function() {
    assert.match(
      script(name, step),
      /^ +timeout-minutes: \d+$/m,
      'a probe without a timeout of its own can hold the job for six hours',
    )
  })
  test(`${name} probe bounds every call it makes`, function() {
    assert.match(
      script(name, step),
      /timeout \d+ npm pack /,
      'one hung request would spend the step timeout before the error is ever printed',
    )
  })
  test(`${name} probe keeps the reason of every miss`, function() {
    assert.match(
      script(name, step),
      /reason="\$\(timeout \d+ npm pack [^\n]*2>&1 > \/dev\/null\)"/,
      'a give-up that discards stderr cannot tell notarget from a network failure',
    )
  })
  test(`${name} probe does not sleep after its last attempt`, function() {
    assert.match(
      script(name, step),
      /seq 1 (\d+)\)[\s\S]*?if \[ "\$\{attempt\}" -lt \1 \]; then\n +sleep \d+/,
      'a sleep after the final miss only delays the error',
    )
  })
  test(`${name} probe gives up only after its step timeout allows`, function() {
    assert.ok(
      worst(script(name, step)) <=
        60 * Number(script(name, step).match(/^ +timeout-minutes: (\d+)$/m)[1]),
      'a step timeout shorter than the probe kills it before the error is ever printed',
    )
  })
})

test('the cascade install resolves from what the probe left cached', function() {
  assert.match(
    script('cascade.yml', 'Bump @maxonfjvipon/xslint'),
    /npm install --save "@maxonfjvipon\/xslint@\^\$\{NEW\}"/,
    'an install that asks the registry again rolls the race the probe has just won',
  )
})

test('the extension install resolves from what the probe left cached', function() {
  assert.match(
    script('release.yml', 'Build the extension'),
    /npm install --save-exact "xslint-lsp@\$\{VERSION\}"\n/,
    'an install that asks the registry again rolls the race the probe has just won',
  )
})

test('the extension waits past the longest propagation npm has shown', function() {
  assert.ok(
    Number(script('release.yml', 'Wait for the released server').match(/seq 1 (\d+)\)/)[1]) *
      Number(script('release.yml', 'Wait for the released server').match(/^ +sleep (\d+)$/m)[1]) >=
      25 * 60,
    'npm served xslint-lsp@0.0.15 installably only 25 minutes after its publish',
  )
})

test('the extension waits for the server before it installs it', function() {
  assert.deepStrictEqual(
    ['Wait for the released server', 'Build the extension'].map(
      (step) => workflow('release.yml').split(/^ +- name: /m).findIndex(
        (block) => block.startsWith(step),
      ),
    ).map(
      (index, position, all) =>
        index > 0 && (position === 0 || all[position - 1] < index),
    ),
    [true, true],
    'a wait standing behind the install lets the install roll the race alone',
  )
})

test('the Marketplace reminder comes once a month', function() {
  assert.match(
    workflow('marketplace.yml'),
    /^ +- cron: '\d+ \d+ \d+ \* \*'$/m,
    'a reminder off a monthly schedule either nags or never comes',
  )
})

test('the Marketplace reminder files an issue', function() {
  assert.match(
    script('marketplace.yml', 'Remind'),
    /gh issue create /,
    'a reminder that opens no issue reaches nobody',
  )
})

test('the Marketplace reminder mentions the maintainer', function() {
  assert.match(
    script('marketplace.yml', 'Remind'),
    /@maxonfjvipon\b/,
    'an issue mentioning nobody notifies nobody',
  )
})

test('the Marketplace reminder stays quiet while the listing is current', function() {
  assert.match(
    script('marketplace.yml', 'Remind'),
    /if \[ "\$\{listed\}" = "\$\{latest\}" \]; then\n(?: +[^\n]*\n)*? +exit 0\n/,
    'a reminder that ignores the listing asks for an upload already made',
  )
})

test('the Marketplace reminder fails loudly when the listing reads as nothing', function() {
  assert.match(
    script('marketplace.yml', 'Remind'),
    /if \[ -z "\$\{listed\}" \] \|\| \[ "\$\{listed\}" = null \]; then\n +echo "::error::[^\n]+\n +exit 1\n/,
    'a gallery that answered nothing cannot be read as a listing that trails',
  )
})

test('the Marketplace reminder waits for the release to carry its vsix', function() {
  assert.match(
    script('marketplace.yml', 'Remind'),
    /\.assets\[\]\.name[\s\S]*?xslint-vscode-\$\{latest\}\.vsix[\s\S]*?exit 0\n[\s\S]*?gh issue create /,
    'an issue filed before the release carries its vsix links to a missing file',
  )
})

test('the Marketplace reminder stops at the first failing command', function() {
  assert.match(
    script('marketplace.yml', 'Remind'),
    /^ +set -euo pipefail$/m,
    'a curl failing in front of jq leaves an empty listing for the reminder to report',
  )
})
