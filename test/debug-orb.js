const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true
    }
  });

  await win.loadFile(path.join(__dirname, '..', 'index.html'));
  await new Promise(r => setTimeout(r, 1000));

  const diag = await win.webContents.executeJavaScript(`
    (() => {
      const el = document.getElementById('voice-orb-overlay');
      if (!el) return { error: 'not found' };
      el.style.display = 'flex';
      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      const topEl = document.elementFromPoint(500, 300);
      const childrenInfo = Array.from(el.children).map(c => {
        const cr = c.getBoundingClientRect();
        return {
          tag: c.tagName,
          class: c.className,
          top: cr.top,
          left: cr.left,
          width: cr.width,
          height: cr.height,
          display: window.getComputedStyle(c).display,
          visibility: window.getComputedStyle(c).visibility
        };
      });
      return {
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        children: childrenInfo,
        topEl: topEl ? { tag: topEl.tagName, id: topEl.id, class: topEl.className } : null
      };
    })()
  `);
  console.log('DIAGNOSTICS:', JSON.stringify(diag, null, 2));

  await new Promise(r => setTimeout(r, 600));

  win.show();
  await new Promise(r => setTimeout(r, 600));

  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'debug-orb.png'), img.toPNG());
  console.log('Saved debug-orb.png');

  app.quit();
});
