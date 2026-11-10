const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const lang = process.argv[2] || 'fa';
const width = parseInt(process.argv[3] || '1536', 10);
const height = parseInt(process.argv[4] || '1024', 10);
const outputPath = process.argv[5] || path.join(__dirname, `screenshot_${lang}_${width}x${height}.png`);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    backgroundColor: '#060b13',
    webPreferences: {
      preload: path.join(__dirname, '../staging_hesatech/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const fileUrl = path.join(__dirname, '../staging_hesatech/index.html');
  await win.loadFile(fileUrl, { query: { lang } });

  // Wait for canvas / rendering
  await new Promise(r => setTimeout(r, 2000));

  const image = await win.webContents.capturePage();
  fs.writeFileSync(outputPath, image.toPNG());
  console.log(`Screenshot saved to: ${outputPath} (${image.getSize().width}x${image.getSize().height})`);
  app.quit();
});
