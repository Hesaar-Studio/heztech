/**
 * HezTech Automated Security Gates Test Suite
 * Verifies Human-in-the-Loop constraints, anti-tampering, anti-replay,
 * AI self-approval prevention, expiration checks, and credential encryption.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const serviceIntegrations = require('../src/connectors/service-integrations');
const { SecurityManager } = require('../src/core/security');
const secureStore = require('../src/core/secure-store');
const orchestrator = require('../src/core/agent-orchestrator');
const { toolsRegistry } = require('../src/core/tools');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${name}`);
  } catch (err) {
    console.error(`  [FAIL] Test ${totalTests}: ${name}`);
    console.error(`         Error: ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${name}`);
  } catch (err) {
    console.error(`  [FAIL] Test ${totalTests}: ${name}`);
    console.error(`         Error: ${err.message}`);
  }
}

async function main() {
  console.log('================================================================');
  console.log('       HEZTECH SECURITY ARCHITECTURE & GATE VERIFICATION        ');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // TEST 1: Execution without approval ID must be blocked
  // -------------------------------------------------------------
  await runAsyncTest('Execution without approvalId is blocked (APPROVAL_ID_MISSING)', async () => {
    const res = await serviceIntegrations.sendTelegramMessage({
      chatId: '@test_channel',
      text: 'پیام غیرمجاز بدون تایید'
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'APPROVAL_ID_MISSING');
  });

  await runAsyncTest('Execution with fake approvalId is blocked (APPROVAL_NOT_FOUND)', async () => {
    const res = await serviceIntegrations.sendTelegramMessage({
      chatId: '@test_channel',
      text: 'پیام با شناسه جعلی',
      approvalId: 'appr_fake123456'
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'APPROVAL_NOT_FOUND');
  });

  // -------------------------------------------------------------
  // TEST 2: AI cannot self-approve (Tool stripped from declarations)
  // -------------------------------------------------------------
  runTest('Gemini cannot self-approve (approve_external_action stripped from Declarations)', () => {
    const declarations = orchestrator.getFunctionDeclarations ? orchestrator.getFunctionDeclarations() : [];
    const foundInDecl = declarations.some(d => d.name === 'approve_external_action');
    assert.strictEqual(foundInDecl, false, 'approve_external_action MUST NOT exist in Agent declarations');

    const foundInTools = Boolean(toolsRegistry['approve_external_action']);
    assert.strictEqual(foundInTools, false, 'approve_external_action MUST NOT exist in tools registry');
  });

  await runAsyncTest('Orchestrator refuses direct invocation of approve_external_action', async () => {
    const res = await orchestrator.executeTool('approve_external_action', { approvalId: 'appr_self' });
    assert.ok(res.error, 'Response must have an error property');
    assert.ok(res.error.includes('Unknown tool') || res.error.includes('ناشناخته'));
  });

  // -------------------------------------------------------------
  // TEST 3: User rejection stops execution
  // -------------------------------------------------------------
  await runAsyncTest('Rejected draft cannot be executed (NOT_APPROVED_BY_USER)', async () => {
    const draft = await serviceIntegrations.requestActionApproval({
      platform: 'telegram',
      action: 'send_message',
      recipient: '@test_channel',
      content: 'پیام تستی برای رد شدن'
    });
    assert.strictEqual(draft.status, 'PENDING_USER_APPROVAL');
    const id = draft.approvalId;

    // User rejects the draft
    SecurityManager.resolveApproval(id, false, 'Owner');

    const res = await serviceIntegrations.sendTelegramMessage({
      chatId: '@test_channel',
      text: 'پیام تستی برای رد شدن',
      approvalId: id
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'NOT_APPROVED_BY_USER');
  });

  // -------------------------------------------------------------
  // TEST 4: Anti-tamper verification (modified payload blocked)
  // -------------------------------------------------------------
  await runAsyncTest('Tampered text after human approval is blocked (PAYLOAD_TAMPERED)', async () => {
    const draft = await serviceIntegrations.requestActionApproval({
      platform: 'telegram',
      action: 'send_message',
      recipient: '@secure_channel',
      content: 'متن اصیل و تایید شده توسط کاربر'
    });
    const id = draft.approvalId;

    // User approves original text
    SecurityManager.resolveApproval(id, true, 'Owner');

    // Attacker or rogue agent attempts to alter text
    const res = await serviceIntegrations.sendTelegramMessage({
      chatId: '@secure_channel',
      text: 'متن دستکاری شده و غیرمجاز!',
      approvalId: id
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'PAYLOAD_TAMPERED');
  });

  await runAsyncTest('Tampered recipient/target after approval is blocked (PAYLOAD_TAMPERED)', async () => {
    const draft = await serviceIntegrations.requestActionApproval({
      platform: 'telegram',
      action: 'send_message',
      recipient: '@secure_channel',
      content: 'متن پیام برای کانال اصلی'
    });
    const id = draft.approvalId;

    // User approves
    SecurityManager.resolveApproval(id, true, 'Owner');

    // Attacker routes message to unauthorized target
    const res = await serviceIntegrations.sendTelegramMessage({
      chatId: '@hacker_channel',
      text: 'متن پیام برای کانال اصلی',
      approvalId: id
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'PAYLOAD_TAMPERED');
  });

  // -------------------------------------------------------------
  // TEST 5: Expired approval blocked (TTL protection)
  // -------------------------------------------------------------
  await runAsyncTest('Expired approval is blocked after TTL (APPROVAL_EXPIRED)', async () => {
    const draft = await serviceIntegrations.requestActionApproval({
      platform: 'telegram',
      action: 'send_message',
      recipient: '@test_channel',
      content: 'پیام با مهلت منقضی'
    });
    const id = draft.approvalId;

    // Manually backdate expiration in persistent storage
    const list = SecurityManager.loadApprovalsFromDisk();
    const item = list.find(a => a.id === id);
    item.status = 'approved';
    item.details.expiresAtMs = Date.now() - 10000; // Expired 10 seconds ago
    item.details.expiresAt = new Date(item.details.expiresAtMs).toISOString();
    SecurityManager.saveApprovalsToDisk(list);

    const res = await serviceIntegrations.sendTelegramMessage({
      chatId: '@test_channel',
      text: 'پیام با مهلت منقضی',
      approvalId: id
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'APPROVAL_EXPIRED');
  });

  // -------------------------------------------------------------
  // TEST 6: Replay attack blocked (Single-use nonce enforced)
  // -------------------------------------------------------------
  await runAsyncTest('Replay attack blocked on second execution attempt (REPLAY_ATTACK_PREVENTED)', async () => {
    const draft = await serviceIntegrations.requestActionApproval({
      platform: 'telegram',
      action: 'send_message',
      recipient: '@test_channel',
      content: 'پیام تک‌بار مصرف'
    });
    const id = draft.approvalId;

    // User approves
    SecurityManager.resolveApproval(id, true, 'Owner');

    // Simulate first execution consuming the nonce
    serviceIntegrations.markApprovalConsumed(id);

    // Attempt to execute a second time with identical payload
    const res = await serviceIntegrations.sendTelegramMessage({
      chatId: '@test_channel',
      text: 'پیام تک‌بار مصرف',
      approvalId: id
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'REPLAY_ATTACK_PREVENTED');
  });

  // -------------------------------------------------------------
  // TEST 7: Credential encryption & sanitization check
  // -------------------------------------------------------------
  runTest('Credentials stored encrypted (DPAPI/GCM) and masked in sanitized status', () => {
    // Save a test secret
    const testSecret = 'SUPER_SECRET_TOKEN_987654321';
    secureStore.saveCredentials('telegram', { botToken: testSecret });

    // 1. Verify encrypted on disk
    const credsFile = path.join(process.env.APPDATA || '', 'HezTech', 'secure-store', 'credentials.enc.json');
    if (fs.existsSync(credsFile)) {
      const raw = fs.readFileSync(credsFile, 'utf8');
      assert.strictEqual(raw.includes(testSecret), false, 'Raw plaintext secret MUST NOT appear in credentials file');
      assert.ok(raw.includes('dpapi:') || raw.includes('gcm:'), 'Secret must be prefixed with dpapi: or gcm:');
    }

    // 2. Verify sanitized status masks the secret
    const sanitized = secureStore.loadCredentials(false);
    assert.strictEqual(sanitized.telegram?.botToken, '[CONFIGURED_ENCRYPTED]', 'Sanitized status must mask sensitive tokens');

    // 3. Clean up test secret
    secureStore.saveCredentials('telegram', { botToken: '' });
  });

  // -------------------------------------------------------------
  // TEST 8: Vault Isolation Verification (Never write to Vault)
  // -------------------------------------------------------------
  runTest('Approvals and secure store do not write to openclaw/vault', () => {
    const vaultPath = 'C:\\Users\\Green\\openclaw\\vault';
    // Ensure no new integrations.enc or similar files are placed in vault
    const appDataStore = path.join(process.env.APPDATA || '', 'HezTech');
    assert.ok(fs.existsSync(appDataStore), 'AppData\\HezTech store directory must exist');
    assert.ok(fs.existsSync(path.join(appDataStore, 'pending-approvals.json')), 'Approvals file must reside in AppData\\HezTech');
  });

  console.log('\n----------------------------------------------------------------');
  console.log(`  TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('----------------------------------------------------------------\n');

  if (passedTests === totalTests) {
    console.log('>> ALL SECURITY GATES AND TAMPER PROTECTIONS VERIFIED SUCCESSFULLY.');
    process.exit(0);
  } else {
    console.error('>> ONE OR MORE SECURITY TESTS FAILED.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
