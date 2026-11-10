'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const isolatedDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heztech-regression-test-'));
process.env.HEZTECH_DATA_DIR = isolatedDataDir;

const IDENTITY = require('../src/core/identity');
const ConfigManager = require('../src/core/config');
const { OpenClawChat } = require('../src/core/openclaw-chat');
const geminiLiveSession = require('../src/core/gemini-live-session');
const agentOrchestrator = require('../src/core/agent-orchestrator');
const ToolManager = require('../src/core/tools');
const CouncilEngine = require('../src/council/council-engine');

test.after(() => {
  try {
    fs.rmSync(isolatedDataDir, { recursive: true, force: true });
  } catch (e) {}
});

test('1. Authoritative identity constants are immutable and correct', () => {
  assert.equal(IDENTITY.assistant.name, 'ARTA');
  assert.equal(IDENTITY.assistant.nameFa, 'اَرتا');
  assert.equal(IDENTITY.product.name, 'HezTech');
  assert.equal(IDENTITY.product.nameFa, 'هستک');

  // Verify frozen
  assert.throws(() => {
    IDENTITY.assistant.name = 'SomethingElse';
  });
});

test('2. Stale config in storage cannot override authoritative ARTA identity', () => {
  const staleConfig = {
    assistant: { name: 'HezTech Assistant', nameFa: 'دستیار هستک' },
    assistantName: 'HesaTech Assistant',
    product: { name: 'HezTech' }
  };
  fs.writeFileSync(path.join(isolatedDataDir, 'config.json'), JSON.stringify(staleConfig, null, 2), 'utf-8');

  const loaded = ConfigManager.load();
  assert.equal(loaded.assistant.name, 'ARTA');
  assert.equal(loaded.assistant.nameFa, 'اَرتا');
  assert.equal(loaded.product.name, 'HezTech');
});

