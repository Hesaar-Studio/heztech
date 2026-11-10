'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const isolatedDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heztech-identity-test-'));
process.env.HEZTECH_DATA_DIR = isolatedDataDir;
const { OpenClawChat } = require('../src/core/openclaw-chat');
const geminiLiveSession = require('../src/core/gemini-live-session');

test.after(() => fs.rmSync(isolatedDataDir, { recursive: true, force: true }));

test('OpenClaw chat request identifies ARTA and keeps HezTech as the product', async () => {
  const originalFetch = global.fetch;
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        model: 'test-model',
        choices: [{ message: { content: 'I am ARTA (اَرتا).' } }]
      })
    };
  };
  try {
    const chat = new OpenClawChat();
    const response = await chat.ask({ message: 'Who are you?', model: 'openclaw-default' });
    assert.match(requestBody.messages[0].content, /ARTA \(اَرتا\)/);
    assert.match(requestBody.messages[0].content, /HezTech is the product name/);
    assert.equal(response.reply, 'I am ARTA (اَرتا).');
  } finally {
    global.fetch = originalFetch;
  }
});

test('Gemini Live system prompt identifies ARTA, not HezTech, as the assistant', async () => {
  const prompt = await geminiLiveSession.buildSystemPrompt({ memorySnapshot: 'test-memory' });
  assert.match(prompt, /شما ARTA \(اَرتا\)/);
  assert.match(prompt, /HezTech نام محصول است/);
  assert.doesNotMatch(prompt, /شما «هستک»/);
});
