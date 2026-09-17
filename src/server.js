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
 * @todo #45:60min Parse the corpus once, not on every keystroke. A change now
 *  re-parses every stylesheet of the workspace — 340ms on a 54-file project —
 *  because `lint` takes raw sources and cannot reuse the documents it parsed a
 *  keystroke ago. Either let xslint hand the parsed corpus back so it can be
 *  passed in again, or keep the parsed stylesheets here and re-parse only the
 *  buffer that changed.
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
 * Read the workspace the client has open and announce what the server
 * supports: full-document text sync is enough, since every check re-reads the
 * whole buffer anyway.
 * @param {{workspaceFolders: Array.<{uri: string}>}} params - The client's
 *  initialize parameters, naming the folders of its workspace
 * @return {object} - The initialize result
 */
const initialize = function(params) {
  corpus = stylesheets(
    (params.workspaceFolders ?? []).map((folder) => file(folder.uri)),
  )
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
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
documents.onDidClose(closed)
documents.listen(connection)
connection.listen()
