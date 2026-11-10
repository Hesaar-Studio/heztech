/**
 * HezTech Phase 1 — Security Gate Tests (isolated)
 *
 * Runs entirely inside an OS temp directory:
 *   - no access to the real vault
 *   - no real API key (a dummy marker string is used)
 *   - no outbound network calls (fetch is stubbed where needed)
 *
 * Run: node tests/security/phase1.test.js
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const Module = require('module');

// ---------------------------------------------------------------------------
// Isolation: must happen before any project module is required.
// ---------------------------------------------------------------------------
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'heztech-phase1-'));
const TMP_PROJECT = path.join(TMP_ROOT, 'project');
const TMP_VAULT = path.join(TMP_PROJECT, 'vault'); // nested so it is both allowed and protected
const TMP_APPDATA = path.join(TMP_ROOT, 'appdata');
const TMP_APP_DATA = path.join(TMP_APPDATA, 'HezTech');

for (const dir of [TMP_PROJECT, TMP_VAULT, TMP_APPDATA, TMP_APP_DATA]) {
  fs.mkdirSync(dir, { recursive: true });
}
// Pre-create the approvals store so the legacy vault file is never copied in.
fs.writeFileSync(path.join(TMP_APP_DATA, 'pending-approvals.json'), '[]', 'utf-8');

process.env.APPDATA = TMP_APPDATA;
process.env.HEZTECH_DATA_DIR = TMP_VAULT;

// ---------------------------------------------------------------------------
// Electron mock: config.js requires safeStorage at import time.
// ---------------------------------------------------------------------------
const safeStorageState = { available: false };
const safeStorageMock = {
  isEncryptionAvailable: () => safeStorageState.available,
  encryptString: (text) => Buffer.from('ENC:' + text, 'utf-8'),
  decryptString: (buf) => buf.toString('utf-8').replace(/^ENC:/, '')
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return { safeStorage: safeStorageMock };
  return originalLoad.apply(this, arguments);
};

const { SecurityManager } = require('../../src/core/security');
const ConfigManager = require('../../src/core/config');
const agentOrchestrator = require('../../src/core/agent-orchestrator');
const ToolManager = require('../../src/core/tools');
const webTools = require('../../src/core/web-tools');

// Point the agent's sandbox root at the temp project.
agentOrchestrator.defaultCwd = TMP_PROJECT;

// ---------------------------------------------------------------------------
// Minimal harness
// ---------------------------------------------------------------------------
const results = [];
let currentGroup = '';

function group(name) {
  currentGroup = name;
}

async function test(name, fn) {
  try {
    await fn();
    results.push({ group: currentGroup, name, status: 'PASS' });
  } catch (err) {
    results.push({ group: currentGroup, name, status: 'FAIL', detail: err.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resetApprovals() {
  SecurityManager.saveApprovalsToDisk([]);
}

function approveExact(tool, params) {
  const record = SecurityManager.createApproval({ type: 'TEST', tool, params, riskLevel: 'HIGH' });
  const resolved = SecurityManager.resolveApproval(record.id, true, 'Owner', 'ui');
  assert(resolved.success === true, 'owner approval should succeed');
  return record;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
(async () => {
  group('File authorization');

  await test('write outside allowed root is BLOCKED', async () => {
    resetApprovals();
    const target = 'C:\\Windows\\heztech-phase1-pwn.txt';
    const res = await agentOrchestrator.executeTool('write_file', { filePath: target, content: 'x' });
    assert(res.blocked === true, 'expected blocked result, got ' + JSON.stringify(res));
    assert(!fs.existsSync(target), 'file must not have been created');
  });

  await test('path traversal (..) is BLOCKED', async () => {
    resetApprovals();
    const res = await agentOrchestrator.executeTool('write_file', {
      filePath: '..\\..\\escape.txt',
      content: 'x'
    });
    assert(res.blocked === true, 'expected blocked result');
  });

  await test('symlink escape is BLOCKED', async () => {
    resetApprovals();
    const outsideDir = path.join(TMP_ROOT, 'outside');
    fs.mkdirSync(outsideDir, { recursive: true });
    const linkPath = path.join(TMP_PROJECT, 'linkdir');
    try {
      if (!fs.existsSync(linkPath)) fs.symlinkSync(outsideDir, linkPath, 'junction');
    } catch (e) {
      results.push({ group: currentGroup, name: 'symlink escape is BLOCKED', status: 'NOT TESTED', detail: 'symlink unavailable: ' + e.code });
      return;
    }
    const res = await agentOrchestrator.executeTool('write_file', { filePath: 'linkdir\\via-link.txt', content: 'x' });
    assert(res.blocked === true, 'symlink escape should be blocked');
    assert(!fs.existsSync(path.join(outsideDir, 'via-link.txt')), 'no write through the link');
  });

  await test('vault path is BLOCKED', async () => {
    resetApprovals();
    const res = await agentOrchestrator.executeTool('write_file', {
      filePath: path.join(TMP_VAULT, 'config.json'),
      content: '{}'
    });
    assert(res.blocked === true, 'vault must be protected');
    assert(res.error && res.error.includes('PATH_PROTECTED'), 'expected PATH_PROTECTED, got ' + res.error);
  });

  await test('read outside allowed root is BLOCKED', async () => {
    const res = await agentOrchestrator.executeTool('read_file', { filePath: 'C:\\Windows\\win.ini' });
    assert(res.blocked === true, 'expected blocked read');
  });

  group('Approval gate');

  await test('edit without approval is BLOCKED', async () => {
    resetApprovals();
    const file = path.join(TMP_PROJECT, 'edit-target.txt');
    fs.writeFileSync(file, 'hello world', 'utf-8');
    const res = await agentOrchestrator.executeTool('edit_file', {
      filePath: 'edit-target.txt',
      target: 'hello',
      replacement: 'goodbye'
    });
    assert(res.blocked === true && res.requiresApproval === true, 'expected approval requirement');
    assert(fs.readFileSync(file, 'utf-8') === 'hello world', 'file must be unchanged');
  });

  await test('forged approvalId is BLOCKED', async () => {
    resetApprovals();
    const res = await agentOrchestrator.executeTool('write_file', {
      filePath: 'forged.txt',
      content: 'x',
      approvalId: 'appr_deadbeefdead'
    });
    assert(res.blocked === true, 'a made-up approvalId must not authorize anything');
    assert(!fs.existsSync(path.join(TMP_PROJECT, 'forged.txt')), 'file must not exist');
  });

  await test('unknown approval id cannot be consumed', async () => {
    resetApprovals();
    const res = SecurityManager.consumeApproval({ tool: 'write_file', params: { filePath: 'x', content: 'y' } });
    assert(res.ok === false, 'consume must deny with no record');
  });

  await test('expired approval is BLOCKED', async () => {
    resetApprovals();
    const params = { filePath: 'expired.txt', content: 'x' };
    const record = SecurityManager.createApproval({ type: 'TEST', tool: 'write_file', params, ttlMs: -1000 });
    const resolved = SecurityManager.resolveApproval(record.id, true, 'Owner', 'ui');
    assert(resolved.success === false && resolved.error === 'APPROVAL_EXPIRED', 'expired approval must be refused');
    const consumed = SecurityManager.consumeApproval({ tool: 'write_file', params });
    assert(consumed.ok === false, 'expired approval must not be consumed');
  });

  await test('reused (already consumed) approval is BLOCKED', async () => {
    resetApprovals();
    const params = { filePath: 'once.txt', content: 'x' };
    approveExact('write_file', params);
    const first = SecurityManager.consumeApproval({ tool: 'write_file', params });
    assert(first.ok === true, 'first consumption should succeed');
    const second = SecurityManager.consumeApproval({ tool: 'write_file', params });
    assert(second.ok === false, 'second consumption must be denied');
  });

  await test('model self-approval is BLOCKED', async () => {
    resetApprovals();
    const record = SecurityManager.createApproval({ type: 'TEST', tool: 'write_file', params: { a: 1 } });
    const res = SecurityManager.resolveApproval(record.id, true, 'Gemini', 'model');
    assert(res.success === false && res.error === 'MODEL_CANNOT_APPROVE', 'model must not approve');
    const consumed = SecurityManager.consumeApproval({ tool: 'write_file', params: { a: 1 } });
    assert(consumed.ok === false, 'no approval should exist after a model attempt');
  });

  await test('payload changed after approval is BLOCKED', async () => {
    resetApprovals();
    const approvedParams = { filePath: 'tamper.txt', content: 'ORIGINAL' };
    approveExact('write_file', approvedParams);

    const res = await agentOrchestrator.executeTool('write_file', {
      filePath: 'tamper.txt',
      content: 'TAMPERED'
    });
    assert(res.blocked === true, 'changed content must not reuse the approval');
    assert(!fs.existsSync(path.join(TMP_PROJECT, 'tamper.txt')), 'nothing written');
  });

  await test('renderer skipApprovalCheck is BLOCKED', async () => {
    resetApprovals();
    const res = await ToolManager.invokeTool(
      'exec_cmd',
      { command: 'ipconfig /flushdns' },
      { skipApprovalCheck: true, approvalId: 'appr_forged' }
    );
    assert(res.success === false && res.requiresApproval === true,
      'renderer flags must not bypass the gate, got ' + JSON.stringify(res));
  });

  await test('valid owner approval ALLOWS the operation', async () => {
    resetApprovals();
    const resolved = SecurityManager.normalizeTarget(TMP_PROJECT, 'approved.txt').resolvedPath;
    const params = { filePath: resolved, content: 'owner approved content' };
    approveExact('write_file', params);

    const res = await agentOrchestrator.executeTool('write_file', {
      filePath: 'approved.txt',
      content: 'owner approved content'
    });
    assert(res.success === true, 'expected success, got ' + JSON.stringify(res));
    assert(fs.readFileSync(path.join(TMP_PROJECT, 'approved.txt'), 'utf-8') === 'owner approved content',
      'content must match the approved payload');
  });

  group('Secret storage');

  await test('key is not persisted without encryption', async () => {
    safeStorageState.available = false;
    const configFile = path.join(TMP_VAULT, 'config.json');
    if (fs.existsSync(configFile)) fs.unlinkSync(configFile);

    const res = ConfigManager.save({ geminiApiKey: 'TEST_KEY_NOT_REAL' });
    assert(res.success === false, 'save must be refused without DPAPI');
    assert(res.error === 'SECURE_STORAGE_UNAVAILABLE', 'expected SECURE_STORAGE_UNAVAILABLE');
    assert(!fs.existsSync(configFile), 'config file must not be written');
  });

  await test('key is encrypted when DPAPI is available', async () => {
    safeStorageState.available = true;
    const configFile = path.join(TMP_VAULT, 'config.json');
    if (fs.existsSync(configFile)) fs.unlinkSync(configFile);

    const res = ConfigManager.save({ geminiApiKey: 'TEST_KEY_NOT_REAL' });
    assert(res.success === true, 'save should succeed with DPAPI');

    const raw = fs.readFileSync(configFile, 'utf-8');
    assert(!raw.includes('TEST_KEY_NOT_REAL'), 'plaintext key must never reach disk');
    const parsed = JSON.parse(raw);
    assert(String(parsed.geminiApiKey).startsWith('dpapi:'), 'expected dpapi: prefix');
    assert(ConfigManager.getDecryptedApiKey() === 'TEST_KEY_NOT_REAL', 'round-trip must work');
    safeStorageState.available = false;
  });

  group('Network / SSRF');

  await test('private IPv4 and IPv6 literals are blocked', async () => {
    for (const host of ['http://127.0.0.1/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://[::1]/', 'http://169.254.169.254/']) {
      const res = await webTools.validatePublicUrl(host);
      assert(res.allowed === false, 'should block ' + host);
    }
  });

  await test('IPv4-mapped IPv6 is detected as private', async () => {
    assert(webTools._isPrivateIp('::ffff:127.0.0.1') === true, 'mapped loopback must be private');
    assert(webTools._isPrivateIp('::ffff:192.168.0.10') === true, 'mapped private must be private');
    assert(webTools._isPrivateIp('::ffff:8.8.8.8') === false, 'mapped public must stay public');
  });

  await test('non-http schemes are blocked', async () => {
    for (const url of ['file:///C:/Windows/win.ini', 'ftp://example.com/x', 'data:text/html,hi']) {
      const res = await webTools.validatePublicUrl(url);
      assert(res.allowed === false, 'should block ' + url);
    }
  });

  await test('redirect into loopback is BLOCKED', async () => {
    const originalValidate = webTools.validatePublicUrl;
    const originalFetch = global.fetch;
    const seen = [];
    try {
      webTools.validatePublicUrl = async (url) => {
        seen.push(url);
        if (url.includes('127.0.0.1')) return { allowed: false, reason: 'private destination' };
        return { allowed: true, url, hostname: 'example.com' };
      };
      global.fetch = async () => ({
        status: 302,
        headers: { get: () => 'http://127.0.0.1/admin' }
      });

      const res = await webTools._safeFetch('https://example.com/start', { headers: {} });
      assert(res.ok === false && res.blocked === true, 'redirect must be blocked');
      assert(seen.length === 2, 'both hops must be validated, saw ' + seen.length);
    } finally {
      webTools.validatePublicUrl = originalValidate;
      global.fetch = originalFetch;
    }
  });

  await test('redirect chain limit is enforced', async () => {
    const originalValidate = webTools.validatePublicUrl;
    const originalFetch = global.fetch;
    try {
      webTools.validatePublicUrl = async (url) => ({ allowed: true, url, hostname: 'example.com' });
      let n = 0;
      global.fetch = async () => ({
        status: 302,
        headers: { get: () => `https://example.com/hop${++n}` }
      });
      const res = await webTools._safeFetch('https://example.com/start', { headers: {}, maxRedirects: 3 });
      assert(res.ok === false && res.blocked === true, 'loop must terminate as blocked');
    } finally {
      webTools.validatePublicUrl = originalValidate;
      global.fetch = originalFetch;
    }
  });

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------
  console.log('\n=== HEZTECH PHASE 1 SECURITY TESTS ===\n');
  let lastGroup = '';
  for (const r of results) {
    if (r.group !== lastGroup) {
      console.log(`\n[${r.group}]`);
      lastGroup = r.group;
    }
    const pad = r.status === 'PASS' ? 'PASS    ' : r.status === 'FAIL' ? 'FAIL    ' : 'SKIPPED ';
    console.log(`  ${pad} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  }

  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'NOT TESTED').length;
  console.log(`\nTOTAL ${results.length} | PASS ${pass} | FAIL ${fail} | NOT TESTED ${skipped}`);
  console.log(`Temp sandbox: ${TMP_ROOT}\n`);

  process.exit(fail === 0 ? 0 : 1);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
