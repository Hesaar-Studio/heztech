'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { WebSocket } = require('C:/Users/Green/openclaw/heztech-app/node_modules/ws');

const electronCmd = 'C:\\Users\\Green\\openclaw\\jarvis-command-center\\node_modules\\.bin\\electron.cmd';
const cwd = 'C:\\Users\\Green\\openclaw\\jarvis-command-center';
const artifactDir = 'C:\\Users\\Green\\.gemini\\antigravity-acp\\brain\\78e829f4-fc0b-4bbe-8028-c716bfe5f63d';
const port = 9392;

(async () => {
  console.log('[Unified Test] Spawning Electron on port', port);
  const child = spawn(electronCmd, ['.', `--remote-debugging-port=${port}`], {
    cwd,
    shell: true,
    windowsHide: false
  });

  const report = {
    canonicalSource: cwd,
    startup: false,
    navigation: false,
    agentCouncil: false,
    connectionsTopology: false,
    modelChat: false,
    screenshotCaptured: false,
    evidence: {}
  };

  try {
    let list = [];
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 800));
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        if (res.ok) {
          list = await res.json();
          if (list && list.length) break;
        }
      } catch(e) {}
    }

    if (!list || !list.length) throw new Error('DevTools CDP did not become ready');

    const page = list.find(x => x.type === 'page') || list[0];
    console.log('[Unified Test] Page loaded:', page.url);
    report.evidence.url = page.url;

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.once('open', r));

    let id = 0;
    function sendCdp(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = ++id;
        const timer = setTimeout(() => {
          ws.off('message', handler);
          reject(new Error(`Timeout on ${method}`));
        }, 12000);

        const handler = (data) => {
          const m = JSON.parse(data);
          if (m.id === msgId) {
            clearTimeout(timer);
            ws.off('message', handler);
            resolve(m.result);
          }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    async function evaluate(expr) {
      const r = await sendCdp('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true
      });
      return r?.result?.value;
    }

    await sendCdp('Page.enable');
    await sendCdp('Runtime.enable');

    await new Promise(r => setTimeout(r, 2500));

    // 1. Startup Test
    const title = await evaluate('document.title');
    const hasRoot = await evaluate('!!document.getElementById("root")');
    console.log('[Unified Test] Title:', title, '| Root rendered:', hasRoot);
    report.startup = hasRoot;
    report.evidence.title = title;

    // 2. Navigation Test
    const navText = await evaluate(`Array.from(document.querySelectorAll('a, button')).map(e => e.textContent.trim()).filter(Boolean).slice(0, 15)`);
    console.log('[Unified Test] Top navigation elements:', navText);
    report.navigation = !!(navText && navText.length > 3);
    report.evidence.navSamples = navText;

    // 3. Council Roles Test
    const rolesRes = await evaluate(`(async () => {
      try {
        if (window.hesatech?.getCouncilRoles) {
          const res = await window.hesatech.getCouncilRoles();
          return res;
        }
        return { success: false, reason: 'window.hesatech.getCouncilRoles missing' };
      } catch(e) {
        return { success: false, error: e.message };
      }
    })()`);
    const rolesObj = rolesRes?.roles || {};
    const roleKeys = Object.keys(rolesObj);
    console.log('[Unified Test] Council roles count:', roleKeys.length, 'Keys:', roleKeys);
    report.agentCouncil = !!(rolesRes && rolesRes.success && roleKeys.length > 0);
    report.evidence.rolesCount = roleKeys.length;
    report.evidence.roles = roleKeys;

    // 4. Connections Topology Test
    const topoRes = await evaluate(`(async () => {
      try {
        if (window.hesatech?.getConnectionsTopology) {
          return await window.hesatech.getConnectionsTopology();
        }
        return null;
      } catch(e) {
        return { error: e.message };
      }
    })()`);
    console.log('[Unified Test] Connections topology core keys:', topoRes?.core ? Object.keys(topoRes.core) : 'none');
    report.connectionsTopology = !!(topoRes && topoRes.core);
    report.evidence.topologyCore = topoRes?.core;

    // 5. Available Models Test
    const modelsRes = await evaluate(`(async () => {
      try {
        if (window.hesatech?.getAvailableModels) {
          return await window.hesatech.getAvailableModels();
        }
        return null;
      } catch(e) {
        return { error: e.message };
      }
    })()`);
    console.log('[Unified Test] Available models:', modelsRes?.models?.map(m => m.id || m.name) || []);
    report.evidence.availableModels = modelsRes?.models?.map(m => m.id || m.name) || [];

    // 6. Model Chat Test
    console.log('[Unified Test] Sending test chat message...');
    const chatRes = await evaluate(`(async () => {
      try {
        if (window.hesatech?.sendMessage) {
          const r = await window.hesatech.sendMessage({
            message: 'سلام! یک جمله کوتاه در مورد وضعیت سیستم بگو.',
            model: 'gemini-3.5-flash-lite'
          });
          return r;
        }
        return { success: false, reason: 'sendMessage missing' };
      } catch(e) {
        return { success: false, error: e.message };
      }
    })()`);
    console.log('[Unified Test] Chat reply success:', chatRes?.success, '| Reply preview:', String(chatRes?.reply || chatRes?.error).slice(0, 100));
    report.modelChat = !!(chatRes && chatRes.success);
    report.evidence.chatResult = {
      success: chatRes?.success,
      model: chatRes?.model,
      replyPreview: String(chatRes?.reply || chatRes?.error || '').slice(0, 150)
    };

    // 7. Visual Capture
    console.log('[Unified Test] Capturing window screenshot...');
    const shot = await sendCdp('Page.captureScreenshot', { format: 'png' });
    const shotPath = path.join(artifactDir, 'heztech_consolidated_window.png');
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
    console.log('[Unified Test] Screenshot saved:', shotPath);
    report.screenshotCaptured = true;
    report.evidence.screenshotPath = shotPath;

    ws.close();
  } catch(err) {
    console.error('[Unified Test Error]:', err.message);
    report.fatalError = err.message;
  } finally {
    try { child.kill(); } catch(e){}
  }

  console.log('\n=== FINAL HEZTECH AUDIT REPORT DATA ===');
  console.log(JSON.stringify(report, null, 2));

  const outReportPath = path.join(artifactDir, 'heztech_consolidation_audit.json');
  fs.writeFileSync(outReportPath, JSON.stringify(report, null, 2), 'utf8');
  process.exit(0);
})();
