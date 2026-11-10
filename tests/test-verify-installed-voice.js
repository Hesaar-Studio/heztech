const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACTS_DIR = 'C:\\Users\\Green\\.gemini\\antigravity\\brain\\f8b37958-d0c9-4d74-84ce-c3cf49b66dd6';

async function testInstalledApp() {
  console.log('Testing installed binary at C:\\Program Files\\HezTech\\HezTech.exe...');
  const installedExe = 'C:\\Program Files\\HezTech\\HezTech.exe';

  if (!fs.existsSync(installedExe)) {
    console.error('Installed executable not found at:', installedExe);
    process.exit(1);
  }

  const app = await _electron.launch({
    executablePath: installedExe,
    args: []
  });

  try {
    const window = await app.firstWindow();
    console.log('Installed HezTech window opened successfully! Title:', await window.title());

    await window.waitForTimeout(4000);

    const shotPath = path.join(ARTIFACTS_DIR, 'heztech_installed_app_voice_ready.png');
    await window.screenshot({ path: shotPath });
    console.log('Screenshot of installed app saved to:', shotPath);

    await app.close();
    console.log('Installed app closed cleanly.');
    process.exit(0);
  } catch (err) {
    console.error('Error testing installed app:', err);
    try { await app.close(); } catch(e){}
    process.exit(1);
  }
}

testInstalledApp();
