/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const fs = require('node:fs')
const path = require('node:path')
const {fileURLToPath} = require('node:url')

/**
 * Directory names the walk never descends into. A workspace's own stylesheets
 * do not live in its dependencies or its build output, and on a large project
 * those trees hold far more files than the corpus itself.
 * @type {Array.<string>}
 */
const SKIPPED = ['node_modules', 'target']

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
 * Whether the walk passes a directory by, rather than descending into it.
 * @param {string} name - The directory's name
 * @return {boolean} - True for metadata, dependency, and build directories
 */
const skipped = function(name) {
  return name.startsWith('.') || SKIPPED.includes(name)
}

/**
 * Every stylesheet below a directory. A symbolic link is neither a directory
 * nor a file here, so the walk steps over one rather than following it into a
 * tree it has already read, or into a loop. The extension is the one xslint's
 * own walk takes, so an editor and a command line agree on what the corpus is.
 * @param {string} dir - The directory to walk
 * @return {Array.<string>} - Paths of the `.xsl` files under it
 */
const xsls = function(dir) {
  let found = []
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.isDirectory() && !skipped(entry.name)) {
      found = found.concat(xsls(path.join(dir, entry.name)))
    } else if (entry.isFile() && entry.name.endsWith('.xsl')) {
      found.push(path.join(dir, entry.name))
    }
  }
  return found
}

/**
 * Every stylesheet the workspace holds, read once. This is what xslint's
 * cross-file checks judge a declaration against: a function or a named template
 * that one module declares and another calls is alive, and only a corpus
 * holding both of them can see that. A folder the client no longer has is
 * passed over, so a stale root costs a smaller corpus rather than the server.
 * @param {Array.<string>} folders - The workspace's root directories
 * @return {Array.<{file: string, content: string}>} - Sources for `lint`
 */
const stylesheets = function(folders) {
  const corpus = new Map()
  for (const folder of folders.filter((dir) => fs.existsSync(dir))) {
    for (const found of xsls(folder)) {
      corpus.set(found, fs.readFileSync(found, 'utf-8'))
    }
  }
  return [...corpus].map(([name, text]) => ({file: name, content: text}))
}

/**
 * The corpus with a document's live text standing in for the copy read from
 * disk, so every check sees the unsaved edits, and with the document in it even
 * when it lives outside the workspace.
 * @param {Array.<{file: string, content: string}>} corpus - The corpus
 * @param {TextDocument} document - The document being edited
 * @return {Array.<{file: string, content: string}>} - Sources for `lint`
 */
const sources = function(corpus, document) {
  const own = file(document.uri)
  return [
    {file: own, content: document.getText()},
    ...corpus.filter((source) => source.file !== own),
  ]
}

module.exports = {
  file,
  stylesheets,
  sources,
}
