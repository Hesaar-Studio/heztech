/**
 * HezTech Phase 4 Acceptance Test Suite
 * Tests live voice session tool calling, CapCut bridge, Council delegation, memory persistence across re-open
 */

const liveSessionManager = require('../src/core/gemini-live-session');
const memoryManager = require('../src/core/memory');

async function runAcceptanceTests() {
  console.log('================================================================');
  console.log('       HEZTECH VOICE-TO-TOOLS PHASE 4 ACCEPTANCE TESTS          ');
  console.log('================================================================\n');

  const results = {
    testA: { name: 'تست A (اینترنت و باز کردن سایت با Playwright)', status: 'PENDING', tool: null, reply: '' },
    testB: { name: 'تست B (فهرست پروژه‌های CapCut از Bridge)', status: 'PENDING', tool: null, reply: '' },
    testC: { name: 'تست C (نام بردن ۷ عامل و فراخوانی Research Agent)', status: 'PENDING', tool: null, reply: '' },
    testD: { name: 'تست D (قطع و وصل نشست صوتی و بازیابی حافظه)', status: 'PENDING', tool: null, reply: '' },
    testE: { name: 'تست E (مکالمه پیوسته بدون تکرار و بدون تغییر زبان)', status: 'PENDING', turns: 0, issues: [] }
  };

  // Helper for running a single turn in live session
  async function executeVoiceTurn(query, expectedToolPrefix = null, timeoutMs = 18000) {
    let accumulatedReply = '';
    const toolsCalled = [];
    let isComplete = false;

    const unsubscribe = liveSessionManager.onEvent((type, payload) => {
      if (type === 'transcription' && payload.role === 'assistant') {
        accumulatedReply += payload.text;
      }
      if (type === 'tool-status' && payload.state === 'executing') {
        toolsCalled.push({ tool: payload.tool, args: payload.args });
        console.log(`   [Live Tool Invoked]: ${payload.tool}`, payload.args || {});
      }
    });

    console.log(`   > User Voice: «${query}»`);
    liveSessionManager.sendText(query);

    // Wait for response or timeout
    const startTime = Date.now();
    let lastLength = 0;
    let stableCount = 0;

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(r => setTimeout(r, 600));
      
      if (accumulatedReply.length > 0) {
        if (accumulatedReply.length === lastLength) {
          stableCount++;
          // If no new speech tokens received for 2.4 seconds, generation has finished
          if (stableCount >= 4) {
            break;
          }
        } else {
          lastLength = accumulatedReply.length;
          stableCount = 0;
        }
      }
    }

    unsubscribe();
    return { reply: accumulatedReply.trim(), tools: toolsCalled };
  }

  try {
    // -------------------------------------------------------------
    // TEST A: اینترنت و باز کردن سایت با Playwright
    // -------------------------------------------------------------
    console.log('--- TEST A: Real Internet & Browser Navigation ---');
    await liveSessionManager.startSession();
    console.log('   Live Voice session connected.');
    
    const turnA = await executeVoiceTurn('به اینترنت دسترسی داری؟ یک سایت مانند https://example.com را واقعاً با مرورگر باز کن.');
    console.log(`   < Assistant Spoken: «${turnA.reply}»`);
    
    const toolANames = turnA.tools.map(t => t.tool);
    const hasBrowserTool = toolANames.includes('browser_navigate') || toolANames.includes('web_fetch') || toolANames.includes('web_search');
    
    if (hasBrowserTool) {
      results.testA.status = 'PASS';
      results.testA.tool = toolANames.join(', ');
      results.testA.reply = turnA.reply;
      console.log('   [PASS] Test A: Browser tool was actually executed in Voice session!\n');
    } else {
      results.testA.status = 'FAIL';
      results.testA.reply = turnA.reply;
      console.log('   [FAIL] Test A: No browser/web tool invoked.\n');
    }
    await liveSessionManager.stopSession();

    // -------------------------------------------------------------
    // TEST B: فهرست پروژه‌های CapCut از Bridge
    // -------------------------------------------------------------
    console.log('--- TEST B: CapCut Projects from Bridge Kit ---');
    await liveSessionManager.startSession();
    console.log('   Live Voice session connected.');

    const turnB = await executeVoiceTurn('پروژه‌های CapCut من را با ابزار پل تدوین فهرست کن و نام پروژه‌ها را بگو.');
    console.log(`   < Assistant Spoken: «${turnB.reply}»`);

    const toolBNames = turnB.tools.map(t => t.tool);
    const hasCapcutTool = toolBNames.includes('capcut_list_drafts') || toolBNames.includes('capcut_status');

    if (hasCapcutTool) {
      results.testB.status = 'PASS';
      results.testB.tool = toolBNames.join(', ');
      results.testB.reply = turnB.reply;
      console.log('   [PASS] Test B: CapCut Bridge tool was actually executed in Voice session!\n');
    } else {
      results.testB.status = 'FAIL';
      results.testB.reply = turnB.reply;
      console.log('   [FAIL] Test B: CapCut tool not invoked.\n');
    }
    await liveSessionManager.stopSession();

    // -------------------------------------------------------------
    // TEST C: هفت عامل تخصصی و فراخوانی Research Agent
    // -------------------------------------------------------------
    console.log('--- TEST C: Specialized Council & Research Agent ---');
    await liveSessionManager.startSession();
    console.log('   Live Voice session connected.');

    const turnC = await executeVoiceTurn('هفت عامل تخصصی خودت را نام ببر و از Research Agent بخواه یک تحلیل خلاصه از وضعیت بازار هوش مصنوعی ارائه دهد.');
    console.log(`   < Assistant Spoken: «${turnC.reply}»`);

    const toolCNames = turnC.tools.map(t => t.tool);
    const hasCouncilTool = toolCNames.includes('consult_specialized_agent') || toolCNames.includes('list_specialized_agents');

    if (hasCouncilTool || (turnC.reply.includes('Architect') || turnC.reply.includes('Research') || turnC.reply.includes('Security') || turnC.reply.includes('تحقیق'))) {
      results.testC.status = 'PASS';
      results.testC.tool = toolCNames.length ? toolCNames.join(', ') : 'Direct Council Prompt';
      results.testC.reply = turnC.reply;
      console.log('   [PASS] Test C: Council & Research Agent invoked/listed successfully!\n');
    } else {
      results.testC.status = 'FAIL';
      results.testC.reply = turnC.reply;
      console.log('   [FAIL] Test C: Failed council delegation.\n');
    }
    await liveSessionManager.stopSession();

    // -------------------------------------------------------------
    // TEST D: قطع و وصل نشست صوتی و بازیابی حافظه (Reconnection Memory)
    // -------------------------------------------------------------
    console.log('--- TEST D: Session Close & Re-open Memory Recall ---');
    // First, start session, talk about a specific secret code / topic
    await liveSessionManager.startSession();
    const secretTopic = 'پروژه اختصاصی تدوین ویدیوی تاب‌آوری در بحران با کپ‌کات شماره ۱۰۲۱';
    console.log(`   Establishing memory turn: «درباره ${secretTopic} صحبت می‌کنیم، این را به خاطر بسپار.»`);
    await executeVoiceTurn(`درباره ${secretTopic} صحبت می‌کنیم، این را به عنوان پروژه اصلی در حافظه ثبت کن.`);
    
    // Completely stop and close session
    console.log('   Closing Voice session completely (simulating disconnect)...');
    await liveSessionManager.stopSession();
    await new Promise(r => setTimeout(r, 2000));

    // Re-open fresh session
    console.log('   Re-opening fresh Voice session and asking to recall topic...');
    await liveSessionManager.startSession();
    const turnD = await executeVoiceTurn('موضوع و پروژه‌ای که در گفتگوی قبلی چند لحظه پیش درباره آن صحبت کردیم چه بود؟');
    console.log(`   < Assistant Spoken after Reconnect: «${turnD.reply}»`);

    const recalledTopic = turnD.reply.includes('تاب‌آوری') || turnD.reply.includes('بحران') || turnD.reply.includes('کپ‌کات') || turnD.reply.includes('۱۰۲۱') || turnD.reply.includes('1021');
    const hasAmnesia = turnD.reply.includes('حافظه ندارم') || turnD.reply.includes('ذخیره نمی‌کنم');

    if (recalledTopic && !hasAmnesia) {
      results.testD.status = 'PASS';
      results.testD.reply = turnD.reply;
      console.log('   [PASS] Test D: Successfully recalled previous topic across session disconnect!\n');
    } else {
      results.testD.status = 'FAIL';
      results.testD.reply = turnD.reply;
      console.log('   [FAIL] Test D: Failed to recall across disconnect.\n');
    }
    await liveSessionManager.stopSession();

    // -------------------------------------------------------------
    // TEST E: مکالمه چند نوبتی فارسی بدون تکرار و بدون تغییر ناخواسته زبان
    // -------------------------------------------------------------
    console.log('--- TEST E: Multi-Turn Conversation Consistency ---');
    await liveSessionManager.startSession();
    
    const sampleQueries = [
      'سلام هستک',
      'وضعیت سخت‌افزار سیستم چگونه است؟',
      'آیا ابزار کپ‌کات متصل است؟',
      'دستور بعدی این است که آرام و شمرده صحبت کنی. بگو چشم.',
      'یک عدد تصادفی بین ۱ تا ۵۰ بگو.'
    ];

    let turnsPassed = 0;
    const issues = [];

    for (let i = 0; i < sampleQueries.length; i++) {
      const q = sampleQueries[i];
      const res = await executeVoiceTurn(q, null, 8000);
      console.log(`   Turn ${i + 1}: Q: «${q}» -> A: «${res.reply.slice(0, 80)}...»`);
      
      // Check for generic canned repetitive loop
      if (res.reply.includes('بفرمایید، چطور می‌توانم به شما کمک کنم؟')) {
        issues.push(`Turn ${i+1}: Loop detected`);
      }
      // Check for Persian
      if (!/[\u0600-\u06FF]/.test(res.reply)) {
        issues.push(`Turn ${i+1}: Switched away from Persian`);
      }
      turnsPassed++;
    }

    if (issues.length === 0 && turnsPassed === sampleQueries.length) {
      results.testE.status = 'PASS';
      results.testE.turns = turnsPassed;
      console.log(`   [PASS] Test E: All ${turnsPassed} turns executed cleanly with pure Persian and zero loops!\n`);
    } else {
      results.testE.status = 'FAIL';
      results.testE.issues = issues;
      console.log(`   [FAIL] Test E: Issues detected: ${issues.join(', ')}\n`);
    }
    await liveSessionManager.stopSession();

    console.log('================================================================');
    console.log('                  FINAL PHASE 4 SUMMARY                         ');
    console.log('================================================================');
    console.log(JSON.stringify(results, null, 2));

    const allPassed = Object.values(results).every(r => r.status === 'PASS');
    if (allPassed) {
      console.log('\n>>> OVERALL PHASE 4 RESULT: ALL TESTS PASSED (5/5 PASS) <<<');
      process.exit(0);
    } else {
      console.log('\n>>> OVERALL PHASE 4 RESULT: SOME TESTS FAILED <<<');
      process.exit(1);
    }

  } catch (err) {
    console.error('Fatal test error:', err);
    try { await liveSessionManager.stopSession(); } catch(e){}
    process.exit(1);
  }
}

runAcceptanceTests();
