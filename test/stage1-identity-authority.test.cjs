'use strict';

/**
 * Stage 1 — ARTA identity authority regression tests.
 *
 * These tests are deliberately behavioural where possible: they assert what is
 * actually sent to a model and what survives a reload, not just that a string
 * exists somewhere in the tree. The static checks at the end guard the active
 * runtime files against reintroducing a legacy assistant identity.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heztech-identity-authority-'));
process.env.HEZTECH_DATA_DIR = dataDir;

const IDENTITY = require('../src/core/identity');
const ConfigManager = require('../src/core/config');
const { OpenClawChat } = require('../src/core/openclaw-chat');

const ROOT = path.join(__dirname, '..');
const readSource = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf-8');

test.after(() => {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch (e) {}
});

test('STAGE1-1: product stays HezTech, assistant stays ARTA', () => {
  assert.equal(IDENTITY.product.name, 'HezTech');
  assert.equal(IDENTITY.assistant.name, 'ARTA');
  assert.equal(IDENTITY.assistant.nameFa, 'اَرتا');
  assert.ok(IDENTITY.assistant.legacyNames.includes('HezTech Assistant'));
  assert.ok(IDENTITY.assistant.legacyNames.includes('HesaTech Assistant'));
});

test('STAGE1-2: identity survives restart over stale persisted configuration', () => {
  // An older build left a legacy identity in the persisted config file.
  const stale = {
    assistant: { name: 'HezTech Assistant', nameFa: 'دستیار هستک' },
    product: { name: 'HesaTech' },
    model: 'gemini-3.8-flash'
  };
  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify(stale, null, 2), 'utf-8');

  // Startup #1
  const first = ConfigManager.load();
  assert.equal(first.assistant.name, 'ARTA');
  assert.equal(first.assistant.nameFa, 'اَرتا');
  assert.equal(first.product.name, 'HezTech');

  // A settings save that still carries the legacy name must not persist it as authority.
  const saved = ConfigManager.save({ assistant: { name: 'HezTech Assistant', nameFa: 'دستیار هستک' } });
  assert.equal(saved.success, true);

  // Restart #2 — identical result, no drift.
  const second = ConfigManager.load();
  assert.equal(second.assistant.name, 'ARTA');
  assert.equal(second.assistant.nameFa, 'اَرتا');
  assert.equal(second.product.name, 'HezTech');
});

test('STAGE1-3: identity survives provider and model switching', async () => {
  const originalFetch = global.fetch;
  const outbound = [];
  global.fetch = async (_url, options) => {
    outbound.push(JSON.parse(options.body));
    return {
      ok: true,
      json: async () => ({ model: 'test-model', choices: [{ message: { content: 'ARTA (اَرتا)' } }] })
    };
  };

  try {
    const chat = new OpenClawChat();
    for (const model of ['openclaw-default', 'gemini-3.8-flash', 'deepseek/chat', 'gemini-3.5-flash-lite']) {
      await chat.ask({
        message: 'اسمت چیه؟',
        model,
        history: [
          { role: 'user', content: 'تو کی هستی؟' },
          { role: 'assistant', content: 'من هساتک اسیستانت (HesaTech Assistant) هستم.' }
        ]
      });
    }
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(outbound.length, 4);
  for (const body of outbound) {
    const system = body.messages[0];
    assert.equal(system.role, 'system');
    assert.match(system.content, /ARTA \(اَرتا\)/);
    assert.match(system.content, /Never call yourself HezTech Assistant/);
    assert.match(system.content, /HezTech is the product name/);

    // No replayed assistant turn may reintroduce the legacy self-identification.
    for (const message of body.messages) {
      if (message.role === 'assistant') {
        assert.doesNotMatch(message.content, /HesaTech Assistant|هساتک اسیستانت|HezTech Assistant/);
      }
    }
  }
});

test('STAGE1-4: the owner\'s own words are never rewritten', () => {
  const history = [
    { role: 'user', content: 'چرا قبلاً خودت را HezTech Assistant معرفی کردی؟' },
    { role: 'assistant', content: 'من HezTech Assistant هستم.' }
  ];
  const sanitized = IDENTITY.sanitizeHistory(history);

  assert.equal(sanitized[0].content, history[0].content);
  assert.match(sanitized[1].content, /ARTA \(اَرتا\)/);
  assert.doesNotMatch(sanitized[1].content, /HezTech Assistant/);
  // Source history object untouched (no on-disk rewrite).
  assert.equal(history[1].content, 'من HezTech Assistant هستم.');
});

test('STAGE1-5: offline fallback answers as ARTA', () => {
  // The local fallback strings live in main.js and bridge-server.mjs; both must
  // be built from the authoritative identity rather than a literal legacy name.
  const mainSource = readSource('main.js');
  assert.match(mainSource, /return respond\(`سلام! من \*\*\$\{IDENTITY\.assistant\.name\}/);
  assert.match(mainSource, /IDENTITY\.sanitizeHistory\(priorMessages\)/);

  const bridgeSource = readSource('bridge-server.mjs');
  assert.match(bridgeSource, /const IDENTITY = require\('\.\/src\/core\/identity\.js'\)/);
  assert.match(bridgeSource, /IDENTITY\.assistantPrompt\(/);
  assert.match(bridgeSource, /IDENTITY\.sanitizeHistory|IDENTITY\.assistant\.name/);
});

test('STAGE1-6: no active runtime file reintroduces a legacy assistant identity', () => {
  const forbidden = [
    /You are (HezTech|HesaTech) Assistant/i,
    /I am (HezTech|HesaTech) Assistant/i,
    /هساتک اسیستانت/,
    /دستیار هوشمند هساتک/,
    /دستیار هساتک/,
    /HesaTech Assistant Session/,
    /HESATECH\s*\/\s*HERMES/
  ];

  const activeFiles = [
    'main.js',
    'preload.js',
    'bridge-server.mjs',
    'public/mobile/index.html',
    'public/mobile/mobile.js',
    'src/core/agent-orchestrator.js',
    'src/core/openclaw-chat.js',
    'src/core/gemini-live-session.js',
    'src/core/tools.js',
    'src/core/config.js',
    'src/core/memory.js',
    'src/council/council-engine.js',
    'src/council/roles.js'
  ];

  for (const file of activeFiles) {
    const source = readSource(file).replace(/\r\n/g, '\n');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${file} still contains a legacy assistant identity: ${pattern}`);
    }
  }
});

test('STAGE1-7: packaged build excludes stale backup copies of runtime modules', () => {
  const pkg = JSON.parse(readSource('package.json'));
  const files = pkg.build.files.join('\n');
  assert.match(files, /!\*\*\/\*\.bak\*/);
  assert.match(files, /src\/\*\*\/\*/);
});
