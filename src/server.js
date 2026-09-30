#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const path = require('node:path')
const {pathToFileURL} = require('node:url')
const {
  createConnection, TextDocuments, TextDocumentSyncKind, ProposedFeatures,
  DidChangeWatchedFilesNotification, FileChangeType,
} = require('vscode-languageserver/node')
const {TextDocument} = require('vscode-languageserver-textdocument')
const {diagnostics} = require('./diagnostics')
const {actions} = require('./actions')
const {
  file, canonical, beside, rooted, gathered, sources,
} = require('./corpus')
const {settled, noted: graded} = require('./settings')
const {verdict} = require('./verdict')

/**
 * The connection to the editor, over whatever transport the client chose
 * (stdio, a node IPC channel, a socket).
 */
const connection = createConnection(ProposedFeatures.all)

/**
 * The open documents, kept in sync with the editor's buffers.
 */
const documents = new TextDocuments(TextDocument)

/**
 * The folders the client announced, spelled as the filesystem spells them,
 * which is what decides the project a stylesheet belongs to where no
 * `.xslint.yml` inside one says otherwise.
 * @type {Array.<string>}
 */
let roots = []

/**
 * Whether the client lets the server ask it to watch files, which is how an
 * edit to a `.xslint.yml` reaches the server.
 * @type {boolean}
 */
let watching = false

/*
 * @todo #45:90min Lint the buffer on a keystroke and the corpus on idle. A
 *  change now lints every stylesheet of the workspace — 260ms for the 54 of
 *  objectionary/eo, linear in the XPath a corpus holds — and nothing
 *  debounces it, so a few hundred stylesheets leave the server unable to
 *  answer between keystrokes. Only six checks read more than one file: the
 *  four of corpus-linter and the two of import-linter, 7ms together over a
 *  corpus already parsed. The rest judges each stylesheet alone, and the
 *  filter below throws all but one file of it away. Lint the buffer by itself
 *  with those six suppressed, and run the corpus pass on save or when the
 *  editor falls idle. xslint's STAGES names the checks a stage owns but not
 *  which of them read a second file, so that list is worth asking upstream
 *  for rather than pinning here.
 */

/*
 * @todo #66:45min Publish the walk warnings of a configuration once for all
 *  the roots it governs. A `.xslint.yml` above a multi-root workspace is
 *  walked per folder, so an exclusion that excluded nothing under one folder
 *  and something under another shows or hides with the document checked last,
 *  and `watched` publishes it with none of them before the re-checks run.
 *  Warn only of what holds over every root the file governs.
 */

/**
 * What a file is judged under: the settings `xslint` run from its directory
 * reads, the `.xslint.yml` they come from and its problems, with the warnings
 * xslint's walk gives beside them, and the stylesheets that run reads. It
 * walks the project afresh every time, so a stylesheet created, deleted or
 * newly ignored is read as the command line would read it on its next run.
 * Everything is judged under the filesystem's own spelling of the file, and
 * the configuration named under the editor's, where its problems belong.
 * @param {string} spelled - The file's path, as the editor spelled it
 * @return {{settings: object, configs: Array.<string>,
 *  problems: Array.<object>, stylesheets: Array.<string>}} - What it is
 *  judged under
 */
const judged = function(spelled) {
  const own = canonical(spelled)
  const found = settled(path.dirname(own))
  const read = gathered(rooted(roots, found.settings, own), found.settings, own)
  return {
    ...found,
    configs: found.configs.map((config) => beside(config, own, spelled)),
    problems: [...found.problems, ...graded(read.problems, 'warning')],
    stylesheets: read.stylesheets,
  }
}

/**
 * The text of every open document by the path it names, as the filesystem
 * spells it, which is what stands in for the copy on disk, saved or not.
 * @return {Map.<string, string>} - The buffers
 */
const buffers = function() {
  return new Map(
    documents.all().map(
      (document) => [canonical(file(document.uri)), document.getText()],
    ),
  )
}

/**
 * Publish the problems of every configuration found onto its own file.
 * @param {Array.<string>} configs - The configuration files
 * @param {Array.<object>} problems - Their problems, as diagnostics
 */
const noted = function(configs, problems) {
  for (const config of configs) {
    connection.sendDiagnostics({
      uri: pathToFileURL(config).href, diagnostics: problems,
    })
  }
}

/**
 * Lint one document among the other stylesheets of its project and push its
 * diagnostics to the editor, under the `.xslint.yml` that `xslint` run from
 * the document's directory reads, whose problems are pushed onto that file.
 * Every open buffer stands in for its own file, so unsaved edits are checked;
 * the rest of the project is there only so that a cross-file check can see a
 * declaration used elsewhere, and the defects found in it belong to those
 * files, not to this one. The configuration is read afresh every time, so an
 * edit to it is never answered with what it said before.
 * @param {TextDocument} document - The document to lint
 */
