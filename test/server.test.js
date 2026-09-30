/*
 * SPDX-FileCopyrightText: Copyright (c) 2025-2026 Max Trunnikov
 * SPDX-License-Identifier: MIT
 */

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {pathToFileURL} = require('node:url')
const {spawn, spawnSync} = require('node:child_process')
const {diagnostics} = require('../src/diagnostics')

/**
 * A minimal LSP client over stdio: it spawns the server, frames JSON-RPC
 * messages with their `Content-Length` header, parses the server's framed
 * replies, and hands each `textDocument/publishDiagnostics` to whoever is
 * waiting. Enough to drive the server through a document's lifecycle.
 */
class Client {
  /** Spawn the server and start reading its framed output. */
  constructor() {
    this.server = spawn(
      'node', [path.resolve(__dirname, '..', 'src', 'server.js'), '--stdio'],
      {stdio: ['pipe', 'pipe', 'inherit']},
    )
    this.buffer = Buffer.alloc(0)
    this.waiting = []
    this.awaited = new Map()
    this.latest = new Map()
    this.responses = new Map()
    this.asked = new Map()
    this.nextId = 1000
    this.server.stdout.on('data', (chunk) => this.consume(chunk))
  }

  /**
   * Send a JSON-RPC message to the server.
   * @param {object} message - The message, without the `jsonrpc` field
   */
  send(message) {
    const body = JSON.stringify({jsonrpc: '2.0', ...message})
    this.server.stdin.write(
      `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
    )
  }

  /**
   * Parse every complete framed message in the buffer, resolving a pending
   * waiter for each diagnostics notification.
   * @param {Buffer} chunk - Bytes read from the server
   */
  consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    let boundary = this.buffer.indexOf('\r\n\r\n')
    while (boundary >= 0) {
      const length = Number(
        /Content-Length: (\d+)/.exec(this.buffer.subarray(0, boundary))[1],
      )
      const start = boundary + 4
      if (this.buffer.length < start + length) {
        break
      }
      const message = JSON.parse(
        this.buffer.subarray(start, start + length).toString(),
      )
      this.buffer = this.buffer.subarray(start + length)
      if (message.method === 'textDocument/publishDiagnostics') {
        const {uri, diagnostics} = message.params
        this.latest.set(uri, diagnostics)
        if (this.awaited.has(uri)) {
          this.awaited.get(uri)(diagnostics)
          this.awaited.delete(uri)
        }
        if (this.waiting.length > 0) {
          this.waiting.shift()(diagnostics)
        }
      } else if (Object.hasOwn(message, 'result') && this.responses.has(message.id)) {
        const resolve = this.responses.get(message.id)
        this.responses.delete(message.id)
        resolve(message.result)
      } else if (Object.hasOwn(message, 'id') && this.asked.has(message.method)) {
        this.asked.get(message.method)(message.params)
        this.asked.delete(message.method)
        this.send({id: message.id, result: null})
      }
      boundary = this.buffer.indexOf('\r\n\r\n')
    }
  }

  /**
   * A promise for the next diagnostics notification.
   * @return {Promise.<Array.<object>>} - The published diagnostics
   */
  diagnostics() {
    return new Promise((resolve) => this.waiting.push(resolve))
  }

  /**
   * A promise for the next diagnostics notification about one document, which
   * the server may publish among notifications about its siblings.
   * @param {string} uri - The document URI
   * @return {Promise.<Array.<object>>} - That document's diagnostics
   */
  about(uri) {
    return new Promise((resolve) => this.awaited.set(uri, resolve))
  }

  /**
   * What the editor would be showing for a document: the diagnostics last
   * published about it, having waited a bounded moment for a fresh
   * notification. A server that never republishes leaves the stale ones
   * standing, which is exactly what the editor would show, so a regression
   * fails the assertion instead of hanging on a promise that never settles.
   * @param {string} uri - The document URI
   * @return {Promise.<Array.<object>>} - The diagnostics it would be showing
   */
  async showing(uri) {
    await Promise.race([
      this.about(uri),
      new Promise((resolve) => setTimeout(resolve, 3000).unref()),
    ])
    return this.latest.get(uri)
  }

  /**
   * A promise for the params of the next request the server makes of the
   * client with a method, which the client answers with an empty result.
   * @param {string} method - The request method
   * @return {Promise.<object>} - The request's params
   */
  requested(method) {
    return new Promise((resolve) => this.asked.set(method, resolve))
  }

  /**
   * Send a request and resolve with its result.
   * @param {string} method - The request method
   * @param {object} params - The request params
   * @return {Promise.<*>} - The result
   */
  request(method, params) {
    this.nextId += 1
    const id = this.nextId
    return new Promise((resolve) => {
      this.responses.set(id, resolve)
      this.send({id: id, method: method, params: params})
    })
  }

  /**
   * Ask the server to shut down and exit cleanly, resolving once its process
   * has gone. A graceful exit lets coverage flush, unlike a kill.
   * @return {Promise.<void>} - Resolves when the server process exits
   */
  close() {
    this.send({id: 2, method: 'shutdown'})
    this.send({method: 'exit'})
    return new Promise((resolve) => this.server.on('exit', () => resolve()))
  }
}

/**
 * A committed fixture stylesheet, as text.
 * @param {string} name - Fixture file name under test/fixtures
 * @return {string} - Its content
 */
const fixture = function(name) {
  return fs.readFileSync(path.resolve(__dirname, 'fixtures', name), 'utf-8')
}

/**
 * A project in a fresh temporary directory, holding the named fixtures under
 * their own names — the workspace an editor would announce at initialize.
 * @param {Array.<string>} names - Fixture file names under test/fixtures
 * @return {string} - The workspace directory
 */
const workspace = function(names) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xslint-lsp-'))
  for (const name of names) {
    fs.writeFileSync(path.join(root, name), fixture(name))
  }
  return root
}

/**
 * Open a stylesheet of a workspace and return the diagnostics the server
 * publishes for it, with the workspace announced at initialize the way the
 * given announcement has an editor name it.
 * @param {string} root - The workspace directory
 * @param {string} name - The stylesheet to open, relative to the root
 * @param {object} announced - The initialize parameters naming the workspace
 * @return {Promise.<Array.<object>>} - The published diagnostics
 */
const published = async function(root, name, announced) {
  const client = new Client()
  client.send({id: 1, method: 'initialize', params: {
    processId: process.pid, capabilities: {}, ...announced}})
  client.send({method: 'initialized', params: {}})
  const uri = pathToFileURL(path.join(root, name)).href
  const opened = client.about(uri)
  client.send({method: 'textDocument/didOpen', params: {textDocument: {
    uri: uri, languageId: 'xsl', version: 1,
    text: fs.readFileSync(path.join(root, name), 'utf-8')}}})
  const found = await opened
  await client.close()
  return found
}

/**
 * A copy of the committed project in a fresh temporary directory: stylesheets
 * under the `.xslint.yml` that runs every check, turns one off, re-grades
 * another, and excludes a directory. The path is the real one, so the command
 * line, which resolves its own, names the same files the server does.
 * @return {string} - The project directory
 */
const project = function() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'xslint-lsp-')),
  )
  fs.cpSync(path.resolve(__dirname, 'fixtures', 'project'), root,
    {recursive: true})
  return root
}

/**
 * A workspace holding the named stylesheets and, as its `.xslint.yml`, the
 * named configuration fixture.
 * @param {Array.<string>} names - Stylesheet fixture names
 * @param {string} config - Configuration fixture name
 * @return {string} - The workspace directory
 */
const configured = function(names, config) {
  const root = workspace(names)
  fs.writeFileSync(path.join(root, '.xslint.yml'), fixture(config))
  return root
}

/**
 * What the `xslint` command line, run in a project's directory the way a user
 * runs it, reports for one of its stylesheets, as the diagnostics an editor
 * would show for them.
 * @param {string} root - The project directory
 * @param {string} name - The stylesheet, relative to the root
 * @return {Array.<object>} - The diagnostics
 */
const reported = function(root, name) {
  const pkg = require.resolve('@maxonfjvipon/xslint/package.json')
  const run = spawnSync(
    process.execPath,
    [path.join(path.dirname(pkg), require(pkg).bin.xslint), '--format=json'],
    {cwd: root, encoding: 'utf-8', timeout: 30000},
  )
  return diagnostics(
    JSON.parse(run.stdout)
      .filter((one) => path.resolve(root, one.file) === path.join(root, name))
      .map((one) => ({
        name: one.rule, severity: one.severity, message: one.message,
        line: one.line, pos: one.column,
      })),
  )
}

/**
 * Open a stylesheet of a workspace and return the diagnostics the server
 * publishes about its `.xslint.yml`.
 * @param {string} root - The workspace directory
 * @param {string} name - The stylesheet to open, relative to the root
 * @return {Promise.<Array.<object>>} - The configuration's diagnostics
 */
const problems = async function(root, name) {
  const client = new Client()
  client.send({id: 1, method: 'initialize', params: {
    processId: process.pid, capabilities: {}, ...folder(root)}})
  client.send({method: 'initialized', params: {}})
  const shown = client.about(pathToFileURL(path.join(root, '.xslint.yml')).href)
  client.send({method: 'textDocument/didOpen', params: {textDocument: {
    uri: pathToFileURL(path.join(root, name)).href, languageId: 'xsl',
    version: 1, text: fixture(name)}}})
  const found = await shown
  await client.close()
  return found
}

/**
 * The workspace announced as a folder, the way an editor that speaks the whole
 * protocol names what it has open.
 * @param {string} root - The workspace directory
 * @return {object} - Initialize parameters naming that folder
 */
const folder = function(root) {
  return {workspaceFolders: [{uri: pathToFileURL(root).href, name: 'w'}]}
}

test('reports, updates, and clears diagnostics over a document lifecycle',
  async function() {
    const client = new Client()
    client.send({id: 1, method: 'initialize',
      params: {processId: process.pid, rootUri: null, capabilities: {}}})
    client.send({method: 'initialized', params: {}})
    const opened = client.diagnostics()
    client.send({method: 'textDocument/didOpen', params: {textDocument: {
      uri: 'file:///t.xsl', languageId: 'xml', version: 1,
      text: fixture('violations.xsl')}}})
    const first = await opened
    const changed = client.diagnostics()
    client.send({method: 'textDocument/didChange', params: {
      textDocument: {uri: 'file:///t.xsl', version: 2},
      contentChanges: [{text: fixture('updated.xsl')}]}})
    const second = await changed
    const closed = client.diagnostics()
    client.send({method: 'textDocument/didClose',
      params: {textDocument: {uri: 'file:///t.xsl'}}})
    const third = await closed
    await client.close()
    assert.deepEqual(
      [
        first.some((one) => one.code === 'incorrect-use-of-boolean-constants'),
        second.some((one) => one.code === 'incorrect-use-of-boolean-constants'),
        third.length,
      ],
      [true, false, 0],
    )
  })

test('answers a code-action request, and offers none for an unknown document',
  async function() {
    const client = new Client()
    client.send({id: 1, method: 'initialize',
      params: {processId: process.pid, rootUri: null, capabilities: {}}})
    client.send({method: 'initialized', params: {}})
    const opened = client.diagnostics()
    client.send({method: 'textDocument/didOpen', params: {textDocument: {
      uri: 'file:///t.xsl', languageId: 'xsl', version: 1,
      text: fixture('fixable.xsl')}}})
    await opened
    const some = await client.request('textDocument/codeAction', {
      textDocument: {uri: 'file:///t.xsl'},
      range: {start: {line: 0, character: 0}, end: {line: 20, character: 0}},
      context: {diagnostics: []}})
    const none = await client.request('textDocument/codeAction', {
      textDocument: {uri: 'file:///gone.xsl'},
      range: {start: {line: 0, character: 0}, end: {line: 0, character: 0}},
      context: {diagnostics: []}})
    await client.close()
    assert.deepEqual(
      [some.some((one) => one.kind === 'quickfix'), none],
      [true, []],
    )
  })

test('keeps a function that a sibling stylesheet calls out of the report',
  async function() {
    const root = workspace(['library.xsl', 'caller.xsl'])
    const found = await published(root, 'library.xsl', folder(root))
    assert.ok(
      !found.some((one) => one.code === 'unused-function'),
      'a function called from another stylesheet cannot be reported as unused',
    )
  })

test('publishes no defect that belongs to another stylesheet',
  async function() {
    const root = workspace(['library.xsl', 'caller.xsl'])
    const found = await published(root, 'library.xsl', folder(root))
    assert.ok(
      !found.some((one) => one.code === 'incorrect-use-of-boolean-constants'),
      'a defect of a corpus stylesheet cannot be published for the open one',
    )
  })

test('reads the workspace a client announces as a single root',
  async function() {
    const root = workspace(['library.xsl', 'caller.xsl'])
    const found = await published(
      root, 'library.xsl', {rootUri: pathToFileURL(root).href},
    )
    assert.ok(
      !found.some((one) => one.code === 'unused-function'),
      'a client naming one root cannot be left without a corpus',
    )
  })

test('takes a saved stylesheet into the corpus and re-checks the open ones',
  async function() {
    const root = workspace(['library.xsl', 'violations.xsl'])
    const library = pathToFileURL(path.join(root, 'library.xsl')).href
    const sibling = pathToFileURL(path.join(root, 'violations.xsl')).href
    const client = new Client()
    client.send({id: 1, method: 'initialize',
      params: {processId: process.pid, capabilities: {}, ...folder(root)}})
    client.send({method: 'initialized', params: {}})
    const opened = client.about(library)
    client.send({method: 'textDocument/didOpen', params: {textDocument: {
      uri: library, languageId: 'xsl', version: 1,
      text: fixture('library.xsl')}}})
    await opened
    client.send({method: 'textDocument/didOpen', params: {textDocument: {
      uri: sibling, languageId: 'xsl', version: 1,
      text: fixture('violations.xsl')}}})
    client.send({method: 'textDocument/didChange', params: {
      textDocument: {uri: sibling, version: 2},
      contentChanges: [{text: fixture('caller.xsl')}]}})
    client.send({method: 'textDocument/didSave',
      params: {textDocument: {uri: sibling}}})
    const found = await client.showing(library)
    await client.close()
    assert.ok(
      !found.some((one) => one.code === 'unused-function'),
      'a call written and saved next door cannot leave the squiggle standing',
    )
  })

test('takes no stylesheet of another project into the corpus',
  async function() {
    const root = workspace(['library.xsl'])
    const away = workspace(['caller.xsl'])
    const library = pathToFileURL(path.join(root, 'library.xsl')).href
    const stranger = pathToFileURL(path.join(away, 'caller.xsl')).href
    const client = new Client()
    client.send({id: 1, method: 'initialize',
      params: {processId: process.pid, capabilities: {}, ...folder(root)}})
    client.send({method: 'initialized', params: {}})
    const opened = client.about(library)
    client.send({method: 'textDocument/didOpen', params: {textDocument: {
      uri: library, languageId: 'xsl', version: 1,
      text: fixture('library.xsl')}}})
    await opened
    client.send({method: 'textDocument/didOpen', params: {textDocument: {
      uri: stranger, languageId: 'xsl', version: 1,
      text: fixture('caller.xsl')}}})
    const shown = client.about(library)
    client.send({method: 'textDocument/didSave',
      params: {textDocument: {uri: stranger}}})
    client.send({method: 'textDocument/didChange', params: {
      textDocument: {uri: library, version: 2},
      contentChanges: [{text: `${fixture('library.xsl')}\n`}]}})
    const found = await shown
    await client.close()
    assert.ok(
      found.some((one) => one.code === 'unused-function'),
      'a stylesheet outside the workspace cannot vouch for a function in it',
    )
  })

for (const name of ['shelf.xsl', 'main.xsl', path.join('vendor', 'reader.xsl')]) {
  test(`publishes for ${name} what the command line reports for it`,
    {timeout: 20000}, async function() {
      const root = project()
      assert.deepEqual(
        await published(root, name, folder(root)),
        reported(root, name),
        'the editor cannot show what the command line does not report',
      )
    })
}

test('publishes a problem of the configuration on the configuration',
  {timeout: 20000}, async function() {
    assert.ok(
      (await problems(configured(['violations.xsl'], 'unknown.yml'),
        'violations.xsl')).some((one) => one.message.includes('presets')),
      'a key the command line warns about cannot go unmentioned',
    )
  })

test('publishes a configuration no parser reads as an error on it',
  {timeout: 20000}, async function() {
    assert.deepEqual(
      (await problems(configured(['violations.xsl'], 'broken.txt'),
        'violations.xsl')).map((one) => one.severity),
      [1],
      'a configuration the command line refuses cannot pass unremarked',
    )
  })

test('lints nothing under a configuration no parser reads', {timeout: 20000}, async function() {
  const root = configured(['violations.xsl'], 'broken.txt')
  assert.deepEqual(
    await published(root, 'violations.xsl', folder(root)),
    [],
    'a stylesheet cannot be judged by a configuration nobody could read',
  )
})

test('relints the open stylesheets once the configuration changes',
  {timeout: 20000}, async function() {
    const root = workspace(['violations.xsl'])
    const uri = pathToFileURL(path.join(root, 'violations.xsl')).href
    const client = new Client()
    client.send({id: 1, method: 'initialize',
      params: {processId: process.pid, capabilities: {}, ...folder(root)}})
    client.send({method: 'initialized', params: {}})
    const opened = client.about(uri)
    client.send({method: 'textDocument/didOpen', params: {textDocument: {
      uri: uri, languageId: 'xsl', version: 1,
      text: fixture('violations.xsl')}}})
    await opened
    fs.writeFileSync(path.join(root, '.xslint.yml'), fixture('silent.yml'))
    client.send({method: 'workspace/didChangeWatchedFiles', params: {changes: [{
      uri: pathToFileURL(path.join(root, '.xslint.yml')).href, type: 1}]}})
    const found = await client.showing(uri)
    await client.close()
    assert.ok(
      !found.some((one) => one.code === 'incorrect-use-of-boolean-constants'),
      'a check the configuration turned off cannot keep its squiggle',
    )
  })

test('clears the problems of a configuration once it is deleted',
  {timeout: 20000}, async function() {
    const root = configured(['violations.xsl'], 'unknown.yml')
    const config = pathToFileURL(path.join(root, '.xslint.yml')).href
    const client = new Client()
    client.send({id: 1, method: 'initialize',
      params: {processId: process.pid, capabilities: {}, ...folder(root)}})
    client.send({method: 'initialized', params: {}})
    const opened = client.about(config)
    client.send({method: 'textDocument/didOpen', params: {textDocument: {
      uri: pathToFileURL(path.join(root, 'violations.xsl')).href,
      languageId: 'xsl', version: 1, text: fixture('violations.xsl')}}})
    await opened
    fs.rmSync(path.join(root, '.xslint.yml'))
    client.send({method: 'workspace/didChangeWatchedFiles', params: {changes: [{
      uri: config, type: 3}]}})
    const found = await client.showing(config)
    await client.close()
    assert.deepEqual(
      found, [], 'a deleted configuration cannot keep its problems standing',
    )
  })

test('asks a client that registers watchers to watch every configuration',
  {timeout: 20000}, async function() {
    const client = new Client()
    const asked = client.requested('client/registerCapability')
    client.send({id: 1, method: 'initialize', params: {
      processId: process.pid, rootUri: null,
      capabilities: {workspace: {didChangeWatchedFiles: {
        dynamicRegistration: true}}}}})
    client.send({method: 'initialized', params: {}})
    const params = await asked
    await client.close()
    assert.deepEqual(
      params.registrations.flatMap(
        (one) => one.registerOptions.watchers.map((it) => it.globPattern),
      ),
      ['**/.xslint.yml'],
      'an edit to a configuration cannot go unnoticed by the server',
    )
  })
