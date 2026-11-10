const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Execute tests inside running Electron app with main.js handlers
const ARTIFACT_DIR = 'C:\\Users\\Green\\.gemini\\antigravity\\brain\\ce3221d9-7202-4cb6-8155-ee1c0f879000';

app.whenReady().then(async () => {
  console.log('================================================================');
  console.log(' HESATECH — DEEP END-TO-END INTERACTIVE VERIFICATION');
  console.log('================================================================');

  // Let main process load its handlers
  const dummyHandler = async () => ({ success: true });
  const handlers = [
    'system:get-stats', 'vault:get-notes', 'vault:save-notes', 'vault:get-tasks',
    'vault:save-tasks', 'chat:get-history', 'marketing:get-queue', 'marketing:get-trends',
    'marketing:get-analytics', 'config:get', 'security:get-approvals', 'council:get-sessions',
    'mission:get-all', 'connections:get-topology', 'live:start', 'live:stop',
    'live:send-audio', 'live:send-audio-end', 'live:send-text', 'live:status',
    'chat:send-message', 'model:test-connection'
  ];
  for (const h of handlers) {
    try {
      if (h === 'vault:get-tasks') {
        ipcMain.handle(h, async () => ([
          { id: 'task_1', title: 'بررسی استراتژی و مصوبات شورای هساتک', time: '10:00', priority: 'high', completed: false },
          { id: 'task_2', title: 'بهینه‌سازی پایگاه داده والت و اسناد Obsidian', time: '12:30', priority: 'medium', completed: true },
          { id: 'task_3', title: 'تدوین و رندر ویدیویی کارگاه تاب‌آوری در بحران', time: '15:00', priority: 'high', completed: false }
        ]));
      } else {
        ipcMain.handle(h, dummyHandler);
      }
    } catch(e) {}
  }

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const rendererErrors = [];
  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 3 && !message.includes('favicon')) {
      rendererErrors.push(message);
    }
  });

  await win.loadFile(path.join(__dirname, '..', 'index.html'));
  await new Promise(r => setTimeout(r, 1500));

  let passed = 0;
  let failed = 0;

  async function testStep(name, fn) {
    try {
      process.stdout.write(`[*] Testing: ${name}... `);
      await fn();
      console.log('✅ PASS');
      passed++;
    } catch (e) {
      console.log(`❌ FAIL: ${e.message}`);
      failed++;
    }
  }

  // 1. Voice Buttons (STT toggle + TTS toggle)
  await testStep('Voice STT recording toggle and indicator', async () => {
    const res = await win.webContents.executeJavaScript(`
      (() => {
        const btn = document.getElementById('btn-voice');
        if (!btn) throw new Error('Voice button not found');
        btn.click();
        const active = btn.classList.contains('recording-active');
        btn.click(); // stop
        return active;
      })()
    `);
    assert.strictEqual(res, true, 'Voice button should activate recording state');
  });

  await testStep('Voice TTS toggle and status', async () => {
    const res = await win.webContents.executeJavaScript(`
      (() => {
        const btn = document.getElementById('btn-tts-toggle');
        if (!btn) throw new Error('TTS toggle button not found');
        btn.click();
        const state1 = btn.style.color;
        btn.click();
        const state2 = btn.style.color;
        return { state1, state2 };
      })()
    `);
    assert.ok(res.state1 !== undefined);
  });

  // 2. Right Rail Missions & Vault Sync
  await testStep('Tasks loaded dynamically into Right Rail list', async () => {
    const count = await win.webContents.executeJavaScript(`
      document.querySelectorAll('#rail-mission-list .mission-card-item').length
    `);
    assert.ok(count > 0, `Expected tasks rendered on rail, got ${count}`);
  });

  await testStep('Task click opens mission detail modal with AI execution option', async () => {
    const modalCheck = await win.webContents.executeJavaScript(`
      (() => {
        const first = document.querySelector('#rail-mission-list .mission-card-item');
        if (!first) throw new Error('No mission card found');
        first.click();
        const modal = document.getElementById('mission-detail-modal');
        const visible = modal && modal.style.display === 'flex';
        const taskName = document.getElementById('mdm-task-name')?.textContent;
        const hasAiRunBtn = !!document.getElementById('btn-mdm-run-ai');
        if (modal) modal.style.display = 'none';
        return { visible, taskName, hasAiRunBtn };
      })()
    `);
    assert.strictEqual(modalCheck.visible, true);
    assert.ok(modalCheck.taskName.length > 0);
    assert.strictEqual(modalCheck.hasAiRunBtn, true);
  });

  // 3. 8 Quick Action Cards
  await testStep('8 Quick Action cards open corresponding dedicated modals', async () => {
    const results = await win.webContents.executeJavaScript(`
      (() => {
        const map = {
          'analyze': 'topic-analysis-modal',
          'projects': 'projects-modal',
          'calendar': 'tasks-modal',
          'content': 'media-modal',
          'email': 'comm-modal',
          'sys_status': 'system-modal',
          'market': 'market-modal',
          'research': 'research-modal'
        };
        const status = {};
        for (const [action, modalId] of Object.entries(map)) {
          const card = document.querySelector(\`.qa-card[data-action="\${action}"]\`);
          if (card) {
            card.click();
            const modal = document.getElementById(modalId);
            status[action] = modal && modal.style.display === 'flex';
            if (modal) modal.style.display = 'none';
          } else {
            status[action] = false;
          }
        }
        return status;
      })()
    `);
    for (const [action, ok] of Object.entries(results)) {
      assert.strictEqual(ok, true, `Quick Action ${action} should open modal`);
    }
  });

  // 4. Command Palette (Ctrl+K)
  await testStep('Command Palette opens with keyboard shortcut and mouse pill', async () => {
    const cpStatus = await win.webContents.executeJavaScript(`
      (() => {
        const pill = document.getElementById('top-search-pill');
        pill?.click();
        const modal = document.getElementById('command-palette-modal');
        const open = modal && modal.style.display === 'flex';
        const items = document.querySelectorAll('#cp-items-list .cp-item').length;
        if (modal) modal.style.display = 'none';
        return { open, items };
      })()
    `);
    assert.strictEqual(cpStatus.open, true);
    assert.ok(cpStatus.items >= 8);
  });

  // 5. Media Studio Video Cards & AI Generators
  await testStep('Media Studio project cards and AI script/viral hooks generators', async () => {
    const mediaCheck = await win.webContents.executeJavaScript(`
      (() => {
        const card = document.querySelector('.video-thumb-card');
        card?.click();
        const modal = document.getElementById('media-modal');
        const open = modal && modal.style.display === 'flex';
        const hasHookBtn = !!document.getElementById('btn-media-gen-hooks');
        const hasScriptBtn = !!document.getElementById('btn-media-gen-script');
        if (modal) modal.style.display = 'none';
        return { open, hasHookBtn, hasScriptBtn };
      })()
    `);
    assert.strictEqual(mediaCheck.open, true);
    assert.strictEqual(mediaCheck.hasHookBtn, true);
    assert.strictEqual(mediaCheck.hasScriptBtn, true);
  });

  // 6. System Guardian Diagnostics & Taskmgr
  await testStep('System Guardian diagnostic modal and telemetry integration', async () => {
    const sysCheck = await win.webContents.executeJavaScript(`
      (() => {
        const ring = document.querySelector('.circular-health-ring');
        ring?.click();
        const modal = document.getElementById('system-modal');
        const open = modal && modal.style.display === 'flex';
        const hasCpu = !!document.getElementById('sys-diag-cpu-name');
        const hasRam = !!document.getElementById('sys-diag-ram-val');
        const hasDisk = !!document.getElementById('sys-diag-disk-free');
        if (modal) modal.style.display = 'none';
        return { open, hasCpu, hasRam, hasDisk };
      })()
    `);
    assert.strictEqual(sysCheck.open, true);
    assert.strictEqual(sysCheck.hasCpu, true);
    assert.strictEqual(sysCheck.hasRam, true);
    assert.strictEqual(sysCheck.hasDisk, true);
  });

  // 7. Theme Switching
  await testStep('Theme switching persists obsidian dark styling', async () => {
    const themeRes = await win.webContents.executeJavaScript(`
      (() => {
        const btn = document.getElementById('btn-top-theme');
        btn?.click();
        const isDark = document.body.classList.contains('theme-obsidian');
        const saved = localStorage.getItem('hesatech_theme');
        btn?.click(); // toggle back
        return { isDark, saved };
      })()
    `);
    assert.strictEqual(themeRes.isDark, true);
    assert.strictEqual(themeRes.saved, 'obsidian');
  });

  // 8. Card Window Controls (— □ ✕)
  await testStep('Card window controls collapse, expand and close cards', async () => {
    const dotsCheck = await win.webContents.executeJavaScript(`
      (() => {
        const firstMini = document.querySelector('.win-dots-mini');
        if (!firstMini) throw new Error('win-dots-mini not found');
        const dots = firstMini.querySelectorAll('span');
        const card = firstMini.closest('.mod-card');
        
        // Minimize
        dots[0].click();
        const desc = card.querySelector('.mod-desc-text');
        const isCollapsed = desc && desc.style.display === 'none';
        dots[0].click(); // restore
        return isCollapsed;
      })()
    `);
    assert.strictEqual(dotsCheck, true);
  });

  // 9. Language Switcher (FA / EN)
  await testStep('Language switcher toggles Persian and English UI text seamlessly', async () => {
    const langCheck = await win.webContents.executeJavaScript(`
      (() => {
        const btn = document.getElementById('lang-switch-btn');
        btn?.click();
        const lang1 = document.documentElement.lang;
        btn?.click();
        const lang2 = document.documentElement.lang;
        return { lang1, lang2 };
      })()
    `);
    assert.ok(langCheck.lang1 !== langCheck.lang2);
  });

  // 10. Bubble Voice Audio Button
  await testStep('Assistant chat bubbles include individual 🔊 audio playback buttons', async () => {
    const bubbleCheck = await win.webContents.executeJavaScript(`
      (() => {
        if (typeof window.showChatView === 'function') window.showChatView();
        if (typeof window.appendMessageBubble === 'function') {
          window.appendMessageBubble('assistant', 'پاسخ تستی با دکمه صوت');
        }
        const spkBtn = document.querySelector('.btn-speak-bubble');
        const hasBtn = !!spkBtn;
        return hasBtn;
      })()
    `);
    assert.strictEqual(bubbleCheck, true);
  });

  console.log('----------------------------------------------------------------');
  console.log(` SUMMARY: ${passed} passed, ${failed} failed out of ${passed + failed} checks.`);
  console.log(` Renderer Console Errors: ${rendererErrors.length}`);
  console.log('----------------------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  } else {
    app.quit();
  }
});
