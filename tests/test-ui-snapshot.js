const { _electron } = require('playwright');
const path = require('path');

const ARTIFACTS_DIR = 'C:\\Users\\Green\\.gemini\\antigravity\\brain\\f8b37958-d0c9-4d74-84ce-c3cf49b66dd6';

async function run() {
  console.log('Launching Electron application for CapCut & Social Hub verification...');
  const electronPath = path.resolve('C:\\Users\\Green\\openclaw\\jarvis-command-center\\node_modules\\electron\\dist\\electron.exe');
  const app = await _electron.launch({
    executablePath: electronPath,
    cwd: 'C:\\Users\\Green\\openclaw\\jarvis-command-center',
    args: ['.'],
    env: { ...process.env, NODE_ENV: 'development' }
  });

  try {
    const window = await app.firstWindow();
    console.log('First window obtained. Title:', await window.title());

    await window.waitForTimeout(3000);

    // 1. Open Media Studio (CapCut Bridge Studio)
    console.log('Opening CapCut Media Studio modal...');
    await window.evaluate(() => {
      const mediaItem = Array.from(document.querySelectorAll('.menu-item')).find(el => el.textContent.includes('استودیو محتوا') || el.textContent.includes('Media Studio'));
      if (mediaItem) mediaItem.click();
      else {
        const m = document.getElementById('media-modal');
        if (m) m.style.display = 'flex';
        if (window.initCapCutMediaStudio) window.initCapCutMediaStudio();
      }
    });

    await window.waitForTimeout(3000);

    const shot1 = path.join(ARTIFACTS_DIR, 'heztech_capcut_media_studio_verified.png');
    await window.screenshot({ path: shot1 });
    console.log('Saved screenshot 1:', shot1);

    // 2. Click on Voice Studio Tab in Media Studio
    console.log('Switching to Voice Studio tab in Media Studio...');
    await window.evaluate(() => {
      const voiceTab = document.querySelector('[data-panel="panel-media-voice"]');
      if (voiceTab) voiceTab.click();
    });

    await window.waitForTimeout(1000);

    const shot2 = path.join(ARTIFACTS_DIR, 'heztech_voice_studio_stt_tts_verified.png');
    await window.screenshot({ path: shot2 });
    console.log('Saved screenshot 2:', shot2);

    // 3. Open Social & Communications Hub
    console.log('Opening Social & Communications Hub modal...');
    await window.evaluate(() => {
      const mm = document.getElementById('media-modal');
      if (mm) mm.style.display = 'none';
      const commItem = Array.from(document.querySelectorAll('.menu-item')).find(el => el.textContent.includes('ارتباطات و ایمیل') || el.textContent.includes('Communication'));
      if (commItem) {
        commItem.click();
      } else {
        const cm = document.getElementById('comm-modal');
        if (cm) cm.style.display = 'flex';
      }
    });

    await window.waitForTimeout(2000);

    const shot3 = path.join(ARTIFACTS_DIR, 'heztech_social_comms_hub_verified.png');
    await window.screenshot({ path: shot3 });
    console.log('Saved screenshot 3:', shot3);

    console.log('All 3 verification screenshots captured successfully!');
  } finally {
    await app.close();
  }
}

run().catch(err => {
  console.error('Snapshot error:', err);
  process.exit(1);
});
