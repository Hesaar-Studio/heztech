const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

require('../main.js');

app.whenReady().then(async () => {
  const wins = BrowserWindow.getAllWindows();
  const win = wins[0];
  if (!win) return;

  await new Promise(r => setTimeout(r, 2000));

  // Trigger Persian chat prompt
  await win.webContents.executeJavaScript(`
    (async () => {
      if (typeof window.sendUserMessage === 'function') {
        await window.sendUserMessage('وضعیت سلامت سخت‌افزار و سیستم من چیه؟');
      }
    })()
  `);

  await new Promise(r => setTimeout(r, 4000));

  const image = await win.capturePage();
  const target = process.env.CAPTURE_SCREENSHOT_AND_QUIT || 'C:\\Users\\Green\\.gemini\\antigravity\\brain\\ce3221d9-7202-4cb6-8155-ee1c0f879000\\screenshot_hesatech_chat_agent_execution.png';
  fs.writeFileSync(target, image.toPNG());
  console.log('[CaptureChat] Saved screenshot to:', target);
  app.quit();
});
