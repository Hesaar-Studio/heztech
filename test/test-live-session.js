const assert = require('assert');
const liveSessionManager = require('../src/core/gemini-live-session');

async function testLiveSession() {
  console.log('================================================================');
  console.log(' HESATECH — GEMINI 3.8 LIVE SESSION UNIT TEST');
  console.log('================================================================');

  // 1. Initial Status
  const status = liveSessionManager.getStatus();
  assert.strictEqual(status.status, 'idle');
  assert.strictEqual(status.isConnected, false);
  console.log('  ✅ Initial status is idle.');

  // 2. Event Listeners
  let receivedStatus = null;
  const unsubscribe = liveSessionManager.onEvent((type, payload) => {
    if (type === 'status') receivedStatus = payload;
  });
  liveSessionManager.emit('status', { status: 'testing' });
  assert.deepStrictEqual(receivedStatus, { status: 'testing' });
  unsubscribe();
  console.log('  ✅ Event listener registration and emission verified.');

  // 3. Methods verification
  assert.strictEqual(typeof liveSessionManager.startSession, 'function');
  assert.strictEqual(typeof liveSessionManager.sendAudioChunk, 'function');
  assert.strictEqual(typeof liveSessionManager.sendAudioStreamEnd, 'function');
  assert.strictEqual(typeof liveSessionManager.sendText, 'function');
  assert.strictEqual(typeof liveSessionManager.stopSession, 'function');
  console.log('  ✅ All Live API interface methods present.');

  // 4. Safe Stop
  const stopRes = await liveSessionManager.stopSession();
  assert.strictEqual(stopRes.success, true);
  console.log('  ✅ Clean stopSession handled.');

  const prompt = await liveSessionManager.buildSystemPrompt({ memorySnapshot: 'test-memory' });
  assert.match(prompt, /ARTA \(اَرتا\)/);
  assert.match(prompt, /HezTech نام محصول است/);
  console.log('  ✅ Live voice identity is ARTA; HezTech remains the product name.');

  console.log('----------------------------------------------------------------');
  console.log(' RESULT: GEMINI LIVE SESSION ARCHITECTURE PASSED 100%');
  console.log('----------------------------------------------------------------');
}

testLiveSession().catch(err => {
  console.error('Live session test failed:', err);
  process.exit(1);
});
