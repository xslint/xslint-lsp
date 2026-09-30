/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const fs = require('node:fs')
const path = require('node:path')
const {settingsOf} = require('@maxonfjvipon/xslint')
const {diagnostics} = require('./diagnostics')

/**
 * The name xslint looks for in a directory and every one above it.
 * @type {string}
 */
const NAME = '.xslint.yml'

/**
 * The configuration file a search from a directory finds: the nearest
 * `.xslint.yml` in it or in a directory above it, which is the file xslint
 * reads, or none.
 * @param {string} dir - The directory the search starts in
 * @return {Array.<string>} - The file's path, or nothing
 */
const located = function(dir) {
  const candidate = path.join(dir, NAME)
  let found = []
  if (fs.existsSync(candidate)) {
    found = [candidate]
  } else if (path.dirname(dir) !== dir) {
    found = located(path.dirname(dir))
  }
  return found
}

/**
 * The problems of a configuration, as diagnostics on its first character,
 * since xslint names what is wrong with a file but not where.
 * @param {Array.<string>} messages - One sentence per problem
 * @param {string} severity - The severity every one of them carries
 * @return {Array.<object>} - LSP Diagnostic objects
 */
const noted = function(messages, severity) {
  return diagnostics(messages.map((message) => ({
    severity: severity, message: message, line: 1, pos: 1,
  })))
}

/**
 * What `xslint` run from a directory hands `lint`, read off the `.xslint.yml`
 * nearest to it by xslint itself, and the problems of that file. The command
 * line warns about a problem and lints on, so it is a warning here too; it
 * refuses to lint at all under a file no YAML parser reads or one naming a
 * preset that does not exist, which is normal halfway through an edit, and so
 * does the editor, excluding every stylesheet rather than guessing a
 * configuration and showing what no run of `xslint` would report.
 * @param {string} dir - The directory the search for `.xslint.yml` starts in
 * @return {{settings: object, configs: Array.<string>,
 *  problems: Array.<object>}} - The options `lint` takes, the file they come
 *  from, if any, and its problems as diagnostics
 */
const settled = function(dir) {
  let found
  try {
    const settings = settingsOf(dir)
    found = {settings: settings, problems: noted(settings.problems, 'warning')}
  } catch (error) {
    found = {
      settings: {excluded: () => true},
      problems: noted([error.message], 'error'),
    }
  }
  return {...found, configs: located(dir)}
}

module.exports = {
  settled,
}
