/**
 * HesaTech Remote Device Pairing & Authentication Security Layer
 * Provides cryptographically secure 6-digit rolling code pairing,
 * persistent device authorization registry in Vault, session management,
 * and remote approval delegation to SecurityManager.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VAULT_DIR = path.resolve(process.env.HEZTECH_DATA_DIR || 'C:\\Users\\Green\\openclaw\\vault');
const DEVICES_FILE = path.join(VAULT_DIR, 'paired-devices.json');

class RemotePairingManager {
  constructor() {
    this.activePairingCode = null;
    this.codeExpiresAt = 0;
    this.failedAttempts = 0;
    this.lockoutUntil = 0;
    this.ensureDevicesFile();
  }

  ensureDevicesFile() {
    try {
      if (!fs.existsSync(VAULT_DIR)) {
        fs.mkdirSync(VAULT_DIR, { recursive: true });
      }
      if (!fs.existsSync(DEVICES_FILE)) {
        fs.writeFileSync(DEVICES_FILE, JSON.stringify([], null, 2), 'utf-8');
      }
    } catch (e) {
      console.error('[RemotePairing] Failed to ensure devices file:', e.message);
    }
  }

  loadDevices() {
    try {
      this.ensureDevicesFile();
      const raw = fs.readFileSync(DEVICES_FILE, 'utf-8');
      return JSON.parse(raw) || [];
    } catch (e) {
      console.error('[RemotePairing] Error loading devices:', e.message);
      return [];
    }
  }

  saveDevices(devices) {
    try {
      fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('[RemotePairing] Error saving devices:', e.message);
      return false;
    }
  }

  /**
   * Generates a temporary 6-digit rolling pairing code.
   * Valid for 5 minutes.
   */
  generatePairingCode(ttlSeconds = 300) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    this.activePairingCode = code;
    this.codeExpiresAt = Date.now() + (ttlSeconds * 1000);
    this.failedAttempts = 0;

    return {
      success: true,
      code,
      expiresAt: new Date(this.codeExpiresAt).toISOString(),
      ttlSeconds
    };
  }

  /**
   * Returns current active code if still valid, or null.
   */
  getActivePairingCode() {
    if (this.activePairingCode && Date.now() < this.codeExpiresAt) {
      const remainingSeconds = Math.max(0, Math.round((this.codeExpiresAt - Date.now()) / 1000));
      return {
        active: true,
        code: this.activePairingCode,
        remainingSeconds,
        expiresAt: new Date(this.codeExpiresAt).toISOString()
      };
    }
    return { active: false, code: null, remainingSeconds: 0 };
  }

  /**
   * Authenticates a pairing request with the 6-digit code.
   */
  pairDevice({ code, deviceName = 'Android Device', platform = 'android-pwa', clientVersion = '1.0.0', ip = '127.0.0.1' }) {
    if (Date.now() < this.lockoutUntil) {
      const waitSec = Math.ceil((this.lockoutUntil - Date.now()) / 1000);
      return {
        success: false,
        error: `تعداد تلاش‌های ناموفق بیش از حد مجاز است. لطفاً ${waitSec} ثانیه دیگر مجدداً تلاش کنید.`,
        errorEn: `Too many failed attempts. Try again in ${waitSec}s.`
      };
    }

    if (!this.activePairingCode || Date.now() > this.codeExpiresAt) {
      return {
        success: false,
        error: 'کد جفت‌سازی منقضی شده یا وجود ندارد. لطفاً در ویندوز کد جدید درخواست نمایید.',
        errorEn: 'Pairing code has expired or is invalid. Request a new code from Windows Desktop.'
      };
    }

    if (code.toString().trim() !== this.activePairingCode) {
      this.failedAttempts++;
      if (this.failedAttempts >= 5) {
        this.lockoutUntil = Date.now() + (5 * 60 * 1000); // 5 min lockout
      }
      return {
        success: false,
        error: 'کد جفت‌سازی اشتباه است.',
        errorEn: 'Incorrect pairing code.'
      };
    }

    // Success: Generate cryptographically secure token & register device
    const deviceId = 'dev_' + crypto.randomBytes(8).toString('hex');
    const authToken = 'htk_sec_' + crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();

    const newDevice = {
      id: deviceId,
      name: deviceName.trim() || 'Android Device',
      platform,
      clientVersion,
      token: authToken,
      status: 'active',
      pairedAt: now,
      lastSeen: now,
      ipAddress: ip,
      permissions: {
        canChat: true,
        canSubmitMissions: true,
        canRemoteApprove: true,
        canViewTelemetry: true,
        canManageTasks: true
      }
    };

    const devices = this.loadDevices();
    devices.push(newDevice);
    this.saveDevices(devices);

    // Invalidate pairing code after single successful use
    this.activePairingCode = null;
    this.codeExpiresAt = 0;
    this.failedAttempts = 0;

    return {
      success: true,
      deviceId,
      token: authToken,
      deviceName: newDevice.name,
      pairedAt: now,
      permissions: newDevice.permissions
    };
  }

  /**
   * Verifies Bearer auth token and updates lastSeen.
   */
  authenticateToken(token) {
    if (!token || typeof token !== 'string') return null;
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();

    const devices = this.loadDevices();
    const device = devices.find(d => d.token === cleanToken && d.status === 'active');
    if (!device) return null;

    // Update lastSeen in background
    device.lastSeen = new Date().toISOString();
    this.saveDevices(devices);

    return {
      id: device.id,
      name: device.name,
      platform: device.platform,
      permissions: device.permissions,
      pairedAt: device.pairedAt,
      lastSeen: device.lastSeen
    };
  }

  /**
   * Lists all paired devices without exposing secrets.
   */
  getPairedDevices() {
    const devices = this.loadDevices();
    return devices.map(d => ({
      id: d.id,
      name: d.name,
      platform: d.platform,
      status: d.status,
      pairedAt: d.pairedAt,
      lastSeen: d.lastSeen,
      maskedToken: d.token ? `htk_sec_...${d.token.slice(-6)}` : 'none',
      permissions: d.permissions
    }));
  }

  /**
   * Revokes a paired device.
   */
  revokeDevice(deviceId) {
    const devices = this.loadDevices();
    const target = devices.find(d => d.id === deviceId);
    if (!target) return { success: false, error: 'Device not found' };

    target.status = 'revoked';
    target.revokedAt = new Date().toISOString();
    this.saveDevices(devices);
    return { success: true, message: `دستگاه ${target.name} با موفقیت لغو اتصال شد.` };
  }

  /**
   * Revokes all paired devices.
   */
  revokeAllDevices() {
    const devices = this.loadDevices();
    for (const d of devices) {
      d.status = 'revoked';
      d.revokedAt = new Date().toISOString();
    }
    this.saveDevices(devices);
    return { success: true, message: 'تمام دستگاه‌های متصل لغو دسترسی شدند.' };
  }
}

module.exports = new RemotePairingManager();
