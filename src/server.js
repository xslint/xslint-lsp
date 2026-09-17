#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const {
  createConnection, TextDocuments, TextDocumentSyncKind, ProposedFeatures,
} = require('vscode-languageserver/node')
const {TextDocument} = require('vscode-languageserver-textdocument')
const {lint} = require('@maxonfjvipon/xslint')
const {diagnostics} = require('./diagnostics')
const {actions} = require('./actions')
const {file, stylesheets, sources} = require('./corpus')

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
 * The workspace's stylesheets, read when the client announces its folders. A
 * cross-file check calls a declaration dead when nothing in the corpus refers
 * to it, so a document linted on its own is told every symbol it exports is
 * unused.
 * @type {Array.<{file: string, content: string}>}
 */
let corpus = []

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

/**
 * Lint one document among the workspace's other stylesheets and push its
 * diagnostics to the editor. The buffer's text stands in for its own file, so
 * unsaved edits are checked; the rest of the corpus is there only so that a
 * cross-file check can see a declaration used elsewhere, and the defects found
 * in it belong to those files, not to this one.
 * @param {TextDocument} document - The document to lint
 */
const check = function(document) {
  const own = file(document.uri)
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: diagnostics(
      lint(sources(corpus, document)).filter((one) => one.file === own),
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
 * Read the workspace the client has open and announce what the server
 * supports: full-document text sync is enough, since every check re-reads the
 * whole buffer anyway, and saves are asked for because a save is what takes an
 * edit into the corpus the cross-file checks are judged against.
 * @param {{workspaceFolders: Array.<{uri: string}>, rootUri: string}} params -
 *  The client's initialize parameters
 * @return {object} - The initialize result
 */
const initialize = function(params) {
  corpus = stylesheets(folders(params))
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
  return document ? actions(document, params.range, corpus) : []
}

/**
 * Re-lint a document whenever it opens or changes.
 * @param {{document: TextDocument}} event - The change event
 */
const changed = function(event) {
  check(event.document)
}

/*
 * @todo #45:60min Keep the corpus abreast of the files the editor does not
 *  save. A save takes that one document into the corpus, but a stylesheet
 *  added, deleted, or rewritten outside the editor — a branch checked out, a
 *  generator run, a sibling edited in another window — is not noticed, and a
 *  folder added to the workspace after startup is not read at all. Watch the
 *  workspace for `.xsl` changes through `workspace/didChangeWatchedFiles`,
 *  which the client is willing to register for, and answer
 *  `workspace/didChangeWorkspaceFolders` by reading the folders that arrive.
 */

/**
 * Take a saved document into the corpus and re-check every open one. A
 * cross-file check should answer to what the workspace now holds rather than
 * to what it held at startup, and the squiggle a save clears is usually on
 * another file — writing the call that brings a template to life leaves the
 * complaint on the stylesheet that declares it.
 * @param {{document: TextDocument}} event - The save event
 */
const saved = function(event) {
  corpus = sources(corpus, event.document)
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
connection.onCodeAction(acted)
documents.onDidChangeContent(changed)
documents.onDidSave(saved)
documents.onDidClose(closed)
documents.listen(connection)
connection.listen()
