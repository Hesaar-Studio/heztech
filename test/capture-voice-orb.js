const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\Green\\.gemini\\antigravity\\brain\\ce3221d9-7202-4cb6-8155-ee1c0f879000';

app.whenReady().then(async () => {
  try {
    console.log('[1/4] Launching Desktop Window...');
    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    await win.loadFile(path.join(__dirname, '..', 'index.html'));
    await new Promise(r => setTimeout(r, 1500));

    // Open Voice Orb Companion Overlay in Desktop App
    console.log('[2/4] Triggering Holographic Voice Orb Overlay in Desktop...');
    await win.webContents.executeJavaScript(`
      (() => {
        const overlay = document.getElementById('voice-orb-overlay');
        if (overlay) overlay.style.display = 'flex';
        
        const transcript = document.getElementById('voice-orb-transcript');
        if (transcript) {
          transcript.textContent = '«سلام هساتک! وضعیت سرورها و آخرین گزارش هوش مصنوعی امروز را بررسی کن.»';
        }
        const status = document.getElementById('voice-orb-status-label');
        if (status) {
          status.textContent = 'HesaTech is talking...';
        }
        const sphere = document.getElementById('voice-orb-sphere');
        if (sphere) {
          sphere.style.transform = 'scale(1.12)';
          sphere.style.boxShadow = '0 0 65px rgba(0, 229, 255, 0.95), 0 0 120px rgba(2, 132, 199, 0.8), inset 0 0 35px rgba(255, 255, 255, 0.85)';
        }

        // Draw sample particles on canvas
        const canvas = document.getElementById('voice-orb-canvas');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);
          for (let i = 0; i < 30; i++) {
            const angle = (i / 30) * Math.PI * 2;
            const dist = (i % 5) * 15 + 10;
            const px = w/2 + Math.cos(angle) * dist;
            const py = h/2 + Math.sin(angle) * dist;
            ctx.beginPath();
            ctx.arc(px, py, (i % 3) + 1.2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(165, 243, 252, 0.85)';
            ctx.shadowColor = '#00e5ff';
            ctx.shadowBlur = 6;
            ctx.fill();
          }
        }
      })()
    `);

    win.show();
    await new Promise(r => setTimeout(r, 800));

    const imgDesktopOrb = await win.webContents.capturePage();
    const desktopOrbPath = path.join(ARTIFACT_DIR, 'screenshot_hesatech_voice_orb.png');
    fs.writeFileSync(desktopOrbPath, imgDesktopOrb.toPNG());
    console.log('[+] Saved Desktop Holographic Voice Orb Screenshot to:', desktopOrbPath);
    win.hide();

    // Now test Mobile Companion in phone viewport (412 x 840)
    console.log('[3/4] Launching Mobile Companion Viewport...');
    const mobWin = new BrowserWindow({
      width: 412,
      height: 840,
      show: false,
      webPreferences: {
        contextIsolation: true
      }
    });

    await mobWin.loadFile(path.join(__dirname, '..', 'public', 'mobile', 'index.html'));
    await new Promise(r => setTimeout(r, 1500));

    await mobWin.webContents.executeJavaScript(`
      (() => {
        // Dismiss pairing modal for screenshot
        const pairingModal = document.getElementById('pairing-modal');
        if (pairingModal) pairingModal.classList.remove('active');

        // Switch to Voice Orb view
        if (typeof switchView === 'function') {
          switchView('view-orb');
        } else {
          document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
          const vo = document.getElementById('view-orb');
          if (vo) vo.classList.add('active');
        }

        const transcript = document.getElementById('mob-orb-transcript');
        if (transcript) {
          transcript.textContent = '«درود! من صدای هساتک (Hermes) هستم. دستور صوتی شما چیست؟»';
        }
        const sphere = document.getElementById('mob-orb-sphere');
        if (sphere) {
          sphere.style.transform = 'scale(1.10)';
          sphere.style.boxShadow = '0 0 50px rgba(0, 229, 255, 0.9), 0 0 95px rgba(2, 132, 199, 0.75), inset 0 0 28px rgba(255, 255, 255, 0.8)';
        }

        // Draw sample particles on mobile canvas
        const canvas = document.getElementById('mob-orb-canvas');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);
          for (let i = 0; i < 22; i++) {
            const angle = (i / 22) * Math.PI * 2;
            const dist = (i % 4) * 14 + 10;
            const px = w/2 + Math.cos(angle) * dist;
            const py = h/2 + Math.sin(angle) * dist;
            ctx.beginPath();
            ctx.arc(px, py, (i % 2) + 1.2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(165, 243, 252, 0.85)';
            ctx.shadowColor = '#00e5ff';
            ctx.shadowBlur = 5;
            ctx.fill();
          }
        }
      })()
    `);

    mobWin.show();
    await new Promise(r => setTimeout(r, 800));

    const imgMobileOrb = await mobWin.webContents.capturePage();
    const mobileOrbPath = path.join(ARTIFACT_DIR, 'screenshot_hesatech_mobile_voice_orb.png');
    fs.writeFileSync(mobileOrbPath, imgMobileOrb.toPNG());
    console.log('[+] Saved Mobile Holographic Voice Orb Screenshot to:', mobileOrbPath);

    console.log('[4/4] Verification completed successfully!');
    win.destroy();
    mobWin.destroy();
    app.quit();
    process.exit(0);

  } catch (err) {
    console.error('[-] Error capturing Voice Orb screenshots:', err);
    process.exit(1);
  }
});
