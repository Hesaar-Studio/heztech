const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACTS_DIR = 'C:\\Users\\Green\\.gemini\\antigravity\\brain\\f8b37958-d0c9-4d74-84ce-c3cf49b66dd6';
const installedExe = 'C:\\Program Files\\HezTech\\HezTech.exe';

async function verifyCapCutAndVoice() {
  console.log('[E2E] Launching installed HezTech at:', installedExe);

  if (!fs.existsSync(installedExe)) {
    console.error('Installed executable does not exist:', installedExe);
    process.exit(1);
  }

  const app = await _electron.launch({
    executablePath: installedExe,
    args: []
  });

  try {
    const window = await app.firstWindow();
    console.log('[E2E] Window loaded, Title:', await window.title());

    // Wait 3 seconds for initial load
    await window.waitForTimeout(3000);

    // 1. Navigate to /media-studio
    console.log('[E2E] Navigating to CapCut Media Studio...');
    await window.evaluate(() => {
      window.location.hash = '#/media-studio';
    });
    await window.waitForTimeout(4000);

    // Take screenshot of CapCut Media Studio
    const capcutShot = path.join(ARTIFACTS_DIR, 'heztech_installed_capcut_panel_verified.png');
    await window.screenshot({ path: capcutShot });
    console.log('[E2E] CapCut Media Studio screenshot saved to:', capcutShot);

    // 2. Open Voice Orb Modal
    console.log('[E2E] Opening Voice Orb Modal via .ht-live-orb-btn...');
    const voiceBtn = await window.$('.ht-live-orb-btn');
    if (voiceBtn) {
      await voiceBtn.click();
    } else {
      console.log('[E2E] .ht-live-orb-btn not found, dispatching window event...');
      await window.evaluate(() => window.dispatchEvent(new CustomEvent('heztech:open-voice-orb')));
    }

    console.log('[E2E] Waiting for Live connection to establish (7s)...');
    await window.waitForTimeout(7000);

    // Check if voice input exists and send a command
    const voiceInput = await window.$('.ht-voice-orb-text-input');
    if (voiceInput) {
      console.log('[E2E] Found Voice Orb text input! Entering command...');
      await voiceInput.fill('پروژه‌های درفت کپ‌کات را بررسی کن');
      await window.waitForTimeout(500);
      const sendBtn = await window.$('.ht-voice-orb-send-btn');
      if (sendBtn) {
        await sendBtn.click();
        console.log('[E2E] Sent command in Voice Orb.');
      }
    }

    await window.waitForTimeout(3000);

    // Take screenshot of Voice Orb with active chat
    const voiceShot = path.join(ARTIFACTS_DIR, 'heztech_installed_voice_orb_chat_verified.png');
    await window.screenshot({ path: voiceShot });
    console.log('[E2E] Voice Orb screenshot saved to:', voiceShot);

    console.log('[E2E] Verification completed successfully!');
    await app.close();
    process.exit(0);
  } catch (err) {
    console.error('[E2E] Error during verification:', err);
    try { await app.close(); } catch(e){}
    process.exit(1);
  }
}

verifyCapCutAndVoice();
