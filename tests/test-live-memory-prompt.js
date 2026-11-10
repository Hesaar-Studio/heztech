const liveSessionManager = require('../src/core/gemini-live-session');
const memoryManager = require('../src/core/memory');

async function testOverhauledLiveSession() {
  console.log('=== HEZTECH LIVE VOICE SESSION VERIFICATION: MEMORY & CAPCUT ===');
  
  const snapshot = memoryManager.getMemorySnapshotForPrompt(5);
  console.log('1. Memory Snapshot loaded from Vault:\n', snapshot);

  let accumulatedAssistantReply = '';
  const toolsInvoked = [];

  liveSessionManager.onEvent((type, payload) => {
    if (type === 'transcription' && payload.role === 'assistant') {
      accumulatedAssistantReply += payload.text;
    }
    if (type === 'tool-status' && payload.state === 'executing') {
      toolsInvoked.push(payload.tool);
      console.log(`[LIVE TOOL EXECUTING]: ${payload.tool}`);
    }
  });

  try {
    console.log('2. Starting Live API Voice Session with Memory Injection...');
    const startRes = await liveSessionManager.startSession();
    console.log('   Session started successfully:', startRes);

    // Question: Specifically ask to recall what was discussed and CapCut status
    const testQuery = 'ما قبلاً با هم در مورد چی صحبت کردیم؟ صحبت‌های قبلی من رو به طور خلاصه تکرار کن و بگو آیا به نرم‌افزار کپ‌کات متصل هستی؟';
    console.log(`3. Sending User Voice Query: «${testQuery}»`);
    liveSessionManager.sendText(testQuery);

    // Wait for the full turn to complete
    console.log('   Waiting for Live response...');
    await new Promise(resolve => setTimeout(resolve, 9000));

    console.log('\n4. Live Spoken Response Received:');
    console.log('«' + accumulatedAssistantReply.trim() + '»');
    console.log('   Tools invoked during session:', toolsInvoked);

    await liveSessionManager.stopSession();
    console.log('5. Session stopped.');

    // Assertions
    const hasPersian = /[\u0600-\u06FF]/.test(accumulatedAssistantReply);
    const mentionsCapcutOrTools = accumulatedAssistantReply.includes('کپ‌کات') || 
                                 accumulatedAssistantReply.includes('کپکات') || 
                                 toolsInvoked.includes('capcut_status') ||
                                 toolsInvoked.includes('capcut_list_drafts');
    const hasMemoryRecall = accumulatedAssistantReply.includes('عامل تحلیل') || 
                            accumulatedAssistantReply.includes('داده') ||
                            accumulatedAssistantReply.includes('عملیات') ||
                            accumulatedAssistantReply.includes('تحلیل') ||
                            accumulatedAssistantReply.includes('دستور');
    const hasAmnesia = accumulatedAssistantReply.includes('اطلاعات جلسات قبلی رو ذخیره نمی‌کنم') ||
                       accumulatedAssistantReply.includes('حافظه ندارم');

    console.log('\n=== VERIFICATION RESULTS ===');
    console.log('- Spoke in Native Persian:', hasPersian ? 'PASS' : 'FAIL');
    console.log('- Recalled Previous Memory from Vault:', hasMemoryRecall ? 'PASS' : 'FAIL');
    console.log('- Knows CapCut / Connected to CapCut:', mentionsCapcutOrTools ? 'PASS' : 'FAIL');
    console.log('- Zero Amnesia (Did NOT claim amnesia):', !hasAmnesia ? 'PASS' : 'FAIL');

    if (hasPersian && hasMemoryRecall && mentionsCapcutOrTools && !hasAmnesia) {
      console.log('\n>>> OVERALL RESULT: FULL PASS <<<');
      process.exit(0);
    } else {
      console.error('\n>>> OVERALL RESULT: FAILED CRITERIA <<<');
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

testOverhauledLiveSession();
