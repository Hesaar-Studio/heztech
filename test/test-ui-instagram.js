const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\Green\\.gemini\\antigravity\\brain\\ce3221d9-7202-4cb6-8155-ee1c0f879000';

app.whenReady().then(async () => {
  // Require main process IPC handlers
  require('../main.js');

  try {
    console.log('[1/4] Launching HesaTech Electron window for Instagram Studio verification...');
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

    console.log('[2/4] Opening Instagram Agent Studio modal and clicking 26 Hooks tab...');
    await win.webContents.executeJavaScript(`
      (() => {
        const modal = document.getElementById('social-media-modal');
        if (modal) modal.style.display = 'flex';

        // Click on 26 hooks tab first to populate formulas
        const hooksTab = document.querySelector('.ig-tab-btn[data-skill="view-hooks"]');
        if (hooksTab) hooksTab.click();
      })();
    `);
    await new Promise(r => setTimeout(r, 1000));

    console.log('[3/4] Switching to Reels Script tab and populating topic...');
    await win.webContents.executeJavaScript(`
      (() => {
        const reelsTab = document.querySelector('.ig-tab-btn[data-skill="reels-script"]');
        if (reelsTab) reelsTab.click();

        const input = document.getElementById('ig-main-input');
        if (input) input.value = 'آموزش ساخت ایجنت هوش مصنوعی برای اینستاگرام بدون کدنویسی (instagram-agent-skill)';

        // Click run skill
        const runBtn = document.getElementById('btn-ig-run-skill');
        if (runBtn) runBtn.click();
      })();
    `);

    // Wait for AI generation to complete
    console.log('Waiting for Instagram Agent skill AI response to complete...');
    for (let i = 0; i < 30; i++) {
      const isDone = await win.webContents.executeJavaScript(`
        (() => {
          const content = document.getElementById('social-output-content');
          return content && content.textContent && !content.textContent.includes('در حال فراخوانی') && content.textContent.length > 50;
        })()
      `);
      if (isDone) {
        console.log(`✓ AI response populated at iteration ${i + 1}`);
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    await new Promise(r => setTimeout(r, 1000));

    console.log('[4/4] Capturing high-resolution screenshot of Instagram Agent Skills Hub...');
    const image = await win.webContents.capturePage();
    const dest = path.join(ARTIFACT_DIR, 'screenshot_hesatech_instagram_skills_hub.png');
    fs.writeFileSync(dest, image.toPNG());
    console.log(`✓ Screenshot captured successfully: ${dest}`);

    app.quit();
    process.exit(0);
  } catch (err) {
    console.error('Test execution error:', err);
    app.quit();
    process.exit(1);
  }
});
