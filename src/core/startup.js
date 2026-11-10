/**
 * HesaTech Windows Startup & Autostart Management
 * Configures Windows login startup behavior safely using Electron's setLoginItemSettings API.
 */

const { app } = require('electron');

class StartupManager {
  /**
   * Get current Windows startup status.
   */
  getStartupStatus() {
    try {
      const settings = app.getLoginItemSettings();
      return {
        success: true,
        openAtLogin: settings.openAtLogin,
        openAsHidden: settings.openAsHidden,
        executablePath: settings.executablePath || process.execPath
      };
    } catch (e) {
      return {
        success: false,
        openAtLogin: false,
        openAsHidden: false,
        error: e.message
      };
    }
  }

  /**
   * Enable or disable Windows startup on login.
   */
  setStartup(enable, openAsHidden = false) {
    try {
      app.setLoginItemSettings({
        openAtLogin: Boolean(enable),
        openAsHidden: Boolean(openAsHidden),
        path: process.execPath,
        args: openAsHidden ? ['--hidden'] : []
      });

      const updated = this.getStartupStatus();
      return {
        success: true,
        openAtLogin: updated.openAtLogin,
        openAsHidden: updated.openAsHidden,
        message: enable ? 'راه‌اندازی خودکار در هنگام شروع ویندوز فعال شد.' : 'راه‌اندازی خودکار در ویندوز غیرفعال شد.'
      };
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }
}

module.exports = new StartupManager();
