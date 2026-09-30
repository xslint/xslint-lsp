/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const fs = require('node:fs')
const path = require('node:path')
const {fileURLToPath} = require('node:url')
const {stylesheetsOf, sourceOf} = require('@maxonfjvipon/xslint')

/**
 * The filesystem path a document URI points at, which is the name every source
 * is keyed by, since that is the name a stylesheet read from disk has. An
 * editor also holds documents that name no file — an untitled buffer, a
 * version-control diff — and a URI that cannot be turned into a path stands
 * for one, matching nothing on disk.
 * @param {string} uri - The document URI
 * @return {string} - The path, or the URI itself
 */
const file = function(uri) {
  try {
    return fileURLToPath(uri)
  } catch {
    return uri
  }
}

/**
 * Whether a path is a directory or lies below it. A path on another drive lies
 * below nothing here, and `path.relative` says so by answering an absolute
 * path of its own, which Windows alone produces.
 * @param {string} dir - The directory
 * @param {string} pth - The path to judge
 * @return {boolean} - True where the path is the directory or under it
 */
const inside = function(dir, pth) {
  const below = path.relative(dir, pth)
  return !path.isAbsolute(below) && below.split(path.sep)[0] !== '..'
}

/**
 * The directory `xslint` is run in, with no path, to read the project a
 * stylesheet belongs to: the one holding the `.xslint.yml` the settings come
 * from, where that file sits inside the workspace folder holding the
 * stylesheet, or else that folder itself. A configuration above the workspace
 * — one in a home directory — decides the rules but not what is read, or a
 * keystroke would walk the whole home. A stylesheet outside every folder has
 * no project, and is read alone, as `xslint` naming that file reads it.
 * @param {Array.<string>} folders - The workspace's root directories
 * @param {object} settings - What xslint's `settingsOf` answers
 * @param {string} own - The stylesheet's path
 * @return {Array.<string>} - The directory, or none
 */
const rooted = function(folders, settings, own) {
  let found = folders.filter((dir) => inside(dir, own))
    .sort((one, two) => two.length - one.length).slice(0, 1)
  if (settings.file &&
    found.some((dir) => inside(dir, path.dirname(settings.file)))) {
    found = [path.dirname(settings.file)]
  }
  return found
}

/**
 * The stylesheets `xslint` run in the project's directory reads, found by
 * xslint's own walk, so an `.xslt` is read, and what a `.gitignore` or an
 * `exclude:` keeps out is kept out here too, and the warnings that walk gives
 * on the way. With no project directory it is the stylesheet alone. Whatever
 * the settings exclude is dropped from either, so a configuration nobody
 * could read leaves nothing to lint.
 * @param {Array.<string>} roots - The project's directory, or none
 * @param {object} settings - What xslint's `settingsOf` answers
 * @param {string} own - The stylesheet's path
 * @return {{stylesheets: Array.<string>, problems: Array.<string>}} - Paths of
 *  the stylesheets read, and one sentence per warning
 */
const gathered = function(roots, settings, own) {
  let found = {stylesheets: [own], problems: []}
  if (roots.length > 0) {
    found = stylesheetsOf(roots, settings)
  }
  return {
    stylesheets: found.stylesheets.filter((one) => !settings.excluded(one)),
    problems: found.problems,
  }
}

/**
 * What `lint` takes for each stylesheet: the text of its open buffer, so every
 * check sees the unsaved edits, or else what the disk holds, with the
 * parameter entities and the missing hrefs read beside it by xslint itself.
 * @param {Array.<string>} stylesheets - Paths of the stylesheets
 * @param {Map.<string, string>} buffers - The open documents' text by path
 * @return {Array.<object>} - Sources for `lint`
 */
const sources = function(stylesheets, buffers) {
  return stylesheets.map((one) => sourceOf(
    one, buffers.get(one) ?? fs.readFileSync(one, 'utf-8'),
  ))
}

module.exports = {
  file,
  rooted,
  gathered,
  sources,
}