const check = function(document) {
  const {settings, configs, problems, stylesheets} = judged(file(document.uri))
  noted(configs, problems)
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: diagnostics(
      verdict(document, sources(stylesheets, buffers()), settings),
    ),
  })
}

/**
 * The directories of the workspace the client announced. A client that speaks
 * only the older half of the protocol names a single root rather than a list
 * of folders, and is answered the same way.
 * @param {{workspaceFolders: Array.<{uri: string}>, rootUri: string}} params -
 *  The client's initialize parameters
 * @return {Array.<string>} - The directories to read the corpus from
 */
const folders = function(params) {
  const roots = (params.workspaceFolders ?? []).map((folder) => folder.uri)
  if (roots.length === 0 && params.rootUri) {
    roots.push(params.rootUri)
  }
  return roots.map((uri) => file(uri))
}

/**
 * Take the folders the client has open and announce what the server supports:
 * full-document text sync is enough, since every check re-reads the whole
 * buffer anyway, and saves are asked for because a save is what a sibling
 * closed after it leaves on disk for the cross-file checks.
 * @param {{workspaceFolders: Array.<{uri: string}>, rootUri: string}} params -
 *  The client's initialize parameters
 * @return {object} - The initialize result
 */
const initialize = function(params) {
  roots = folders(params).map(canonical)
  watching = Boolean(
    params.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration,
  )
  return {
    capabilities: {
      textDocumentSync: {
        openClose: true,
        change: TextDocumentSyncKind.Full,
        save: true,
      },
      codeActionProvider: {codeActionKinds: ['quickfix', 'source.fixAll']},
    },
  }
}

/**
 * Offer fixes for the fixable defects in the requested range.
 * @param {{textDocument: {uri: string}, range: object}} params - The request
 * @return {Array.<object>} - Code actions, or none for an unknown document
 */
const acted = function(params) {
  const document = documents.get(params.textDocument.uri)
  let found = []
  if (document) {
    const {settings, stylesheets} = judged(file(document.uri))
    found = actions(
      document, params.range, sources(stylesheets, buffers()), settings,
    )
  }
  return found
}

/**
 * Ask a client that lets the server register for file events to report every
 * change to a `.xslint.yml`, since nothing else tells the server that one
 * turned a check off or excluded a directory.
 */
const initialized = function() {
  if (watching) {
    connection.client.register(
      DidChangeWatchedFilesNotification.type,
      {watchers: [{globPattern: '**/.xslint.yml'}]},
    )
  }
}

/**
 * Judge a `.xslint.yml` that changed on its own, and re-check every open
 * document. A file created or rewritten has its problems published whether or
 * not a document under it is open, so an error fixed after the last such
 * document closed does not stand; a deleted one has its problems cleared,
 * since no search finds it again to publish anything.
 * @param {{changes: Array.<{uri: string, type: number}>}} params - The
 *  changed files
 */
const watched = function(params) {
  for (const change of params.changes) {
    const config = file(change.uri)
    if (change.type === FileChangeType.Deleted) {
      noted([config], [])
    } else {
      noted([config], judged(config).problems)
    }
  }
  for (const document of documents.all()) {
    check(document)
  }
}

/**
 * Re-lint a document whenever it opens or changes.
 * @param {{document: TextDocument}} event - The change event
 */
const changed = function(event) {
  check(event.document)
}

/*
 * @todo #45:60min Re-check the open documents when a stylesheet changes
 *  outside the editor. Every check walks the project afresh, but a stylesheet
 *  added, deleted, or rewritten by a branch checked out, a generator run, or a
 *  sibling edited in another window re-checks nothing until the next edit, and
 *  a folder added to the workspace after startup is not a root at all. Watch
 *  the workspace for `.xsl` and `.xslt` changes through
 *  `workspace/didChangeWatchedFiles`, which the client is willing to register
 *  for, and answer `workspace/didChangeWorkspaceFolders` by taking the
 *  folders that arrive.
 */

/**
 * Re-check every open document once one is saved. A cross-file check should
 * answer to what the project now holds, and the squiggle a save clears is
 * usually on another file — writing the call that brings a template to life
 * leaves the complaint on the stylesheet that declares it.
 */
const saved = function() {
  for (const document of documents.all()) {
    check(document)
  }
}

/**
 * Clear a document's diagnostics when it closes, so stale squiggles do not
 * linger on a file that is no longer open.
 * @param {{document: TextDocument}} event - The close event
 */
const closed = function(event) {
  connection.sendDiagnostics({uri: event.document.uri, diagnostics: []})
}

connection.onInitialize(initialize)
connection.onInitialized(initialized)
connection.onCodeAction(acted)
connection.onDidChangeWatchedFiles(watched)
documents.onDidChangeContent(changed)
documents.onDidSave(saved)
documents.onDidClose(closed)
documents.listen(connection)
connection.listen()
