'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TelegramBotAdapter } = require('../src/integrations/telegram-bot-adapter');

function createStore() {
  const values = new Map();
  return {
    get: key => values.get(key) || null,
    set: (key, value) => values.set(key, value),
    delete: key => values.delete(key)
  };
}

test('Telegram adapter stores a bot only after official Bot API identity verification', async () => {
  const store = createStore();
  const requests = [];
  const adapter = new TelegramBotAdapter({
    credentialStore: store,
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return { ok: true, json: async () => ({ ok: true, result: { id: 123, is_bot: true, username: 'test_bot' } }) };
    }
  });
  const token = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_ab';
  const result = await adapter.beginAuthorization({ botToken: token });
  assert.equal(result.success, true);
  assert.equal(adapter.getStatus().connected, true);
  assert.equal(requests[0].url.origin, 'https://api.telegram.org');
  assert.equal(requests[0].url.pathname, `/bot${token}/getMe`);
  assert.equal(JSON.stringify(adapter.getStatus()).includes(token), false);
});

test('Telegram channel authorization requires bot administrator membership', async () => {
  const store = createStore();
  let call = 0;
  const adapter = new TelegramBotAdapter({
    credentialStore: store,
    fetchImpl: async () => {
      call += 1;
      if (call === 1) return { ok: true, json: async () => ({ ok: true, result: { id: 123, is_bot: true } }) };
      if (call === 2) return { ok: true, json: async () => ({ ok: true, result: { id: -10012345, type: 'channel', title: 'Test' } }) };
      return { ok: true, json: async () => ({ ok: true, result: { status: 'member' } }) };
    }
  });
  const result = await adapter.beginAuthorization({
    botToken: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_ab',
    channelId: '@test_channel'
  });
  assert.deepEqual(result, { success: false, error: 'TELEGRAM_BOT_CHANNEL_ADMIN_REQUIRED' });
  assert.equal(adapter.getStatus().connected, false);
});

test('Telegram disconnect clears local credentials and clearly reports BotFather revocation requirement', () => {
  const store = createStore();
  store.set('telegram', { botToken: 'test-secret' });
  const adapter = new TelegramBotAdapter({ credentialStore: store });
  assert.equal(adapter.disconnect().revocationRequired, true);
  assert.equal(adapter.getStatus().connected, false);
});