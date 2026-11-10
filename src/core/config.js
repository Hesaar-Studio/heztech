/**
 * JARVIS Configuration Manager
 * Handles persistent configuration with Windows DPAPI encryption via Electron safeStorage.
 */

const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');
const IDENTITY = require('./identity');

const VAULT_DIR = path.resolve(process.env.HEZTECH_DATA_DIR || 'C:\\Users\\Green\\openclaw\\vault');
const CONFIG_FILE = path.join(VAULT_DIR, 'config.json');

// Ensure vault directory exists
if (!fs.existsSync(VAULT_DIR)) {
  fs.mkdirSync(VAULT_DIR, { recursive: true });
}

class ConfigManager {
  constructor() {
    this.defaultConfig = {
      assistant: {
        name: IDENTITY.assistant.name,
        nameFa: IDENTITY.assistant.nameFa,
        displayName: IDENTITY.assistant.displayName
      },
      product: {
        name: IDENTITY.product.name,
        nameFa: IDENTITY.product.nameFa
      },
      model: 'gemini-3.5-flash-lite',
      openclawUrl: 'http://127.0.0.1:8000',
      n8nUrl: 'http://localhost:5678',
      geminiApiKey: '',
      isKeyEncrypted: false,
      theme: 'cyberpunk-neon',
      language: 'fa',
      autoApproveLowRisk: true,
      bridgePort: 18790
    };
  }

  /**
   * Encrypt a string using Windows DPAPI via Electron safeStorage.
   * There is deliberately no reversible fallback: a secret that cannot be
   * encrypted is not written at all.
   */
  encryptSecret(plainText) {
    if (!plainText) return '';
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
      const err = new Error('SECURE_STORAGE_UNAVAILABLE');
      err.code = 'SECURE_STORAGE_UNAVAILABLE';
      throw err;
    }
    try {
      const encryptedBuffer = safeStorage.encryptString(plainText);
      return 'dpapi:' + encryptedBuffer.toString('base64');
    } catch (e) {
      const err = new Error('SECURE_STORAGE_UNAVAILABLE');
      err.code = 'SECURE_STORAGE_UNAVAILABLE';
      throw err;
    }
  }

  /**
   * Decrypt a string using Windows DPAPI.
   * Reading a legacy `b64:` value is kept for migration only; new writes never
   * produce it.
   */
  decryptSecret(cipherText) {
    if (!cipherText) return '';
    try {
      if (cipherText.startsWith('dpapi:') && safeStorage && safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(cipherText.replace('dpapi:', ''), 'base64');
        return safeStorage.decryptString(buffer);
      }
      if (cipherText.startsWith('b64:')) {
        return Buffer.from(cipherText.replace('b64:', ''), 'base64').toString('utf-8');
      }
    } catch (e) {
      console.error('[Config] Failed to decrypt secret:', e.message);
    }
    return cipherText;
  }

  load() {
    let config = { ...this.defaultConfig };
    let keyStoredWithoutEncryption = false;

    // 1. Try reading from environment or known .env files
    const possibleEnvFiles = process.env.HEZTECH_DATA_DIR ? [] : [
      path.join(VAULT_DIR, '.env'),
      path.resolve('C:\\Users\\Green\\clean.env'),
      path.resolve('C:\\Users\\Green\\.env'),
      path.resolve('C:\\Users\\Green\\openclaw\\.env'),
      path.resolve('C:\\Users\\Green\\.openclaw\\.env')
    ];

    for (const envFile of possibleEnvFiles) {
      try {
        if (fs.existsSync(envFile)) {
          const lines = fs.readFileSync(envFile, 'utf-8').split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('GEMINI_API_KEY=')) {
              const val = trimmed.replace('GEMINI_API_KEY=', '').trim().replace(/^["']|["']$/g, '');
              if (val) config.geminiApiKey = val;
            }
          }
        }
      } catch (e) {}
    }

    // 2. Read from config.json
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        const fileContent = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(fileContent);
        config = { ...config, ...parsed };

        // If key is encrypted, decrypt for internal runtime usage
        if (config.isKeyEncrypted && config.geminiApiKey) {
          config.geminiApiKeyDecrypted = this.decryptSecret(config.geminiApiKey);
        } else {
          config.geminiApiKeyDecrypted = config.geminiApiKey;
        }

        // Report (never silently fix) a key that is stored without DPAPI.
        // The file itself is left untouched so the owner decides when to migrate.
        if (config.geminiApiKey && !String(config.geminiApiKey).startsWith('dpapi:')) {
          keyStoredWithoutEncryption = true;
        }
      } catch (e) {
        console.error('[Config] Error parsing config.json:', e.message);
      }
    }

    // Authoritative identity: stale config.json defaults CANNOT override ARTA or HezTech
    config.assistant = {
      name: IDENTITY.assistant.name,
      nameFa: IDENTITY.assistant.nameFa,
      displayName: IDENTITY.assistant.displayName
    };
    config.product = {
      name: IDENTITY.product.name,
      nameFa: IDENTITY.product.nameFa
    };

    config.securityWarnings = keyStoredWithoutEncryption
      ? ['API_KEY_STORED_WITHOUT_ENCRYPTION']
      : [];

    return config;
  }

  save(updates) {
    try {
      const current = this.load();
      const updated = { ...current, ...updates };

      // Never persist a secret without valid encryption — including a plaintext
      // key loaded from an older file that this save did not touch.
      if (updated.geminiApiKey && !String(updated.geminiApiKey).startsWith('dpapi:')) {
        let rawKey = String(updated.geminiApiKey);
        if (rawKey.startsWith('b64:')) {
          rawKey = Buffer.from(rawKey.slice(4), 'base64').toString('utf-8');
        }
        try {
          updated.geminiApiKey = this.encryptSecret(rawKey);
          updated.isKeyEncrypted = true;
        } catch (e) {
          return {
            success: false,
            error: 'SECURE_STORAGE_UNAVAILABLE',
            message: 'ذخیره‌سازی امن ویندوز (DPAPI) در دسترس نیست؛ کلید ذخیره نشد.'
          };
        }
      }

      // Do not write temporary runtime fields
      delete updated.geminiApiKeyDecrypted;
      delete updated.securityWarnings;

      fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
      return { success: true, config: this.load() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  getDecryptedApiKey() {
    const cfg = this.load();
    return cfg.geminiApiKeyDecrypted || cfg.geminiApiKey || '';
  }
}

module.exports = new ConfigManager();
