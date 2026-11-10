const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\Green\\.gemini\\antigravity\\brain\\f8b37958-d0c9-4d74-84ce-c3cf49b66dd6';

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    frame: false,
    backgroundColor: '#060a14',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const modernUiPath = path.join(__dirname, '..', 'heztech-frontend', 'dist', 'index.html');
  console.log('[1/4] Loading UI from:', modernUiPath);
  await win.loadFile(modernUiPath);
  await new Promise(r => setTimeout(r, 2000));

  // Screenshot 1: Agents Command Center with Council of 7 Button
  console.log('[2/4] Capturing Agents Command Center with Council button...');
  const img1 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'heztech_verified_agents_page.png'), img1.toPNG());

  // Click Council of 7 button
  console.log('[3/4] Clicking Council of 7 button to open modal...');
  await win.webContents.executeJavaScript(`
    const btns = Array.from(document.querySelectorAll('button'));
    const councilBtn = btns.find(b => b.innerText.includes('شورای ۷ عاملیت') || b.innerText.includes('Council of 7'));
    if (councilBtn) councilBtn.click();
  `);
  await new Promise(r => setTimeout(r, 1200));

  const imgCouncil = await win.webContents.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'heztech_verified_council_modal.png'), imgCouncil.toPNG());

  // Navigate to Social Satellite
  console.log('[4/4] Navigating to Social Satellite Studio...');
  await win.webContents.executeJavaScript(`
    window.location.hash = '#/social-satellite';
  `);
  await new Promise(r => setTimeout(r, 1500));

  const imgSocial = await win.webContents.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'heztech_verified_social_satellite.png'), imgSocial.toPNG());

  console.log('✓ All verification screenshots captured successfully!');
  app.quit();
});
