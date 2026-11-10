const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\Green\\.gemini\\antigravity\\brain\\ce3221d9-7202-4cb6-8155-ee1c0f879000';

app.whenReady().then(async () => {
  // Require main process IPC handlers
  require('../main.js');

  try {
    console.log('[1/3] Launching HesaTech Electron window for Slash Command verification...');
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

    console.log('[2/3] Executing /ig-caption and /ig-reel in chat composer...');
    await win.webContents.executeJavaScript(`
      (() => {
        showChatView();
        sendUserMessage('/ig-reel ۵ ترفند مخفی هوش مصنوعی برای رشد پیج اینستاگرام');
      })();
    `);

    // Wait for the message bubble to appear
    console.log('Waiting for slash command response bubble...');
    for (let i = 0; i < 30; i++) {
      const isPopulated = await win.webContents.executeJavaScript(`
        (() => {
          const bubbles = document.querySelectorAll('.chat-bubble-assistant');
          if (bubbles.length === 0) return false;
          const last = bubbles[bubbles.length - 1];
          return last && last.textContent && (last.textContent.includes('سناریو') || last.textContent.includes('هوک') || last.textContent.includes('مدت زمان'));
        })()
      `);
      if (isPopulated) {
        console.log(`✓ Slash command response bubble populated at iteration ${i + 1}`);
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    await new Promise(r => setTimeout(r, 1000));

    console.log('[3/3] Capturing screenshot of Chat with Instagram Slash Command...');
    const image = await win.webContents.capturePage();
    const dest = path.join(ARTIFACT_DIR, 'screenshot_hesatech_chat_instagram_slash.png');
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
