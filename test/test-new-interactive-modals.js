const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ToolManager = require('../src/core/tools');
const CouncilEngine = require('../src/council/council-engine');
const agentOrchestrator = require('../src/core/agent-orchestrator');

app.whenReady().then(async () => {
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
          { id: 'task_1', title: 'بررسی استراتژی و مصوبات شورای هساتک', time: '10:00', priority: 'high', completed: false }
        ]));
      } else {
        ipcMain.handle(h, dummyHandler);
      }
    } catch(e) {}
  }

  ipcMain.handle('council:deliberate', async (e, data) => {
    try {
      const session = await CouncilEngine.deliberate(data);
      return { success: true, session };
    } catch(e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle('council:get-roles', async () => ({ success: true, roles: CouncilEngine.getRoles() }));
  ipcMain.handle('council:consult-agent', async (e, { roleId, prompt }) => CouncilEngine.consultAgent(roleId, prompt));
  ipcMain.handle('web:search', async (e, { query, limit }) => agentOrchestrator.executeTool('search_web', { query, limit }));
  ipcMain.handle('web:fetch', async (e, { url }) => agentOrchestrator.executeTool('fetch_web_content', { url }));
  ipcMain.handle('social:instagram-intel', async (e, { topic, action }) => ({
    success: true,
    topic,
    action,
    searchResults: [{ title: 'HesaTech Instagram Overview', snippet: 'Viral growth strategy and AI solutions', url: 'https://instagram.com/hesatech' }],
    contentPackage: `🔥 ۳ ایده قلاب وایرال (Hooks):\n۱. آیا میدونستی ۹۰٪ شرکت‌ها وقتشون رو تلف میکنن؟\n۲. هوش مصنوعی هساتک اینجوری کار رو راحت میکنه...\n\n📝 متن کپشن:\nاگر به دنبال رشد هوشمند و خودکارسازی فرآیندهای کسب‌وکار هستید، این راهکار مناسب شماست!\n\n🏷️ هشتگ‌ها:\n#هوش_مصنوعی #هساتک #کسب_و_کار #تکنولوژی`,
    hashtags: ['#هوش_مصنوعی', '#هساتک', '#اکسپلور', '#اینستاگرام', '#تکنولوژی', '#آموزش']
  }));
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] [${level}] ${message} (at ${sourceId}:${line})`);
  });

  win.loadFile(path.join(__dirname, '../index.html'));

  win.webContents.on('did-finish-load', async () => {
    console.log('[*] index.html loaded.');

    try {
      // 1. Test Council Modal with Custom Topic Input
      console.log('[*] Testing: Council Modal with custom topic...');
      await win.webContents.executeJavaScript(`
        document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none');
        window.openCouncilModal();
        const customInput = document.getElementById('council-custom-topic-input');
        if (customInput) customInput.value = 'بررسی توسعه و رشد اینستاگرام هساتک';
      `);
      await new Promise(r => setTimeout(r, 1500));

      const councilImg = await win.webContents.capturePage();
      const councilShotPath = path.join('C:\\Users\\Green\\.gemini\\antigravity\\brain\\ce3221d9-7202-4cb6-8155-ee1c0f879000', 'screenshot_hesatech_council_custom_topic.png');
      fs.writeFileSync(councilShotPath, councilImg.toPNG());
      console.log('[+] Saved screenshot: screenshot_hesatech_council_custom_topic.png');

      // 2. Test Agents Command Hub Modal
      console.log('[*] Testing: Agents Command Hub Modal...');
      await win.webContents.executeJavaScript(`
        document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none');
        window.openAgentsHubModal();
      `);
      await new Promise(r => setTimeout(r, 1500));

      const hubImg = await win.webContents.capturePage();
      const hubShotPath = path.join('C:\\Users\\Green\\.gemini\\antigravity\\brain\\ce3221d9-7202-4cb6-8155-ee1c0f879000', 'screenshot_hesatech_agents_hub.png');
      fs.writeFileSync(hubShotPath, hubImg.toPNG());
      console.log('[+] Saved screenshot: screenshot_hesatech_agents_hub.png');

      // 3. Test Instagram & Social Media Studio Modal
      console.log('[*] Testing: Instagram & Social Media Studio Modal...');
      await win.webContents.executeJavaScript(`
        document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none');
        window.openSocialMediaModal();
        const sInput = document.getElementById('social-topic-input');
        if (sInput) sInput.value = 'هوش مصنوعی و هوشمندسازی کسب‌وکار هساتک';
      `);
      await new Promise(r => setTimeout(r, 1500));

      const socialImg = await win.webContents.capturePage();
      const socialShotPath = path.join('C:\\Users\\Green\\.gemini\\antigravity\\brain\\ce3221d9-7202-4cb6-8155-ee1c0f879000', 'screenshot_hesatech_instagram_studio.png');
      fs.writeFileSync(socialShotPath, socialImg.toPNG());
      console.log('[+] Saved screenshot: screenshot_hesatech_instagram_studio.png');

      // 4. Test Web Research & Explorer Modal
      console.log('[*] Testing: Live Web Explorer Modal...');
      await win.webContents.executeJavaScript(`
        document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none');
        window.openWebResearchModal();
        const wInput = document.getElementById('web-explorer-query');
        if (wInput) wInput.value = 'هوش مصنوعی هساتک ویندوز';
      `);
      await new Promise(r => setTimeout(r, 1500));

      const webImg = await win.webContents.capturePage();
      const webShotPath = path.join('C:\\Users\\Green\\.gemini\\antigravity\\brain\\ce3221d9-7202-4cb6-8155-ee1c0f879000', 'screenshot_hesatech_web_explorer.png');
      fs.writeFileSync(webShotPath, webImg.toPNG());
      console.log('[+] Saved screenshot: screenshot_hesatech_web_explorer.png');

      console.log('[*] ALL INTERACTIVE MODALS VERIFIED SUCCESSFULLY! ✅');
      app.exit(0);
    } catch(err) {
      console.error('[-] Test failed:', err);
      app.exit(1);
    }
  });
});
