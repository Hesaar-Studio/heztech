'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OsCredentialStore } = require('../src/core/os-credential-store');

test('OS-backed credential store encrypts values and supports replacement and removal', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'heztech-secure-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`encrypted:${value}`),
    decryptString: value => value.toString().replace(/^encrypted:/, '')
  };
  const store = new OsCredentialStore({ safeStorage, directory });
  store.set('provider', { token: 'test-secret' });
  const file = fs.readdirSync(directory)[0];
  assert.equal(fs.readFileSync(path.join(directory, file), 'utf8').includes('test-secret'), false);
  assert.deepEqual(store.get('provider'), { token: 'test-secret' });
  store.delete('provider');
  assert.equal(store.get('provider'), null);
});

test('OS-backed credential store fails closed when encryption is unavailable', () => {
  const store = new OsCredentialStore({
    safeStorage: {
      isEncryptionAvailable: () => false,
      encryptString: value => Buffer.from(value),
      decryptString: value => value.toString()
    },
    directory: path.join(os.tmpdir(), 'heztech-unavailable-store')
  });
  assert.throws(() => store.set('mfa', { secret: 'test' }), /encryption is unavailable/);
});