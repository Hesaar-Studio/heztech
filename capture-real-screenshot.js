const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const lang = process.argv[2] || 'fa';
const width = parseInt(process.argv[3] || '1536', 10);
const height = parseInt(process.argv[4] || '1024', 10);
const outFile = process.argv[5] || path.join(__dirname, `captured_${lang}.png`);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    backgroundColor: '#040811',
    webPreferences: {
      preload: path.join(__dirname, 'staging_hesatech', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const targetHtml = path.join(__dirname, 'staging_hesatech', 'index.html');
  console.log('Loading file:', targetHtml);
  await win.loadFile(targetHtml, { query: { lang } });

  // Wait 3 seconds for full CSS layout, fonts and SVG/canvas render
  await new Promise(r => setTimeout(r, 3000));

  const image = await win.webContents.capturePage();
  fs.writeFileSync(outFile, image.toPNG());
  console.log(`Real screenshot captured: ${outFile} (${image.getSize().width}x${image.getSize().height})`);
  app.quit();
});
