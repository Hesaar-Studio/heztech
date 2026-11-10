const { _electron } = require('playwright');

async function test() {
  const app = await _electron.launch({ executablePath: 'C:\\Program Files\\HezTech\\HezTech.exe' });
  const page = await app.firstWindow();
  page.on('console', msg => console.log('CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE_ERROR:', err.message));
  await page.waitForTimeout(3000);
  const allButtons = await page.$$('button');
  for (const btn of allButtons) {
    const text = await btn.innerText();
    const html = await btn.innerHTML();
    if (text.includes('صوت') || html.includes('mic') || html.includes('sparkles')) {
      console.log('Clicking voice trigger button...');
      await btn.click();
      break;
    }
  }
  await page.waitForTimeout(8000);
  const status = await page.evaluate(() => {
    const el = document.querySelector('.ht-voice-orb-agent-state span:last-child');
    return el ? el.innerText : 'not-found';
  });
  console.log('VOICE STATUS TEXT:', status);
  await app.close();
}

test();
