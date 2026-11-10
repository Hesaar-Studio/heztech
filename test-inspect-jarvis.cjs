'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { WebSocket } = require('C:/Users/Green/openclaw/heztech-app/node_modules/ws');

const electronCmd = 'C:\\Users\\Green\\openclaw\\jarvis-command-center\\node_modules\\.bin\\electron.cmd';
const cwd = 'C:\\Users\\Green\\openclaw\\jarvis-command-center';

(async () => {
  const child = spawn(electronCmd, ['.', '--remote-debugging-port=9355'], { cwd, shell: true, windowsHide: false });

  await new Promise(r => setTimeout(r, 4000));
  const listRes = await fetch('http://127.0.0.1:9355/json/list');
  const list = await listRes.json();
  const page = list.find(x => x.type === 'page');
  console.log('Jarvis loaded page:', page.url);

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

  async function shot(name) {
    const r = await sendCdp('Page.captureScreenshot', { format: 'png' });
    const p = path.join('C:\\Users\\Green\\.gemini\\antigravity\\brain\\ce3221d9-7202-4cb6-8155-ee1c0f879000', name + '.png');
    fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
    console.log('Saved screenshot to:', p);
  }

  await sendCdp('Page.enable');
  await sendCdp('Runtime.enable');

  await new Promise(r => setTimeout(r, 3000));
  const title = await evaluate('document.title');
  const bodyText = await evaluate('document.body.innerText.slice(0, 200)');
  console.log('Title:', title);
  console.log('Body preview:', bodyText);

  await shot('jarvis_actual_window');
  ws.close();
  child.kill();
  process.exit(0);
})();
