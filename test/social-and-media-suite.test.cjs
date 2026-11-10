'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const isolatedDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heztech-social-media-test-'));
process.env.HEZTECH_DATA_DIR = isolatedDataDir;

const socialIntelligence = require('../src/core/social-intelligence');
const tregAdapter = require('../src/integrations/treg-adapter');
const capcutBridge = require('../src/connectors/capcut-bridge-connector');
const ToolManager = require('../src/core/tools');
const { UnifiedMediaEngine } = require('../src/core/unified-media-engine');

test.after(() => {
  try {
    fs.rmSync(isolatedDataDir, { recursive: true, force: true });
  } catch (_) {}
});

test('1. Social Intelligence returns 7 target platforms with safe sanitized status', async () => {
  const status = await socialIntelligence.getAccountsStatus();
  assert.equal(status.success, true);
  assert.equal(Array.isArray(status.accounts), true);
  assert.equal(status.accounts.length, 7);

  const platformIds = status.accounts.map(a => a.platformId);
  assert.ok(platformIds.includes('instagram'));
  assert.ok(platformIds.includes('facebook'));
  assert.ok(platformIds.includes('youtube'));
  assert.ok(platformIds.includes('tiktok'));
  assert.ok(platformIds.includes('x'));
  assert.ok(platformIds.includes('linkedin'));
  assert.ok(platformIds.includes('telegram'));

  // Ensure no secrets are present in any returned account object
  for (const acc of status.accounts) {
    assert.equal(acc.accessToken, undefined);
    assert.equal(acc.refreshToken, undefined);
    assert.equal(acc.botToken, undefined);
  }
});

test('2. Social Content Intelligence scores hooks and analyzes transcript structure', () => {
  const goodHook = socialIntelligence.analyzeHook('راز ۳ برابری بازدید ریلز تنها در ۵ دقیقه');
  assert.equal(goodHook.success, true);
  assert.ok(goodHook.score >= 70);
  assert.ok(['GOOD', 'EXCELLENT'].includes(goodHook.rating));
  assert.ok(goodHook.detectedPatterns.length > 0);

  const transcript = socialIntelligence.analyzeTranscript(
    'سلام دوستان، در این ویدیو می‌خواهیم ۵ اشتباه مرگبار در تدوین ویدیو را بررسی کنیم. اشتباه اول استفاده از فونت‌های ناخواناست. راه‌حل این است که از فونت‌های استاندارد استفاده کنید. برای دیدن آموزش‌های بیشتر کانال را دنبال کنید.'
  );
  assert.equal(transcript.success, true);
  assert.ok(transcript.wordCount > 20);
  assert.ok(transcript.structureAnalysis.hookPhase);
  assert.ok(transcript.structureAnalysis.callToAction);
});

test('3. Social Publishing Assistant creates tamper-proof draft with Human Approval Gate', async () => {
  const draft = await socialIntelligence.preparePublication({
    platform: 'instagram',
    title: 'تست ریلز آموزشی',
    content: 'این یک کپشن آزمایشی برای ریلز اینستاگرام است #هوش_مصنوعی'
  });

  assert.equal(draft.status, 'PENDING_USER_APPROVAL');
  assert.ok(draft.approvalId);
  assert.ok(draft.actionHash);
  assert.ok(draft.expiresAt);
  assert.equal(draft.platform, 'instagram');
});

test('4. Treg Integration Adapter operates safely with transparent native fallback', async () => {
  const status = await tregAdapter.getStatus();
  assert.equal(status.id, 'treg');
  assert.ok(status.mcpEndpoint.includes('/mcp/'));

  // Calling without token must gracefully return fallbackToNative: true without crashing
  const result = await tregAdapter.callTool({
    toolId: 'treg.web_scraper',
    params: { url: 'https://example.com' }
  });
  assert.equal(result.success, false);
  assert.equal(result.fallbackToNative, true);
});

test('5. CapCut Bridge Connector connects to local capcut-bridge-kit and discovers capabilities', async () => {
  const status = await capcutBridge.getStatus();
  assert.equal(status.success, true);
  assert.equal(status.bridgeInstalled, true);
  assert.equal(status.bridgeConnected, true);
  assert.ok(status.capabilities.length >= 10);
  assert.equal(status.status, 'bridge_ready');
});

test('6. ToolManager registry includes media, social intelligence, and Treg tools', () => {
  const tools = ToolManager.getAvailableTools();
  const ids = tools.map(t => t.id);

  assert.ok(ids.includes('media_merge_clips'));
  assert.ok(ids.includes('media_export_preset'));
  assert.ok(ids.includes('social_discover_trends'));
  assert.ok(ids.includes('social_competitor_analysis'));
  assert.ok(ids.includes('social_content_intelligence'));
  assert.ok(ids.includes('social_analytics_report'));
  assert.ok(ids.includes('social_prepare_publication'));
  assert.ok(ids.includes('social_execute_publish'));
  assert.ok(ids.includes('treg_catalog_search'));
  assert.ok(ids.includes('treg_call_tool'));
});

test('7. Unified Media Engine methods are present and typed correctly', () => {
  const engine = new UnifiedMediaEngine({ dataDir: isolatedDataDir });
  assert.equal(typeof engine.probe, 'function');
  assert.equal(typeof engine.trim, 'function');
  assert.equal(typeof engine.extractFrame, 'function');
  assert.equal(typeof engine.detectSilence, 'function');
  assert.equal(typeof engine.removeSilence, 'function');
  assert.equal(typeof engine.addPersianSubtitles, 'function');
  assert.equal(typeof engine.changeAspectRatio, 'function');
  assert.equal(typeof engine.enhanceAudio, 'function');
  assert.equal(typeof engine.mergeClips, 'function');
  assert.equal(typeof engine.exportPreset, 'function');
  assert.equal(typeof engine.exportCapCutDraft, 'function');
  assert.equal(typeof engine.importCapCutDraft, 'function');
});
