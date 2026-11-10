'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

class OsCredentialStore {
  constructor({ safeStorage, directory } = {}) {
    if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== 'function' ||
        typeof safeStorage.encryptString !== 'function' ||
        typeof safeStorage.decryptString !== 'function') {
      throw new TypeError('Electron safeStorage is required for OS-backed credential storage.');
    }
    if (typeof directory !== 'string' || !directory) {
      throw new TypeError('A credential-store directory is required.');
    }
    this.safeStorage = safeStorage;
    this.directory = directory;
  }

  get(key) {
    const file = this._fileFor(key);
    if (!fs.existsSync(file)) return null;
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error('OS credential encryption is unavailable.');
    }

    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (record.version !== 1 || typeof record.ciphertext !== 'string') {
      throw new Error('Stored credential record is invalid.');
    }
    return JSON.parse(this.safeStorage.decryptString(Buffer.from(record.ciphertext, 'base64')));
  }

  set(key, value) {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error('OS credential encryption is unavailable.');
    }
    const ciphertext = this.safeStorage.encryptString(JSON.stringify(value)).toString('base64');
    fs.mkdirSync(this.directory, { recursive: true });
    const file = this._fileFor(key);
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, ciphertext }), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(temporary, file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }

  delete(key) {
    const file = this._fileFor(key);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  _fileFor(key) {
    if (typeof key !== 'string' || !key || key.length > 128) {
      throw new TypeError('Credential key is invalid.');
    }
    const name = crypto.createHash('sha256').update(key).digest('hex');
    return path.join(this.directory, `${name}.json`);
  }
}

module.exports = { OsCredentialStore };