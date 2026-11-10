const { _electron } = require('playwright');
const path = require('path');

async function testCapCutLaunch() {
  console.log('[Test] Launching HezTech...');
  const app = await _electron.launch({ executablePath: 'C:\\Program Files\\HezTech\\HezTech.exe' });
  const window = await app.firstWindow();
  await window.waitForTimeout(3000);

  console.log('[Test] Navigating to /media-studio...');
  await window.evaluate(() => { window.location.hash = '#/media-studio'; });
  await window.waitForTimeout(3000);

  console.log('[Test] Clicking Launch CapCut button...');
  const launchBtn = await window.$('button:has-text("اجرای CapCut Desktop"), button:has-text("Launch CapCut")');
  if (launchBtn) {
    await launchBtn.click();
    console.log('[Test] Clicked Launch CapCut button successfully!');
  } else {
    console.error('[Test] Launch button not found!');
  }

  await window.waitForTimeout(5000);

  const shotPath = 'C:\\Users\\Green\\.gemini\\antigravity\\brain\\f8b37958-d0c9-4d74-84ce-c3cf49b66dd6\\heztech_capcut_launched_verified.png';
  await window.screenshot({ path: shotPath });
  console.log('[Test] Saved screenshot to:', shotPath);

  await app.close();
  console.log('[Test] Done!');
}

testCapCutLaunch();
