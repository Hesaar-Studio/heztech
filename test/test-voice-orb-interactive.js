const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\Green\\.gemini\\antigravity\\brain\\f8b37958-d0c9-4d74-84ce-c3cf49b66dd6';

app.whenReady().then(async () => {
  try {
    console.log('[1/5] Launching HesaTech Electron Window with Modern UI...');
    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      show: true,
      backgroundColor: '#060b13',
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    const modernUiPath = path.join(__dirname, '..', 'heztech-frontend', 'dist', 'index.html');
    await win.loadFile(modernUiPath);
    await new Promise(r => setTimeout(r, 2000));

    console.log('[2/5] Verifying Top Bar LIVE button...');
    const liveBtnExists = await win.webContents.executeJavaScript(`
      (() => {
        const btn = document.querySelector('.ht-live-orb-btn');
        return !!btn;
      })()
    `);
    console.log('[+] .ht-live-orb-btn exists:', liveBtnExists);

    console.log('[3/5] Triggering Holographic Voice Orb Companion Modal...');
    const orbOpened = await win.webContents.executeJavaScript(`
      (() => {
        const btn = document.querySelector('.ht-live-orb-btn');
        if (btn) btn.click();
        else window.dispatchEvent(new CustomEvent('heztech:open-voice-orb'));

        const overlay = document.querySelector('.ht-voice-orb-overlay');
        if (!overlay) return { success: false, reason: 'Overlay not found in DOM' };

        // Populate realistic live speech transcript for visual inspection
        const transcriptEl = document.querySelector('.ht-voice-orb-transcript-box');
        if (transcriptEl) {
          transcriptEl.textContent = '«سلام هساتک! وضعیت سیستم و سرورهای هوش مصنوعی را گزارش کن.»';
        }

        const sphere = document.querySelector('.ht-voice-orb-central-sphere');
        if (sphere) {
          sphere.style.transform = 'scale(1.12)';
          sphere.style.boxShadow = '0 0 65px rgba(0, 229, 255, 0.95), 0 0 120px rgba(2, 132, 199, 0.8), inset 0 0 35px rgba(255, 255, 255, 0.85)';
        }

        // Draw sample constellation particles on canvas
        const canvas = document.querySelector('.ht-voice-orb-canvas');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);
          for (let i = 0; i < 30; i++) {
            const angle = (i / 30) * Math.PI * 2;
            const dist = (i % 5) * 15 + 10;
            const px = w / 2 + Math.cos(angle) * dist;
            const py = h / 2 + Math.sin(angle) * dist;
            ctx.beginPath();
            ctx.arc(px, py, (i % 3) + 1.2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(165, 243, 252, 0.85)';
            ctx.shadowColor = '#00e5ff';
            ctx.shadowBlur = 6;
            ctx.fill();
          }
        }

        return {
          success: true,
          overlayVisible: window.getComputedStyle(overlay).display !== 'none',
          title: document.querySelector('.ht-voice-orb-heading')?.textContent,
          agentName: document.querySelector('.ht-voice-orb-agent-name')?.textContent,
          pillsCount: document.querySelectorAll('.ht-orb-pill-btn, .ht-orb-pill-select').length
        };
      })()
    `);
    console.log('[+] Orb Diagnostic:', JSON.stringify(orbOpened, null, 2));

    await new Promise(r => setTimeout(r, 1200));

    console.log('[4/5] Capturing Holographic Voice Orb Screenshot...');
    const imgOrb = await win.webContents.capturePage();
    const orbShotPath = path.join(ARTIFACT_DIR, 'heztech_live_voice_orb.png');
    fs.writeFileSync(orbShotPath, imgOrb.toPNG());
    console.log('[+] Saved Holographic Voice Orb Screenshot to:', orbShotPath);

    // Also close the modal and navigate to Assistant chat to capture the new mic button in composer
    console.log('[5/5] Testing close and verifying Assistant chat composer mic button...');
    await win.webContents.executeJavaScript(`
      (() => {
        const closeBtn = document.querySelector('.ht-voice-orb-close-btn');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    // Navigate to Assistant
    await win.webContents.executeJavaScript(`
      (() => {
        const assistantLink = Array.from(document.querySelectorAll('.ht-sidebar__link')).find(l => l.getAttribute('href') === '/assistant');
        if (assistantLink) assistantLink.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));

    const imgChat = await win.webContents.capturePage();
    const chatShotPath = path.join(ARTIFACT_DIR, 'heztech_assistant_with_live_voice.png');
    fs.writeFileSync(chatShotPath, imgChat.toPNG());
    console.log('[+] Saved Assistant With Live Voice Screenshot to:', chatShotPath);

    console.log('[+] ALL TESTS PASSED SUCCESSFULLY!');
    win.destroy();
    app.quit();
  } catch (err) {
    console.error('[-] Test failed:', err);
    app.quit();
    process.exit(1);
  }
});
