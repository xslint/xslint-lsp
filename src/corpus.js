/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const fs = require('node:fs')
const path = require('node:path')
const {fileURLToPath} = require('node:url')
const {stylesheetsOf, sourceOf} = require('@maxonfjvipon/xslint')

/**
 * The filesystem path a document URI points at, spelled the way the editor
 * spelled it, which is the name its diagnostics are published under. An
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
 * A path as the filesystem itself spells it: every link resolved and every
 * name in the case it is stored in, which is how xslint's walk names what it
 * finds, so a folder announced through a link, or a drive letter the editor
 * wrote in lower case, still holds the document. A file not yet on disk keeps
 * its own name under the spelling of the nearest directory that is.
 * @param {string} pth - A path, or a URI that names no file
 * @return {string} - The same path, spelled as the filesystem spells it
 */
const canonical = function(pth) {
  let found = pth
  try {
    found = fs.realpathSync.native(pth)
  } catch {
    if (path.isAbsolute(pth) && path.dirname(pth) !== pth) {
      found = path.join(canonical(path.dirname(pth)), path.basename(pth))
    }
  }
  return found
}

/**
 * A file standing in a directory above a document, spelled the way the editor
 * spelled the document, so a configuration's problems land on the file the
 * editor knows by that name rather than on a second spelling of it. Where a
 * link between the two makes the climb land elsewhere, the file keeps the
 * filesystem's own spelling.
 * @param {string} pth - The file, as the filesystem spells it
 * @param {string} own - The document, as the filesystem spells it
 * @param {string} spelled - The document, as the editor spelled it
 * @return {string} - The file, spelled beside the document
 */
const beside = function(pth, own, spelled) {
  const candidate = path.join(
    path.dirname(spelled), path.relative(path.dirname(own), path.dirname(pth)),
    path.basename(pth),
  )
  let found = pth
  if (canonical(path.dirname(candidate)) === path.dirname(pth)) {
    found = candidate
  }
  return found
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
 * stylesheet belongs to: the outermost workspace folder holding it, the root
 * xslint-action runs at, which reads one `.xslint.yml` for every file under
 * it, a nested one and a nested folder included. A stylesheet outside every
 * folder has no project, and is read alone, as `xslint` naming that file
 * reads it.
 * @param {Array.<string>} folders - The workspace's root directories
 * @param {string} own - The stylesheet's path
 * @return {Array.<string>} - The directory, or none
 */
const rooted = function(folders, own) {
  return folders.filter((dir) => inside(dir, own))
    .sort((one, two) => one.length - two.length)
    .slice(0, 1)
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
  canonical,
  beside,
  rooted,
  gathered,
  sources,
}