test('3. OpenClaw chat prompt strictly enforces ARTA identity and prevents history imitation', async () => {
  const originalFetch = global.fetch;
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        model: 'test-model',
        choices: [{ message: { content: 'من اَرتا (ARTA) هستم.' } }]
      })
    };
  };

  try {
    const chat = new OpenClawChat();
    const historyWithOldName = [
      { role: 'user', content: 'کی هستی؟' },
      { role: 'assistant', content: 'من هساتک اسیستانت (HesaTech Assistant) هستم.' }
    ];
    const res = await chat.ask({
      message: 'نام تو چیست؟',
      model: 'openclaw-default',
      history: historyWithOldName
    });

    assert.equal(res.reply, 'من اَرتا (ARTA) هستم.');
    const sysPrompt = requestBody.messages[0].content;
    assert.match(sysPrompt, /ARTA \(اَرتا\)/);
    assert.match(sysPrompt, /Never call yourself HezTech Assistant/);
    assert.match(sysPrompt, /HezTech is the product name/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('4. Gemini Live session prompt contains authoritative ARTA identity', async () => {
  const prompt = await geminiLiveSession.buildSystemPrompt({ memorySnapshot: 'test-snapshot' });
  assert.match(prompt, /شما ARTA \(اَرتا\)/);
  assert.match(prompt, /دستیار هوشمند اجرایی HezTech/);
  assert.doesNotMatch(prompt, /شما «هستک»/);
});

test('5. Agent Orchestrator system instructions include mandatory ARTA identity', () => {
  const instructions = agentOrchestrator.buildSystemInstruction();
  assert.match(instructions, /ARTA \(اَرتا\)/);
  assert.match(instructions, /HezTech is the application product name/);
  assert.doesNotMatch(instructions, /You are HezTech Assistant/);
});

test('6. Council Engine executes real multi-agent deliberation with all 7 roles', async () => {
  const session = await CouncilEngine.deliberate({
    title: 'تست یکپارچگی شورا برای نسخه ۲.۰.۳',
    description: 'بررسی استحکام معماری و هویت مستقل ARTA',
    mode: 'DEEP'
  });

  assert.ok(session.id);
  assert.equal(session.rounds.length >= 2, true);

  // Round 1 assessments check
  const r1 = session.rounds[0];
  assert.equal(r1.phase, 'INDEPENDENT_ASSESSMENT');
  const assessedRoles = r1.assessments.map(a => a.agent);
  assert.ok(assessedRoles.includes('architect'));
  assert.ok(assessedRoles.includes('engineer'));
  assert.ok(assessedRoles.includes('security'));
  assert.ok(assessedRoles.includes('research'));
  assert.ok(assessedRoles.includes('devops'));
  assert.ok(assessedRoles.includes('critic'));

  // Round 2 cross-examination check
  assert.ok(session.crossExaminations.length >= 1);
  assert.equal(session.crossExaminations[0].agent, 'critic');

  // Final Judge verdict check
  assert.ok(session.finalVerdict);
  assert.ok(session.finalVerdict.judge);
  assert.ok(typeof session.finalVerdict.overallScore === 'number');
  assert.ok(['APPROVED', 'REJECTED', 'REVISION_REQUIRED'].includes(session.finalVerdict.verdict));
});

test('7. Council Engine consultAgent functions for individual specialist roles', async () => {
  const res = await CouncilEngine.consultAgent('security', 'آیا دسترسی به کوکی‌های مرورگر مجاز است؟');
  assert.ok(res.success);
  assert.equal(res.role.id, 'security');
  assert.ok(res.reply.length > 10);
});

test('8. Tools registry registers Council tools and executes them via ToolManager', async () => {
  const tools = ToolManager.getAvailableTools();
  const toolIds = tools.map(t => t.id);

  assert.ok(toolIds.includes('deliberate_council'));
  assert.ok(toolIds.includes('consult_specialized_agent'));
  assert.ok(toolIds.includes('list_specialized_agents'));

  // Test list_specialized_agents execution
  const listRes = await ToolManager.invokeTool('list_specialized_agents', {});
  assert.ok(listRes.success);
  assert.ok(listRes.result.architect);
  assert.ok(listRes.result.judge);
  assert.equal(Object.keys(listRes.result).length, 7);

  // Test deliberate_council execution
  const councilRes = await ToolManager.invokeTool('deliberate_council', {
    title: 'تست اجرای ابزار شورا',
    description: 'تست از طریق ToolManager',
    mode: 'QUICK'
  });
  assert.ok(councilRes.success);
  assert.ok(councilRes.result.id);
  assert.ok(councilRes.result.finalVerdict);
});

test('9. Existing social, media, and agent-reach tools remain registered and intact', () => {
  const tools = ToolManager.getAvailableTools();
  const toolIds = tools.map(t => t.id);

  // Social & media tools
  assert.ok(toolIds.includes('instagram_intel'));
  assert.ok(toolIds.includes('instagram_reels_script'));
  assert.ok(toolIds.includes('instagram_caption_linter'));
  assert.ok(toolIds.includes('instagram_viral_research'));
  assert.ok(toolIds.includes('instagram_content_plan'));
  assert.ok(toolIds.includes('instagram_profile_optimizer'));
  assert.ok(toolIds.includes('instagram_repurpose_content'));
  assert.ok(toolIds.includes('instagram_dm_comment_drafter'));
  assert.ok(toolIds.includes('instagram_carousel_architect'));
  assert.ok(toolIds.includes('send_telegram_message'));
  assert.ok(toolIds.includes('service_integrations_status'));

  // Agent-reach tools
  assert.ok(toolIds.includes('reach_web_search'));
  assert.ok(toolIds.includes('reach_web_read'));
  assert.ok(toolIds.includes('reach_github_search'));
  assert.ok(toolIds.includes('reach_github_read'));
  assert.ok(toolIds.includes('reach_youtube_search'));
  assert.ok(toolIds.includes('reach_research'));
  assert.ok(toolIds.includes('reach_health_check'));
});
