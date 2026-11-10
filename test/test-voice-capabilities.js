const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.join(__dirname, '..', 'index.html'));
  const res = await win.webContents.executeJavaScript(`
    ({
      mediaDevices: typeof navigator.mediaDevices !== 'undefined',
      speechSynthesis: typeof window.speechSynthesis !== 'undefined',
      webkitSpeechRecognition: typeof window.webkitSpeechRecognition !== 'undefined',
      voices: window.speechSynthesis ? window.speechSynthesis.getVoices().map(v => v.name) : []
    })
  `);
  console.log('Result on index.html:', res);
  app.quit();
});
