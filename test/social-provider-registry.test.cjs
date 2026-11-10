'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SOCIAL_PROVIDER_DEFINITIONS,
  SocialProviderRegistry
} = require('../src/connectors/social-provider-registry');

function createMetaAdapter(overrides = {}) {
  return {
    capabilities: ['account-discovery', 'read-only-account-verification'],
    getStatus: () => ({ connected: false, accessToken: 'must-not-be-exposed' }),
    beginAuthorization: input => ({ success: true, input }),
    verifyAccounts: () => ({ success: true, pages: [] }),
    disconnect: () => ({ success: true, connected: false }),
    ...overrides
  };
}

test('provider catalog preserves all entries and reports only registered adapters as implemented', () => {
  const registry = new SocialProviderRegistry();
  const providers = registry.listProviders();

  assert.deepEqual(providers.map(provider => provider.id), [
    'instagram',
    'facebook',
    'telegram',
    'whatsapp-business',
    'linkedin',
    'youtube',
    'tiktok',
    'x',
    'threads',
    'pinterest',
    'google-analytics',
    'search-console',
    'authorized-websites'
  ]);
  assert.equal(new Set(SOCIAL_PROVIDER_DEFINITIONS.map(provider => provider.id)).size, providers.length);
  assert.equal(providers.filter(provider => provider.id === 'telegram')[0].integrationStatus, 'not-implemented');
  assert.equal(providers.filter(provider => provider.id !== 'telegram').every(provider => provider.connectionStatus === 'not-configured'), true);
  assert.equal(providers.filter(provider => provider.id !== 'telegram').every(provider => provider.integrationStatus === 'not-implemented'), true);
});

test('registered Meta adapter reports sanitized status for Facebook and Instagram', () => {
  const registry = new SocialProviderRegistry();
  registry.registerAdapter('meta', createMetaAdapter({
    getStatus: () => ({ connected: true, accessToken: 'must-not-be-exposed' })
  }));
  const providers = registry.listProviders();

  for (const id of ['facebook', 'instagram']) {
    const provider = providers.find(item => item.id === id);
    assert.equal(provider.integrationStatus, 'implemented');
    assert.equal(provider.connectionStatus, 'connected');
    assert.equal(provider.mode, 'read-only');
    assert.deepEqual(provider.capabilities, ['account-discovery', 'read-only-account-verification']);
  }
  assert.equal(JSON.stringify(providers).includes('must-not-be-exposed'), false);
  assert.equal(providers.find(item => item.id === 'telegram').connectionStatus, 'not-configured');
});

test('registered Telegram adapter updates only the official Telegram provider entry', () => {
  const registry = new SocialProviderRegistry();
  const adapter = {
    capabilities: ['bot-verification', 'read-only'],
    getStatus: () => ({ connected: true }),
    beginAuthorization: input => ({ success: true, input }),
    verifyAccounts: () => ({ success: true }),
    disconnect: () => ({ success: true, connected: false })
  };
  registry.registerAdapter('telegram', adapter);
  const providers = registry.listProviders();
  assert.equal(providers.length, 13);
  assert.equal(providers.find(item => item.id === 'telegram').connectionStatus, 'connected');
  assert.equal(providers.find(item => item.id === 'telegram').mode, 'read-only');
  assert.equal(providers.find(item => item.id === 'facebook').integrationStatus, 'not-implemented');
});

test('shared authorization, account verification, and disconnect methods delegate only to configured adapters', () => {
  const registry = new SocialProviderRegistry();
  const adapter = createMetaAdapter();
  registry.registerAdapter('meta', adapter);

  assert.deepEqual(registry.beginAuthorization('facebook', { appId: '1234567890' }), {
    success: true,
    input: { appId: '1234567890' }
  });
  assert.deepEqual(registry.verifyAccounts('instagram'), { success: true, pages: [] });
  assert.deepEqual(registry.disconnect('facebook'), { success: true, connected: false });
  assert.deepEqual(registry.verifyAccounts('telegram'), {
    success: false,
    error: 'SOCIAL_PROVIDER_NOT_CONFIGURED'
  });
  assert.throws(() => registry.verifyAccounts('unknown'), /Unknown social provider/);
});

test('registry rejects unknown, duplicate, and contract-invalid adapters', () => {
  const registry = new SocialProviderRegistry();
  assert.throws(() => registry.registerAdapter('unknown', createMetaAdapter()), /Unknown social adapter/);
  assert.throws(() => registry.registerAdapter('meta', {}), /does not satisfy the connector contract/);
  registry.registerAdapter('meta', createMetaAdapter());
  assert.throws(() => registry.registerAdapter('meta', createMetaAdapter()), /already registered/);
});

test('invalid connector status fails instead of producing a success-shaped fallback', () => {
  const registry = new SocialProviderRegistry();
  registry.registerAdapter('meta', createMetaAdapter({
    getStatus: () => ({ connected: 'yes' })
  }));
  assert.throws(() => registry.listProviders(), /invalid status/);
});
