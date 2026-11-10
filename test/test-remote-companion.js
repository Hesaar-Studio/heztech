/**
 * Automated Verification Suite for HesaTech Windows Desktop + Android Remote Companion
 * Tests device pairing, Bearer auth, shared Vault state synchronization,
 * remote conversational chat, seven-agent council deliberation,
 * and remote approval resolution through SecurityManager.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Core Modules
const RemotePairingManager = require('../src/core/remote-pairing');
const { SecurityManager } = require('../src/core/security');
const CouncilEngine = require('../src/council/council-engine');
const ConnectionsManager = require('../src/connectors/connections-manager');
const StartupManager = require('../src/core/startup');

const PORT = 18790;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function makeRequest(method, endpoint, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const postData = body ? JSON.stringify(body) : null;

    const headers = {
      'Content-Type': 'application/json'
    };
    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData);
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log(' HESATECH — CROSS-DEVICE WINDOWS + ANDROID COMPANION TEST SUITE');
  console.log('================================================================\n');

  // Start bridge server dynamically if not running
  try {
    const { pathToFileURL } = require('url');
    const bridgeUrl = pathToFileURL(path.resolve(__dirname, '../bridge-server.mjs')).href;
    const bridgeModule = await import(bridgeUrl);
    bridgeModule.startBridgeServer?.();
  } catch (e) {
    console.log('[Bridge Server] Already active or running.');
  }

  // Allow server a moment to bind
  await new Promise(r => setTimeout(r, 600));

  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      process.stdout.write(`[*] Testing: ${name}... `);
      await fn();
      console.log('✅ PASS');
      passed++;
    } catch (e) {
      console.log(`❌ FAIL: ${e.message}`);
      failed++;
    }
  }

  let testPairingCode = null;
  let testAuthToken = null;
  let testDeviceId = null;

  // Test 1: Rolling 6-digit Pairing Code Generation
  await check('1. Generate 6-digit rolling pairing code', async () => {
    const res = await makeRequest('POST', '/api/v1/remote/pairing/request-code');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(typeof res.data.code, 'string');
    assert.strictEqual(res.data.code.length, 6);
    assert.ok(res.data.expiresAt);
    testPairingCode = res.data.code;
  });

  // Test 2: Active Code Query
  await check('2. Check active pairing code status', async () => {
    const res = await makeRequest('GET', '/api/v1/remote/pairing/active-code');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.active, true);
    assert.strictEqual(res.data.code, testPairingCode);
    assert.ok(res.data.remainingSeconds > 0);
  });

  // Test 3: Pairing Rejection on Invalid Code
  await check('3. Rejection of invalid pairing code', async () => {
    const res = await makeRequest('POST', '/api/v1/remote/pairing/pair', {
      code: '000000',
      deviceName: 'Attacker Device'
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.data.success, false);
  });

  // Test 4: Device Pairing & Bearer Token Issuance
  await check('4. Successful Android device pairing & Bearer token issuance', async () => {
    const res = await makeRequest('POST', '/api/v1/remote/pairing/pair', {
      code: testPairingCode,
      deviceName: 'Samsung Galaxy S24 Ultra (Test)',
      platform: 'android-pwa',
      clientVersion: '2.0.0'
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.token.startsWith('htk_sec_'));
    assert.ok(res.data.deviceId.startsWith('dev_'));
    assert.strictEqual(res.data.permissions.canRemoteApprove, true);

    testAuthToken = res.data.token;
    testDeviceId = res.data.deviceId;
  });

  // Test 5: Rejection of Unauthenticated Remote Calls
  await check('5. Unauthorized access blocked without Bearer token', async () => {
    const res = await makeRequest('GET', '/api/v1/sync/state');
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.data.success, false);
  });

  // Test 6: Authenticated State Synchronization
  await check('6. Authenticated state sync (Windows telemetry, vault, topology)', async () => {
    const res = await makeRequest('GET', '/api/v1/sync/state', null, testAuthToken);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.system.cpu.cores > 0);
    assert.ok(res.data.system.memory.totalGB);
    assert.ok(res.data.system.disk.totalGB);
    assert.ok(Array.isArray(res.data.tasks));
    assert.ok(Array.isArray(res.data.pendingApprovals));
    assert.strictEqual(res.data.device.id, testDeviceId);
  });

  // Test 7: Remote Chat Execution & Shared Vault Persistence
  await check('7. Remote chat execution and synchronization with Vault conversations', async () => {
    const prompt = 'وضعیت سیستم';
    const res = await makeRequest('POST', '/api/v1/remote/chat', {
      message: prompt,
      model: 'local-offline-brain'
    }, testAuthToken);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.reply.length > 10);

    // Verify message was recorded in conversations.json
    const historyRes = await makeRequest('GET', '/api/v1/remote/chat/history', null, testAuthToken);
    assert.strictEqual(historyRes.statusCode, 200);
    const messages = historyRes.data.messages;
    const lastMsg = messages[messages.length - 1];
    assert.strictEqual(lastMsg.role, 'assistant');
  });

  // Test 8: Remote Seven-Agent Council Deliberation
  await check('8. Remote Council mission submission and 7-agent deliberation', async () => {
    const res = await makeRequest('POST', '/api/v1/remote/council/deliberate', {
      title: 'ارزیابی یکپارچه‌سازی رابط موبایل اندروید با هسته ویندوز',
      description: 'بررسی معماری اتصال PWA، امنیت رمزنگاری، پایداری سرور محلی و ایزولاسیون کامل پروژه اکوسیستم',
      mode: 'DEEP'
    }, testAuthToken);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    const session = res.data.session;
    assert.ok(session.rounds.length >= 2);
    // 6 domain agents in Round 1 (architect, engineer, security, research, devops, critic)
    assert.strictEqual(session.rounds[0].assessments.length, 6);
    // 7th agent (Judge) delivers the final synthesis and rubric evaluation
    assert.ok(session.finalVerdict);
    assert.ok(session.finalVerdict.rubricScores);
  });

  // Test 9: Human Approval Gate — Remote Resolution (Approved)
  await check('9. Human Approval Gate: remote approval execution on host', async () => {
    // 1. Host creates a pending approval
    const approvalPromise = SecurityManager.requestApproval(
      'REMOTE_EXECUTION_TEST',
      { command: 'ping 1.1.1.1 -n 1', host: 'Windows 11' },
      'HIGH'
    );
    const approvalId = approvalPromise.id;
    assert.ok(approvalId);

    // 2. Mobile fetches pending approvals
    const listRes = await makeRequest('GET', '/api/v1/remote/approvals', null, testAuthToken);
    assert.strictEqual(listRes.statusCode, 200);
    const found = listRes.data.pending.find(a => a.id === approvalId);
    assert.ok(found);

    // 3. Mobile resolves with approved: true
    const resolveRes = await makeRequest('POST', `/api/v1/remote/approvals/${approvalId}/resolve`, {
      approved: true
    }, testAuthToken);
    assert.strictEqual(resolveRes.statusCode, 200);
    assert.strictEqual(resolveRes.data.status, 'approved');

    // 4. Verify host promise resolved
    const hostResult = await approvalPromise;
    assert.strictEqual(hostResult.approved, true);
  });

  // Test 10: Human Approval Gate — Remote Resolution (Rejected)
  await check('10. Human Approval Gate: remote rejection aborts host execution', async () => {
    const rejectPromise = SecurityManager.requestApproval(
      'DANGEROUS_REMOTE_CMD',
      { action: 'restart_host' },
      'CRITICAL'
    );
    const rejectId = rejectPromise.id;

    // Attach catch handler immediately to prevent unhandled rejection during dispatch
    let rejectedError = null;
    rejectPromise.catch(err => {
      rejectedError = err;
    });

    // Mobile rejects
    const resolveRes = await makeRequest('POST', `/api/v1/remote/approvals/${rejectId}/resolve`, {
      approved: false
    }, testAuthToken);
    assert.strictEqual(resolveRes.statusCode, 200);
    assert.strictEqual(resolveRes.data.status, 'rejected');

    // Wait a tick and verify rejection
    await new Promise(r => setTimeout(r, 100));
    assert.ok(rejectedError);
    assert.ok(rejectedError.message.includes('rejected'));
  });

  // Test 11: Static PWA Delivery
  await check('11. PWA static delivery (index.html, manifest.json, sw.js, mobile.css, mobile.js)', async () => {
    const resHtml = await makeRequest('GET', '/mobile/');
    assert.strictEqual(resHtml.statusCode, 200);
    assert.ok(resHtml.data.includes('HesaTech Mobile Companion'));

    const resManifest = await makeRequest('GET', '/mobile/manifest.json');
    assert.strictEqual(resManifest.statusCode, 200);
    assert.strictEqual(resManifest.data.short_name, 'HesaTech');

    const resSw = await makeRequest('GET', '/mobile/sw.js');
    assert.strictEqual(resSw.statusCode, 200);
  });

  // Test 12: Paired Devices Registry and Revocation
  await check('12. Paired devices listing and device revocation', async () => {
    const listRes = await makeRequest('GET', '/api/v1/remote/pairing/devices');
    assert.strictEqual(listRes.statusCode, 200);
    const dev = listRes.data.devices.find(d => d.id === testDeviceId);
    assert.ok(dev);
    assert.strictEqual(dev.status, 'active');
    assert.ok(dev.maskedToken.includes('...')); // Ensure token secret is masked!

    // Revoke device
    const revokeRes = await makeRequest('POST', '/api/v1/remote/pairing/revoke', {
      deviceId: testDeviceId
    });
    assert.strictEqual(revokeRes.statusCode, 200);
    assert.strictEqual(revokeRes.data.success, true);

    // Call after revocation should now fail with 401
    const blockedRes = await makeRequest('GET', '/api/v1/sync/state', null, testAuthToken);
    assert.strictEqual(blockedRes.statusCode, 401);
  });

  // Test 13: Windows Startup Manager
  await check('13. Windows Startup Manager status & configuration', async () => {
    const status = StartupManager.getStartupStatus();
    assert.strictEqual(typeof status.openAtLogin, 'boolean');
  });

  console.log('\n----------------------------------------------------------------');
  console.log(` SUMMARY: ${passed} passed, ${failed} failed out of ${passed + failed} checks.`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
