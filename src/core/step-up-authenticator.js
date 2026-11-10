'use strict';

const crypto = require('node:crypto');

const ENROLLMENT_TTL_MS = 5 * 60 * 1000;
const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const TOTP_PERIOD_SECONDS = 30;

class StepUpAuthenticator {
  constructor({ credentialStore, now = Date.now } = {}) {
    if (!credentialStore || typeof credentialStore.get !== 'function' ||
        typeof credentialStore.set !== 'function' || typeof credentialStore.delete !== 'function') {
      throw new TypeError('An OS-backed credential store is required.');
    }
    this.credentialStore = credentialStore;
    this.now = now;
    this.pendingEnrollment = null;
    this.challenges = new Map();
    this.approvals = new Map();
  }

  getStatus() {
    return { enrolled: Boolean(this.credentialStore.get('mfa')) };
  }

  beginEnrollment() {
    if (this.getStatus().enrolled) return { success: false, error: 'MFA_ALREADY_ENROLLED' };
    const secret = encodeBase32(crypto.randomBytes(20));
    this.pendingEnrollment = { secret, expiresAt: this.now() + ENROLLMENT_TTL_MS };
    return {
      success: true,
      secret,
      otpauthUrl: `otpauth://totp/HezTech:ARTA?secret=${secret}&issuer=HezTech&algorithm=SHA1&digits=6&period=30`,
      expiresAt: this.pendingEnrollment.expiresAt
    };
  }

  completeEnrollment(code) {
    const pending = this.pendingEnrollment;
    if (!pending || pending.expiresAt <= this.now()) return { success: false, error: 'MFA_ENROLLMENT_EXPIRED' };
    const counter = matchTotpCounter(pending.secret, code, this.now());
    if (counter === null) return { success: false, error: 'MFA_CODE_INVALID' };
    this.credentialStore.set('mfa', { secret: pending.secret, lastCounter: counter });
    this.pendingEnrollment = null;
    return { success: true, enrolled: true };
  }

  createApprovalChallenge(approvalId) {
    if (typeof approvalId !== 'string' || !/^appr_[a-f0-9]{12}$/.test(approvalId)) {
      return { success: false, error: 'APPROVAL_ID_INVALID' };
    }
    if (!this.getStatus().enrolled) return { success: false, error: 'MFA_NOT_CONFIGURED' };
    const challenge = crypto.randomBytes(32).toString('base64url');
    const expiresAt = this.now() + CHALLENGE_TTL_MS;
    this.challenges.set(challenge, { approvalId, expiresAt });
    return { success: true, challenge, expiresAt };
  }

  verifyApprovalChallenge(challenge, approvalId, code) {
    const record = this.challenges.get(challenge);
    this.challenges.delete(challenge);
    if (!record || record.expiresAt <= this.now() || record.approvalId !== approvalId) {
      return { success: false, error: 'STEP_UP_CHALLENGE_INVALID' };
    }
    const credentials = this.credentialStore.get('mfa');
    const counter = matchTotpCounter(credentials.secret, code, this.now());
    if (counter === null || counter <= credentials.lastCounter) {
      return { success: false, error: 'MFA_CODE_INVALID_OR_REPLAYED' };
    }
    this.credentialStore.set('mfa', { ...credentials, lastCounter: counter });
    this.approvals.set(approvalId, this.now() + CHALLENGE_TTL_MS);
    return { success: true };
  }

  consumeApproval(approvalId) {
    const expiresAt = this.approvals.get(approvalId);
    this.approvals.delete(approvalId);
    return Number.isFinite(expiresAt) && expiresAt > this.now();
  }

  clearPending() {
    this.pendingEnrollment = null;
    this.challenges.clear();
    this.approvals.clear();
  }
}

function matchTotpCounter(secret, code, now) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const supplied = Buffer.from(code);
  const current = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
  for (const counter of [current - 1, current, current + 1]) {
    if (counter < 0) continue;
    const expected = Buffer.from(generateTotp(secret, counter));
    if (crypto.timingSafeEqual(supplied, expected)) return counter;
  }
  return null;
}

function generateTotp(secret, counter) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, '0');
}

function encodeBase32(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let encoded = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) encoded += alphabet[(value << (5 - bits)) & 31];
  return encoded;
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let buffer = 0;
  const bytes = [];
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error('Stored MFA secret is invalid.');
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

module.exports = { StepUpAuthenticator };
