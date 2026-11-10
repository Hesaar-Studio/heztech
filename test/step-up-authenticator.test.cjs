'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { StepUpAuthenticator } = require('../src/core/step-up-authenticator');

function createStore() {
  const values = new Map();
  return {
    get: key => values.get(key) || null,
    set: (key, value) => values.set(key, value),
    delete: key => values.delete(key)
  };
}

function totp(secret, time) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const bytes = [];
  for (const character of secret) {
    value = (value << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  const key = Buffer.from(bytes);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / 30)));
  const digest = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

test('step-up approvals fail closed until MFA is enrolled', () => {
  const auth = new StepUpAuthenticator({ credentialStore: createStore() });
  assert.deepEqual(auth.createApprovalChallenge('appr_0123456789ab'), { success: false, error: 'MFA_NOT_CONFIGURED' });
  assert.equal(auth.consumeApproval('appr_0123456789ab'), false);
});

test('TOTP enrollment and action-bound step-up challenges are expiring and one-time', () => {
  let now = 1_800_000_000_000;
  const auth = new StepUpAuthenticator({ credentialStore: createStore(), now: () => now });
  const enrollment = auth.beginEnrollment();
  assert.equal(enrollment.success, true);
  assert.match(enrollment.otpauthUrl, /^otpauth:\/\/totp\/HezTech:ARTA\?/);
  assert.deepEqual(auth.completeEnrollment('000000'), { success: false, error: 'MFA_CODE_INVALID' });
  assert.equal(auth.completeEnrollment(totp(enrollment.secret, now)).success, true);

  const id = 'appr_0123456789ab';
  now += 30_000;
  const challenge = auth.createApprovalChallenge(id);
  assert.equal(challenge.success, true);
  assert.deepEqual(auth.verifyApprovalChallenge(challenge.challenge, 'appr_ffffffffffff', totp(enrollment.secret, now)), {
    success: false,
    error: 'STEP_UP_CHALLENGE_INVALID'
  });
  const next = auth.createApprovalChallenge(id);
  assert.equal(auth.verifyApprovalChallenge(next.challenge, id, totp(enrollment.secret, now)).success, true);
  assert.equal(auth.consumeApproval(id), true);
  assert.equal(auth.consumeApproval(id), false);
  assert.deepEqual(auth.verifyApprovalChallenge(next.challenge, id, totp(enrollment.secret, now)), {
    success: false,
    error: 'STEP_UP_CHALLENGE_INVALID'
  });
});
