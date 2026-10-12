/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const fs = require('node:fs')
const path = require('node:path')
const {pathToFileURL} = require('node:url')
const {settingsOf, ledgerOf} = require('@maxonfjvipon/xslint')
const {diagnostics} = require('./diagnostics')

/**
 * The name xslint looks for in a directory and every one above it.
 * @type {string}
 */
const NAME = '.xslint.yml'

/**
 * The configuration file a search from a directory finds, for the one case
 * xslint does not say which file it read: a file it refuses to read at all.
 * @todo #63:30min Read the file a refused configuration came from off the
 *  error `settingsOf` throws, once xslint names it there, and drop this second
 *  copy of its search, which only the refused case still runs.
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
 * What a stylesheet shows when xslint refuses its configuration: one error
 * per refusal on its first character, naming the file and the first line of
 * the reason, which for unparseable YAML goes on to quote the whole file, and
 * linking to the file with the whole reason, since the error on the file
 * itself may sit in a buffer the user never opens.
 * @param {Array.<string>} configs - The refused files, as the editor names them
 * @param {Array.<string>} refusals - Why xslint refuses them
 * @return {Array.<object>} - LSP Diagnostic objects
 */
const refused = function(configs, refusals) {
  return configs.flatMap((config) => refusals.map((refusal) => ({
    ...noted([`xslint lints nothing here, since it refuses ${config}: ${refusal.split('\n')[0]}`], 'error')[0],
    relatedInformation: [{
      location: {
        uri: pathToFileURL(config).href,
        range: {start: {line: 0, character: 0}, end: {line: 0, character: 1}},
      },
      message: refusal,
    }],
  })))
}

/**
 * The baseline the settings name, read the way the command line reads it,
 * or one recording nothing, under which every defect is fresh. A baseline the
 * command line refuses to read is refused here too, and named in front of
 * the reason where the reason does not name it, as JSON's reason for text it
 * cannot parse does not.
 * @param {object} settings - What xslint's `settingsOf` answers
 * @return {{counts: object, base: string}} - What `baselined` takes
 */
const ledgered = function(settings) {
  let ledger = {counts: {}, base: settings.base}
  if (settings.baseline) {
    try {
      ledger = ledgerOf(settings.baseline)
    } catch (error) {
      let reason = error.message
      if (!reason.includes(settings.baseline)) {
        reason = `Baseline ${settings.baseline} cannot be read: ${reason}`
      }
      throw new Error(reason, {cause: error})
    }
  }
  return ledger
}

/**
 * What `xslint` run from a directory hands `lint`, read off the `.xslint.yml`
 * nearest to it by xslint itself, the file it read, the problems of that
 * file, the baseline it names, and why it refuses it, if it does. The command
 * line warns about a problem and lints on, so it is a warning here too; it
 * refuses to lint at all under a file no YAML parser reads, one naming a
 * preset that does not exist, one whose `only:` holds an entry that is empty
 * or names no check, which is normal halfway through an edit, or one whose
 * `baseline:` names a file it cannot read, and so does the editor, excluding
 * every stylesheet rather than guessing a configuration and showing what no
 * run of `xslint` would report.
 * @param {string} dir - The directory the search for `.xslint.yml` starts in
 * @return {{settings: object, configs: Array.<string>,
 *  problems: Array.<object>, refusals: Array.<string>,
 *  ledger: {counts: object, base: string}}} - The options `lint` takes, the
 *  file they come from, if any, its problems as diagnostics, why xslint
 *  refuses it, and the baseline it names
 */
const settled = function(dir) {
  let found
  try {
    const settings = settingsOf(dir)
    found = {
      settings: settings,
      configs: [settings.file].filter(Boolean),
      problems: noted(settings.problems, 'warning'),
      refusals: [],
      ledger: ledgered(settings),
    }
  } catch (error) {
    found = {
      settings: {excluded: () => true, exclude: [], base: dir},
      configs: located(dir),
      problems: noted([error.message], 'error'),
      refusals: [error.message],
      ledger: {counts: {}, base: dir},
    }
  }
  return found
}

module.exports = {
  settled,
  noted,
  refused,
}
