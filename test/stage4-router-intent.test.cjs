'use strict';

/**
 * Multi-provider model router + intent router + local file search.
 * All network is mocked; assertions are on real behaviour (which provider was
 * called, what was returned, what got logged), not on wording.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heztech-router-'));
process.env.HEZTECH_DATA_DIR = dataDir;
// Search scope must be outside the protected data root.
const searchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heztech-search-'));
process.env.HEZTECH_FILE_SEARCH_ROOTS = searchDir;
fs.writeFileSync(path.join(searchDir, 'alpha-report.txt'), 'x'.repeat(10));

const { ModelRouter, MODE } = require('../src/core/model-router');
const { IntentRouter, classify, extractQuery } = require('../src/core/intent-router');
const ToolManager = require('../src/core/tools');

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
    text: async () => JSON.stringify(value)
  };
}

function textResponse(text, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(text),
    text: async () => text
  };
}

function geminiModel() {
  return { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] };
}

function localChat(reply = 'پاسخ محلی') {
  return jsonResponse({ choices: [{ message: { content: reply } }] });
}

test.after(() => {
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
});

test('PHASE-A1: OFFLINE mode never touches a cloud provider', async () => {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push(url);
    if (url.includes('/models')) return jsonResponse({ data: [{ id: 'qwen-local' }] });
    return localChat('پاسخ آفلاین');
  };
  const router = new ModelRouter({
    fetchImpl,
    credentials: [
      { id: 'gemini', label: 'G', kind: 'gemini', base: 'https://gemini.example', key: 'k', model: 'gemini-3.5-flash-lite', cloud: true },
      { id: 'local', label: 'L', kind: 'openai', base: 'http://local.test/v1', key: '', model: 'qwen-local', cloud: false }
    ]
  });

  const res = await router.chat({ messages: [{ role: 'user', content: 'سلام' }], mode: MODE.OFFLINE });
  assert.equal(res.ok, true);
  assert.equal(res.provider, 'local');
  assert.equal(calls.some(u => u.includes('gemini.example')), false);
});

test('PHASE-A2: AUTO skips a failing cloud provider and falls back to local', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('gemini.example')) return textResponse('{"error":{"message":"API key not valid"}}', 400);
    if (url.includes('/models')) return jsonResponse({ data: [{ id: 'qwen-local' }] });
    return localChat('پاسخ پشتیبان');
  };
  const router = new ModelRouter({
    fetchImpl,
    credentials: [
      { id: 'gemini', label: 'G', kind: 'gemini', base: 'https://gemini.example', key: 'bad', model: 'gemini-3.5-flash-lite', cloud: true },
      { id: 'local', label: 'L', kind: 'openai', base: 'http://local.test/v1', key: '', model: 'qwen-local', cloud: false }
    ]
  });

  const res = await router.chat({ messages: [{ role: 'user', content: 'سلام' }], mode: MODE.AUTO });
  assert.equal(res.ok, true);
  assert.equal(res.provider, 'local');
  assert.equal(res.reply, 'پاسخ پشتیبان');
  const skipped = res.attempts.find(a => a.provider === 'gemini');
  assert.equal(skipped.skipped, true);
});

test('PHASE-A3: an unhealthy provider is not re-probed on every message', async () => {
  let healthHits = 0;
  const fetchImpl = async (url) => {
    if (url.includes('gemini.example')) { healthHits += 1; return textResponse('{"error":"bad key"}', 401); }
    if (url.includes('/models')) return jsonResponse({ data: [{ id: 'qwen-local' }] });
    return localChat();
  };
  const router = new ModelRouter({
    fetchImpl,
    credentials: [
      { id: 'gemini', label: 'G', kind: 'gemini', base: 'https://gemini.example', key: 'bad', model: 'gemini-3.5-flash-lite', cloud: true },
      { id: 'local', label: 'L', kind: 'openai', base: 'http://local.test/v1', key: '', model: 'qwen-local', cloud: false }
    ]
  });

  await router.chat({ messages: [{ role: 'user', content: 'یک' }], mode: MODE.AUTO });
  await router.chat({ messages: [{ role: 'user', content: 'دو' }], mode: MODE.AUTO });
  assert.equal(healthHits, 1, 'health check must be cached for the TTL window');
});

test('PHASE-A4: ONLINE mode refuses to answer from local inference', async () => {
  const router = new ModelRouter({
    fetchImpl: async () => jsonResponse({ choices: [{ message: { content: 'local' } }] }),
    credentials: [{ id: 'local', label: 'L', kind: 'openai', base: 'http://local.test/v1', key: '', model: 'qwen-local', cloud: false }]
  });
  const res = await router.chat({ messages: [{ role: 'user', content: 'سلام' }], mode: MODE.ONLINE });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'NO_PROVIDER_AVAILABLE');
});

test('PHASE-A5: the answering provider and model are reported', async () => {
  const router = new ModelRouter({
    fetchImpl: async (url) => {
      if (url.includes(':generateContent')) {
        return textResponse(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ARTA اینجاست' }] } }] }));
      }
      return jsonResponse({ models: [geminiModel()] });
    },
    credentials: [{ id: 'gemini', label: 'Google', kind: 'gemini', base: 'https://gemini.example', key: 'k', model: 'gemini-3.5-flash-lite', cloud: true }]
  });
  const res = await router.chat({ messages: [{ role: 'user', content: 'کی هستی؟' }], mode: MODE.ONLINE });
  assert.equal(res.ok, true);
  assert.equal(res.provider, 'gemini');
  assert.equal(res.model, 'gemini-3.5-flash-lite');
  assert.equal(res.reply, 'ARTA اینجاست');
  assert.equal(typeof res.latencyMs, 'number');
});

test('PHASE-B1: intent classification separates actions from conversation', () => {
  assert.equal(classify('وضعیت سیستم را بگو').tool, 'system_telemetry');
  assert.equal(classify('جستجوی فایل گزارش').tool, 'file_search');
  assert.equal(classify('اسمت چیه؟').intent, 'chat');
  assert.equal(extractQuery('لطفاً فایل «alpha-report» را پیدا کن'), 'alpha-report');
});

test('PHASE-B2: a tool intent returns real tool output and is logged', async () => {
  const router = new IntentRouter({ toolManager: ToolManager });
  const outcome = await router.execute({ intent: 'tool', tool: 'system_telemetry', args: {} });

  assert.equal(outcome.handled, true);
  assert.equal(outcome.ok, true);
  assert.match(outcome.reply, /پردازنده:/);
  assert.match(outcome.reply, /حافظه:/);

  const log = fs.readFileSync(path.join(dataDir, 'operations.ndjson'), 'utf-8').trim().split('\n').map(JSON.parse);
  const entry = log.find(e => e.tool === 'system_telemetry');
  assert.ok(entry);
  assert.equal(entry.ok, true);
  assert.equal(typeof entry.durationMs, 'number');
});

test('PHASE-D1: local file search finds a real file inside the allowed scope', async () => {
  const res = await ToolManager.invokeTool('file_search', { query: 'alpha-report' });
  assert.equal(res.success, true);
  assert.ok(res.result.count >= 1, 'expected at least one real match');
  assert.ok(res.result.matches.some(m => m.name === 'alpha-report.txt'));
  assert.equal(typeof res.result.scanned, 'number');
});

test('PHASE-D2: file search refuses a too-short query', async () => {
  const res = await ToolManager.invokeTool('file_search', { query: 'a' });
  assert.equal(res.success, false);
  assert.match(String(res.error), /۲|2/);
});
