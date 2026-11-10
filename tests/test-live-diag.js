const liveSessionManager = require('../src/core/gemini-live-session');

async function test() {
  console.log('Testing liveSessionManager.startSession()...');
  liveSessionManager.onEvent((type, payload) => {
    console.log(`[EVENT ${type}]:`, payload);
  });

  try {
    const res = await liveSessionManager.startSession({
      // default model in gemini-live-session is options.model || 'gemini-3.8-live' or whatever is in code
    });
    console.log('startSession returned:', res);
    setTimeout(async () => {
      await liveSessionManager.stopSession();
      console.log('Session stopped cleanly.');
      process.exit(0);
    }, 4000);
  } catch (err) {
    console.error('Catch block error:', err.message || err);
    process.exit(1);
  }
}

test();
