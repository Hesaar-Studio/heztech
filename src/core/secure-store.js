/**
 * HezTech Secure Credential Store
 * Encrypts and manages secrets using the operating-system credential store
 * (via Electron safeStorage). New secrets are never stored using a derived key.
 * Stored exclusively under the application's private user directory:
 * %APPDATA%\HezTech\secure-store\credentials.enc.json
 * NEVER WRITES TO OR MODIFIES OBSIDIAN VAULT.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Determine application secure store directory
function getSecureStoreDir() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'HezTech', 'secure-store');
}

const SECURE_STORE_DIR = getSecureStoreDir();
const CREDENTIALS_FILE = path.join(SECURE_STORE_DIR, 'credentials.enc.json');

class SecureCredentialStore {
  constructor() {
    this.ensureStoreDir();
  }

  ensureStoreDir() {
    try {
      if (!fs.existsSync(SECURE_STORE_DIR)) {
        fs.mkdirSync(SECURE_STORE_DIR, { recursive: true });
      }
    } catch (e) {
      console.warn('[SecureStore] Warning ensuring directory:', e.message);
    }
  }

  /**
   * Encrypt a sensitive value. Refuse to persist secrets without OS encryption.
   */
  encryptValue(plainText) {
    if (!plainText || typeof plainText !== 'string') return '';

    try {
      const { safeStorage } = require('electron');
      if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
        throw new Error('OS credential encryption is unavailable.');
      }
      return 'dpapi:' + safeStorage.encryptString(plainText).toString('base64');
    } catch (err) {
      throw new Error(`Secure credential encryption failed: ${err.message}`);
    }
  }

  /**
   * Decrypt a sensitive value.
   */
  decryptValue(cipherText) {
    if (!cipherText || typeof cipherText !== 'string') return '';

    // 1. Decrypt safeStorage DPAPI
    if (cipherText.startsWith('dpapi:')) {
      try {
        const { safeStorage } = require('electron');
        if (safeStorage && safeStorage.isEncryptionAvailable()) {
          const buffer = Buffer.from(cipherText.replace('dpapi:', ''), 'base64');
          return safeStorage.decryptString(buffer);
        }
      } catch (err) {
        console.error('[SecureStore] DPAPI decryption failed:', err.message);
        return '';
      }
    }

    // Read legacy records only; new credentials are never written with this format.
    if (cipherText.startsWith('gcm:')) {
      try {
        const raw = Buffer.from(cipherText.replace('gcm:', ''), 'base64');
        if (raw.length < 28) return '';
        const iv = raw.subarray(0, 12);
        const tag = raw.subarray(12, 28);
        const encrypted = raw.subarray(28);
        const entropy = [
          os.hostname(),
          os.userInfo().username,
          process.env.COMPUTERNAME || 'WINDOWS_PC',
          process.env.PROCESSOR_IDENTIFIER || 'CPU_ID'
        ].join('::');
        const machineKey = crypto.createHash('sha256').update(entropy).digest();
        const decipher = crypto.createDecipheriv('aes-256-gcm', machineKey, iv);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(encrypted, null, 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch (err) {
        console.error('[SecureStore] GCM decryption failed:', err.message);
        return '';
      }
    }

    // Never return unencrypted values directly if expected to be encrypted
    return '';
  }

  /**
   * Load credentials data, returning sanitized metadata by default.
   */
  loadCredentials(includeDecrypted = false) {
    this.ensureStoreDir();
    if (!fs.existsSync(CREDENTIALS_FILE)) {
      return {
        telegram: { configured: false },
        google: { configured: false },
        instagram: { configured: false },
        youtube: { configured: false }
      };
    }

    try {
      const data = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
      if (!includeDecrypted) {
        // Return sanitized view (never disclose secrets)
        return {
          telegram: {
            configured: Boolean(data.telegram?.botTokenEncrypted),
            botToken: data.telegram?.botTokenEncrypted ? '[CONFIGURED_ENCRYPTED]' : '',
            defaultChatId: data.telegram?.defaultChatId || '',
            requireApproval: true
          },
          google: {
            configured: Boolean(data.google?.appPasswordEncrypted || data.google?.refreshTokenEncrypted),
            email: data.google?.email || '',
            appPassword: data.google?.appPasswordEncrypted ? '[CONFIGURED_ENCRYPTED]' : '',
            refreshToken: data.google?.refreshTokenEncrypted ? '[CONFIGURED_ENCRYPTED]' : '',
            authType: data.google?.authType || 'none',
            requireApproval: true
          },
          instagram: {
            configured: Boolean(data.instagram?.accessTokenEncrypted),
            accessToken: data.instagram?.accessTokenEncrypted ? '[CONFIGURED_ENCRYPTED]' : '',
            username: data.instagram?.username || '',
            requireApproval: true
          },
          youtube: {
            configured: Boolean(data.youtube?.refreshTokenEncrypted),
            refreshToken: data.youtube?.refreshTokenEncrypted ? '[CONFIGURED_ENCRYPTED]' : '',
            channelId: data.youtube?.channelId || '',
            requireApproval: true
          }
        };
      }

      // Internal caller requested decrypted secrets for verified execution
      return {
        telegram: {
          botToken: this.decryptValue(data.telegram?.botTokenEncrypted),
          defaultChatId: data.telegram?.defaultChatId || '',
          requireApproval: true
        },
        google: {
          email: data.google?.email || '',
          appPassword: this.decryptValue(data.google?.appPasswordEncrypted),
          clientId: data.google?.clientId || '',
          clientSecret: this.decryptValue(data.google?.clientSecretEncrypted),
          refreshToken: this.decryptValue(data.google?.refreshTokenEncrypted),
          authType: data.google?.authType || 'app_password',
          requireApproval: true
        },
        instagram: {
          username: data.instagram?.username || '',
          accessToken: this.decryptValue(data.instagram?.accessTokenEncrypted),
          requireApproval: true
        },
        youtube: {
          channelId: data.youtube?.channelId || '',
          clientId: data.youtube?.clientId || '',
          clientSecret: this.decryptValue(data.youtube?.clientSecretEncrypted),
          refreshToken: this.decryptValue(data.youtube?.refreshTokenEncrypted),
          requireApproval: true
        }
      };
    } catch (e) {
      console.error('[SecureStore] Failed to read credentials:', e.message);
      return {};
    }
  }

  /**
   * Save credentials with mandatory encryption of all secret fields.
   */
  saveCredentials(service, secrets) {
    if (!['telegram', 'google', 'instagram', 'youtube'].includes(service)) {
      throw new RangeError(`Unsupported credential service: ${service}`);
    }
    if (!secrets || typeof secrets !== 'object' || Array.isArray(secrets)) {
      throw new TypeError('Credential values must be an object.');
    }
    this.ensureStoreDir();
    let current = {};
    if (fs.existsSync(CREDENTIALS_FILE)) {
      try {
        current = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
      } catch (e) {
        current = {};
      }
    }

    if (!current[service]) current[service] = {};

    if (service === 'telegram') {
      if (secrets.botToken !== undefined) {
        if (secrets.botToken) {
          current.telegram.botTokenEncrypted = this.encryptValue(secrets.botToken);
        } else {
          delete current.telegram.botTokenEncrypted;
        }
      }
      if (secrets.defaultChatId !== undefined) {
        current.telegram.defaultChatId = secrets.defaultChatId;
      }
    } else if (service === 'google') {
      if (secrets.email !== undefined) current.google.email = secrets.email;
      if (secrets.appPassword !== undefined) {
        if (secrets.appPassword) {
          current.google.appPasswordEncrypted = this.encryptValue(secrets.appPassword);
        } else {
          delete current.google.appPasswordEncrypted;
        }
      }
      if (secrets.clientSecret !== undefined) {
        if (secrets.clientSecret) {
          current.google.clientSecretEncrypted = this.encryptValue(secrets.clientSecret);
        } else {
          delete current.google.clientSecretEncrypted;
        }
      }
      if (secrets.refreshToken !== undefined) {
        if (secrets.refreshToken) {
          current.google.refreshTokenEncrypted = this.encryptValue(secrets.refreshToken);
        } else {
          delete current.google.refreshTokenEncrypted;
        }
      }
      if (secrets.authType) current.google.authType = secrets.authType;
    } else if (service === 'instagram') {
      if (secrets.username !== undefined) current.instagram.username = secrets.username;
      if (secrets.accessToken !== undefined) {
        if (secrets.accessToken) {
          current.instagram.accessTokenEncrypted = this.encryptValue(secrets.accessToken);
        } else {
          delete current.instagram.accessTokenEncrypted;
        }
      }
    } else if (service === 'youtube') {
      if (secrets.channelId !== undefined) current.youtube.channelId = secrets.channelId;
      if (secrets.clientSecret !== undefined) {
        if (secrets.clientSecret) {
          current.youtube.clientSecretEncrypted = this.encryptValue(secrets.clientSecret);
        } else {
          delete current.youtube.clientSecretEncrypted;
        }
      }
      if (secrets.refreshToken !== undefined) {
        if (secrets.refreshToken) {
          current.youtube.refreshTokenEncrypted = this.encryptValue(secrets.refreshToken);
        } else {
          delete current.youtube.refreshTokenEncrypted;
        }
      }
    }

    current.updatedAt = new Date().toISOString();
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(current, null, 2), 'utf-8');
    return { success: true, service, configured: true };
  }
}

module.exports = new SecureCredentialStore();
