const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const core = fs.existsSync(path.join(__dirname, '../src/core/openclaw-chat.js')) ? path.join(__dirname, '../src/core') : __dirname;
const { OpenClawChat } = require(path.join(core, 'openclaw-chat.js'));

test('HTTP failure cannot advertise a verified connection', async () => {
  const previous = global.fetch;
  global.fetch = async () => ({ ok: false, status: 503, json: async () => ({ detail: 'local model unavailable' }) });
  try {
    const chat = new OpenClawChat();
    assert.equal(chat.status().connected, false);
    await assert.rejects(chat.ask({ message: 'hello' }), /503.*local model unavailable/);
    assert.equal(chat.status().verified, false);
    assert.equal(chat.status().connected, false);
  } finally { global.fetch = previous; }
});

test('local request preserves actual provider and model and supports cancellation', async () => {
  const previous = global.fetch;
  global.fetch = async (url, request) => {
    assert.equal(JSON.parse(request.body).model, 'openclaw-default');
    assert.equal(request.headers.Authorization, 'Bearer local-gateway');
    return { ok: true, json: async () => ({ provider: 'local-cpu', model: 'heztech-local', choices: [{ message: { content: 'hello' } }] }) };
  };
  try {
    const chat = new OpenClawChat();
    assert.equal((await chat.ask({ message: 'hello' })).provider, 'local-cpu');
    assert.equal(chat.status().verified, true);
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(chat.ask({ message: 'hello', signal: cancelled.signal }));
  } finally { global.fetch = previous; }
});

function liveFixture() {
  let resolve;
  let callbacks;
  let closed = false;
  const session = { close: () => { closed = true; } };
  const context = { module: { exports: {} }, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, process: { env: { HEZTECH_GEMINI_API_KEY: 'fixture' } }, require: name => {
    if (name === '@google/genai') return { GoogleGenAI: class { constructor({ apiKey }) { assert.equal(apiKey, 'fixture'); this.live = { connect: options => { callbacks = options.callbacks; callbacks.onopen(); return new Promise(r => { resolve = () => r(session); }); } }; } } };
    if (name === './config') return { getDecryptedApiKey: () => '' };
    if (name === './agent-orchestrator') return { tools: [] };
    if (name === './memory') return { recordMessage() {}, getMemorySnapshotForPrompt: () => '' };
    throw Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(core, 'gemini-live-session.js'), 'utf8'), context);
  return { manager: context.module.exports, ready: () => resolve(), getClosed: () => closed, getCallbacks: () => callbacks };
}

test('a cloud error cannot overwrite a verified local model, even with an agent role', async () => {
  const previous = global.fetch;
  const calls = [];
  global.fetch = async (_url, request) => {
    const model = JSON.parse(request.body).model;
    calls.push(model);
    if (model === 'gemini-3.5-flash-lite') return { ok: false, status: 502, json: async () => ({ detail: { provider: 'google', upstream_status: 403 } }) };
    return { ok: true, json: async () => ({ provider: 'local-cpu', model: 'heztech-local', choices: [{ message: { content: 'local result' } }] }) };
  };
  try {
    const chat = new OpenClawChat();
    await chat.ask({ message: 'local', model: 'openclaw-default', agentId: 'engineer' });
    await assert.rejects(chat.ask({ message: 'cloud', model: 'gemini-3.5-flash-lite', agentId: 'research' }), /502/);
    assert.deepEqual(calls, ['openclaw-default', 'gemini-3.5-flash-lite']);
    assert.equal(chat.status().verified, true);
    assert.equal(chat.status('heztech-local').connected, true);
    assert.equal(chat.status('gemini-3.5-flash-lite').verified, false);
    chat.close();
    assert.equal(chat.status().connected, false);
  } finally { global.fetch = previous; }
});

test('catalog enumeration does not certify untested models', async () => {
  const previous = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ data: [{ id: 'openclaw-default', owned_by: 'local-cpu' }, { id: 'gemini-3.5-flash-lite', owned_by: 'google' }] }) });
  try {
    const chat = new OpenClawChat();
    assert.equal((await chat.listModels()).length, 2);
    assert.equal(chat.status('gemini-3.5-flash-lite').verified, false);
    await chat.connect();
    assert.equal(chat.status().connected, true);
    assert.equal(chat.status().verified, false);
  } finally { global.fetch = previous; }
});

test('Live stays connecting until provider setup and rejects stale cancelled setup', async () => {
  const fixture = liveFixture();
  const start = fixture.manager.startSession({ systemPrompt: 'test', listenOnly: true });
  assert.equal(fixture.manager.getStatus().isConnected, false);
  fixture.ready();
  assert.equal((await start).success, true);
  assert.equal(fixture.manager.getStatus().isConnected, true);
  await fixture.manager.stopSession();
  assert.equal(fixture.getClosed(), true);
  const cancelled = fixture.manager.startSession({ systemPrompt: 'test', listenOnly: true });
  const rejected = assert.rejects(cancelled, /cancelled/);
  await fixture.manager.stopSession();
  await rejected;
  fixture.ready();
  await Promise.resolve();
  assert.equal(fixture.manager.getStatus().isConnected, false);
});

test('Live transcription snapshots retain earlier fragments and partial words', async () => {
  const { manager } = liveFixture();
  const events = [];
  manager.onEvent((kind, value) => { if (kind === 'transcription') events.push(value); });
  await manager._handleMessage({ serverContent: { inputTranscription: { text: 'درود ' } } });
  await manager._handleMessage({ serverContent: { inputTranscription: { text: 'هزتک' } } });
  assert.equal(events.at(-1).text, 'درود هزتک');
  await manager._handleMessage({ serverContent: { outputTranscription: { text: 'سلام، ات' } } });
  await manager._handleMessage({ serverContent: { outputTranscription: { text: 'صال برقرار است.' } } });
  assert.equal(events.at(-1).text, 'سلام، اتصال برقرار است.');
});
