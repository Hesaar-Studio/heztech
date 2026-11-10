'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heztech-telegram-approval-'));
process.env.APPDATA = path.join(root, 'appdata');
process.env.HEZTECH_DATA_DIR = path.join(root, 'data');
fs.mkdirSync(process.env.APPDATA, { recursive: true });

const { SecurityManager } = require('../src/core/security');
const serviceIntegrations = require('../src/connectors/service-integrations');
serviceIntegrations.secureStore = {
  loadCredentials: () => ({ telegram: { botToken: 'test-bot-token' } })
};

test('Telegram write approval is atomically consumed before network dispatch', async t => {
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const approval = await serviceIntegrations.requestActionApproval({
    platform: 'telegram',
    action: 'send_message',
    sender: 'owner',
    recipient: '@test_channel',
    content: 'Owner-approved test message'
  });
  assert.equal(approval.status, 'PENDING_USER_APPROVAL');
  assert.equal(SecurityManager.resolveApproval(approval.approvalId, true, 'Owner').success, true);

  const originalFetch = global.fetch;
  let dispatchCount = 0;
  let releaseRequest;
  global.fetch = async () => {
    dispatchCount += 1;
    await new Promise(resolve => { releaseRequest = resolve; });
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 5, chat: { id: -1, title: 'Test' } } })
    };
  };
  t.after(() => { global.fetch = originalFetch; });

  const first = serviceIntegrations.sendTelegramMessage({
    chatId: '@test_channel',
    text: 'Owner-approved test message',
    sender: 'owner',
    approvalId: approval.approvalId
  });
  await new Promise(resolve => setImmediate(resolve));
  const replay = await serviceIntegrations.sendTelegramMessage({
    chatId: '@test_channel',
    text: 'Owner-approved test message',
    sender: 'owner',
    approvalId: approval.approvalId
  });
  assert.equal(replay.code, 'NOT_APPROVED_BY_USER');
  assert.equal(dispatchCount, 1);
  releaseRequest();
  assert.equal((await first).success, true);
  assert.equal(SecurityManager.loadApprovalsFromDisk().find(item => item.id === approval.approvalId).status, 'executed');
});
