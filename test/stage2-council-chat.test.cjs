'use strict';

/**
 * Stage 2 — real Council execution reachable from Chat, with evidence.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heztech-council-chat-'));
process.env.HEZTECH_DATA_DIR = dataDir;

const CouncilEngine = require('../src/council/council-engine');
const { formatCouncilReport, SEVEN_ROLES } = require('../src/council/format-council-report');
const ToolManager = require('../src/core/tools');

const ROOT = path.join(__dirname, '..');
const readSource = p => fs.readFileSync(path.join(ROOT, p), 'utf-8');

test.after(() => {
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
});

test('STAGE2-1: a real deliberation executes the seven roles and produces a verdict', async () => {
  const session = await CouncilEngine.deliberate({
    title: 'آمادگی انتشار نسخه ۲.۰.۳',
    description: 'ارزیابی یکپارچگی هویت ARTA و اجرای شورا',
    mode: 'DEEP'
  });

  assert.ok(session.id);
  assert.ok(Array.isArray(session.rounds) && session.rounds.length >= 1);

  const assessed = session.rounds[0].assessments;
  assert.ok(Array.isArray(assessed));
  for (const assessment of assessed) {
    // Evidence of actual execution, not a placeholder.
    assert.ok(assessment.agent, 'assessment must name the executing agent');
    assert.ok(assessment.title, 'assessment must carry a role title');
    assert.equal(typeof assessment.analysis, 'string');
    assert.ok(assessment.analysis.length > 0);
    assert.equal(typeof assessment.confidenceScore, 'number');
    assert.equal(typeof assessment.durationMs, 'number');
    assert.ok(assessment.model, 'assessment must record which model produced it');
  }

  const executed = new Set(assessed.map(a => a.agent));
  for (const roleId of ['architect', 'engineer', 'security', 'research', 'devops', 'critic']) {
    assert.ok(executed.has(roleId), `role not executed: ${roleId}`);
  }
  assert.ok(session.finalVerdict && session.finalVerdict.judge);
  assert.ok(['APPROVED', 'REJECTED', 'REVISION_REQUIRED'].includes(session.finalVerdict.verdict));
  assert.equal(SEVEN_ROLES.length, 7);
});

test('STAGE2-2: the chat report exposes all seven roles with evidence and no placeholders', async () => {
  const session = await CouncilEngine.deliberate({
    title: 'گزارش آزمون شورا',
    description: 'آزمون قالب گزارش برای مالک',
    mode: 'DEEP'
  });

  const report = formatCouncilReport(session);

  assert.match(report, /شورای هفت‌نفره HezTech/);
  assert.match(report, /از ۷/);
  assert.match(report, /شواهد: \d+/);
  assert.match(report, /\d+ms/);
  assert.ok(report.includes(session.id));
  assert.doesNotMatch(report, /undefined/);
  assert.doesNotMatch(report, /هساتک/);
  assert.doesNotMatch(report, /<think>/i);

  for (const assessment of session.rounds[0].assessments) {
    assert.ok(report.includes(assessment.title), `report is missing role title: ${assessment.title}`);
  }
  assert.match(report, /جمع‌بندی داور شورا/);
});

test('STAGE2-3: the reported role count is derived from real executions', () => {
  const report = formatCouncilReport({
    id: 'cs_test',
    title: 'آزمون شمارش',
    status: 'awaiting_human_approval',
    rounds: [{
      assessments: [
        { agent: 'architect', title: 'معمار', analysis: 'الف', confidenceScore: 90, durationMs: 12, model: 'm', evidence: ['a'] },
        { agent: 'engineer', title: 'مهندس', analysis: 'ب', confidenceScore: 90, durationMs: 12, model: 'm', evidence: [] }
      ]
    }],
    crossExaminations: [{ agent: 'critic', critique: 'نقد' }],
    finalVerdict: { verdict: 'REVISION_REQUIRED', overallScore: 71, judge: { agent: 'judge' }, summary: 'جمع‌بندی' }
  });

  assert.match(report, /نقش‌های اجراشده:\*\* \*\*4 از ۷/);
  assert.match(report, /REVISION_REQUIRED/);
});

test('STAGE2-4: Chat reaches the Council before any model routing', () => {
  const source = readSource('main.js');

  const councilIndex = source.indexOf('Direct Council Deliberation invocation from Chat');
  const gatewayIndex = source.indexOf("['openclaw-default', 'openclaw', 'openclaw-main', 'heztech-local']");
  assert.ok(councilIndex > 0, 'council invocation block missing from chat handler');
  assert.ok(gatewayIndex > 0, 'gateway routing block missing');
  assert.ok(councilIndex < gatewayIndex, 'council must be evaluated before model routing');

  assert.match(source, /CouncilEngine\.deliberate\(\{/);
  assert.match(source, /formatCouncilReport\(session\)/);
  assert.match(source, /provider: 'council-engine'/);
});

test('STAGE2-5: Council tools stay registered next to the social/media tools', () => {
  const ids = ToolManager.getAvailableTools().map(t => t.id);
  for (const tool of ['deliberate_council', 'consult_specialized_agent', 'list_specialized_agents', 'instagram_carousel_architect', 'send_telegram_message']) {
    assert.ok(ids.includes(tool), `tool missing: ${tool}`);
  }
});
