'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { WebSocket } = require('C:/Users/Green/openclaw/heztech-app/node_modules/ws');

const electronCmd = 'C:\\Users\\Green\\openclaw\\jarvis-command-center\\node_modules\\.bin\\electron.cmd';
const cwd = 'C:\\Users\\Green\\openclaw\\jarvis-command-center';

(async () => {
  const child = spawn(electronCmd, ['.', '--remote-debugging-port=9356'], { cwd, shell: true, windowsHide: false });

  await new Promise(r => setTimeout(r, 4000));
  const listRes = await fetch('http://127.0.0.1:9356/json/list');
  const list = await listRes.json();
  const page = list.find(x => x.type === 'page');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.once('open', r));

  let id = 0;
  function sendCdp(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = ++id;
      const handler = (data) => {
        const m = JSON.parse(data);
        if (m.id === msgId) {
          ws.off('message', handler);
          resolve(m.result);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  async function evaluate(expr) {
    const r = await sendCdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r?.result?.value;
  }

  await sendCdp('Runtime.enable');
  await new Promise(r => setTimeout(r, 2000));

  console.log('Testing window.heztech.sendMessage...');
  const chatRes = await evaluate(`(async () => {
    try {
      const res = await window.heztech.sendMessage({ message: 'سلام! یک جملهٔ بسیار کوتاه بگو کی هستی.', model: 'gemini-3.5-flash-lite' });
      return { ok: true, res };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  })()`);

  console.log('sendMessage result:', JSON.stringify(chatRes, null, 2));

  ws.close();
  child.kill();
  process.exit(0);
})();
