const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\Green\\.gemini\\antigravity\\brain\\ce3221d9-7202-4cb6-8155-ee1c0f879000';

app.whenReady().then(async () => {
  // Require main process IPC handlers
  require('../main.js');

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
  await new Promise(r => setTimeout(r, 2000));

  // Screenshot 1: Active Chat View with Assistant Response and Audio Playback buttons
  await win.webContents.executeJavaScript(`
    (() => {
      showChatView();
      appendMessageBubble('user', 'سلام، اسمت چیه و چه کارهایی می‌توانی برای من انجام دهی؟', { model: 'فرمانده' });
      appendMessageBubble('assistant', 'سلام و درود! من **هساتک اسیستانت** (HesaTech Assistant) هستم؛ مغز متفکر و دستیار اجرایی ویندوز شما.\\n\\nقابلیت‌های کلیدی فعال من:\\n۱. **گفتگوی هوشمند دوطرفه صوتی**: دریافت صوت و گوینده صوتی پاسخ‌ها\\n۲. **شورای نخبگان ۷ نفره**: ارزیابی، مناظره تیم قرمز و صدور رای نهایی\\n۳. **محافظ سیستم و پایش سخت‌افزار**: نظارت بر پردازنده، رم و سلامت دیسک\\n۴. **مدیریت محتوا و والت**: همگام‌سازی یادداشت‌های Obsidian و تسک‌ها', { model: 'Gemini 3.8 Flash', provider: 'gemini' });
    })()
  `);
  await new Promise(r => setTimeout(r, 800));
  const imgChat = await win.webContents.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'screenshot_hesatech_chat_stream.png'), imgChat.toPNG());
  console.log('[+] Saved Chat Stream Screenshot');

  // Screenshot 2: 7-Agent Council Deliberation Modal
  await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.querySelector('.btn-view-live-session');
      if (btn) btn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 1200));
  const imgCouncil = await win.webContents.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'screenshot_hesatech_council_modal.png'), imgCouncil.toPNG());
  console.log('[+] Saved Council Modal Screenshot');

  // Screenshot 3: Tasks Vault & Missions Modal
  await win.webContents.executeJavaScript(`
    (() => {
      document.getElementById('council-modal').style.display = 'none';
      const taskModal = document.getElementById('tasks-modal');
      if (taskModal) taskModal.style.display = 'flex';
    })()
  `);
  await new Promise(r => setTimeout(r, 800));
  const imgTasks = await win.webContents.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'screenshot_hesatech_tasks_vault_modal.png'), imgTasks.toPNG());
  console.log('[+] Saved Tasks Vault Modal Screenshot');

  // Screenshot 4: Media Studio Viral Generator Modal
  await win.webContents.executeJavaScript(`
    (() => {
      document.getElementById('tasks-modal').style.display = 'none';
      const mediaModal = document.getElementById('media-modal');
      if (mediaModal) mediaModal.style.display = 'flex';
    })()
  `);
  await new Promise(r => setTimeout(r, 800));
  const imgMedia = await win.webContents.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'screenshot_hesatech_media_studio_modal.png'), imgMedia.toPNG());
  console.log('[+] Saved Media Studio Modal Screenshot');

  app.quit();
});
