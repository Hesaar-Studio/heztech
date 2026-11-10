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
  await win.loadFile(modernUiPath, { hash: '/social-satellite' });
  await new Promise(r => setTimeout(r, 2000));

  const imgSocial = await win.webContents.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'heztech_verified_social_satellite.png'), imgSocial.toPNG());

  await win.loadFile(modernUiPath, { hash: '/marketing' });
  await new Promise(r => setTimeout(r, 2000));

  const imgMarketing = await win.webContents.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'heztech_verified_marketing.png'), imgMarketing.toPNG());

  console.log('✓ Social Satellite & Marketing screenshots captured successfully!');
  app.quit();
});
