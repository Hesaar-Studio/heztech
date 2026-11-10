'use strict';

const SOCIAL_PROVIDER_DEFINITIONS = Object.freeze([
  { id: 'instagram', name: 'Instagram', category: 'social', adapterId: 'meta' },
  { id: 'facebook', name: 'Facebook', category: 'social', adapterId: 'meta' },
  { id: 'telegram', name: 'Telegram', category: 'messaging', adapterId: 'telegram' },
  { id: 'whatsapp-business', name: 'WhatsApp Business', category: 'messaging', adapterId: null },
  { id: 'linkedin', name: 'LinkedIn', category: 'social', adapterId: null },
  { id: 'youtube', name: 'YouTube', category: 'video', adapterId: null },
  { id: 'tiktok', name: 'TikTok', category: 'social', adapterId: null },
  { id: 'x', name: 'X', category: 'social', adapterId: null },
  { id: 'threads', name: 'Threads', category: 'social', adapterId: null },
  { id: 'pinterest', name: 'Pinterest', category: 'social', adapterId: null },
  { id: 'google-analytics', name: 'Google Analytics', category: 'analytics', adapterId: null },
  { id: 'search-console', name: 'Google Search Console', category: 'analytics', adapterId: null },
  { id: 'authorized-websites', name: 'Authorized websites', category: 'web', adapterId: null }
].map(provider => Object.freeze(provider)));

const ADAPTER_METHODS = Object.freeze([
  'getStatus',
  'beginAuthorization',
  'verifyAccounts',
  'disconnect'
]);

class SocialProviderRegistry {
  constructor() {
    this.adapters = new Map();
  }

  registerAdapter(adapterId, adapter) {
    if (!SOCIAL_PROVIDER_DEFINITIONS.some(provider => provider.adapterId === adapterId)) {
      throw new RangeError(`Unknown social adapter: ${adapterId}`);
    }
    if (this.adapters.has(adapterId)) {
      throw new Error(`Social adapter already registered: ${adapterId}`);
    }
    if (!adapter || ADAPTER_METHODS.some(method => typeof adapter[method] !== 'function')) {
      throw new TypeError(`Social adapter "${adapterId}" does not satisfy the connector contract.`);
    }
    if (!Array.isArray(adapter.capabilities) ||
        adapter.capabilities.some(capability => typeof capability !== 'string')) {
      throw new TypeError(`Social adapter "${adapterId}" must declare string capabilities.`);
    }

    this.adapters.set(adapterId, adapter);
  }

  listProviders() {
    return SOCIAL_PROVIDER_DEFINITIONS.map(provider => {
      const adapter = provider.adapterId ? this.adapters.get(provider.adapterId) : null;
      const status = adapter ? adapter.getStatus() : null;
      if (status && typeof status.connected !== 'boolean') {
        throw new TypeError(`Social adapter "${provider.adapterId}" returned an invalid status.`);
      }

      return {
        id: provider.id,
        name: provider.name,
        category: provider.category,
        integrationStatus: adapter ? 'implemented' : 'not-implemented',
        connectionStatus: !adapter
          ? 'not-configured'
          : status.connected ? 'connected' : 'not-connected',
        mode: adapter ? (adapter.mode || 'read-only') : 'unavailable',
        authorizationAvailable: Boolean(adapter),
        capabilities: adapter ? [...adapter.capabilities] : []
      };
    });
  }

  beginAuthorization(providerId, input) {
    const adapter = this._getAdapter(providerId);
    return adapter
      ? adapter.beginAuthorization(input)
      : { success: false, error: 'SOCIAL_PROVIDER_NOT_CONFIGURED' };
  }

  verifyAccounts(providerId, input) {
    const adapter = this._getAdapter(providerId);
    return adapter
      ? adapter.verifyAccounts(input)
      : { success: false, error: 'SOCIAL_PROVIDER_NOT_CONFIGURED' };
  }

  disconnect(providerId) {
    const adapter = this._getAdapter(providerId);
    return adapter
      ? adapter.disconnect()
      : { success: false, error: 'SOCIAL_PROVIDER_NOT_CONFIGURED' };
  }

  _getAdapter(providerId) {
    const provider = SOCIAL_PROVIDER_DEFINITIONS.find(item => item.id === providerId);
    if (!provider) throw new RangeError(`Unknown social provider: ${providerId}`);
    return provider.adapterId ? this.adapters.get(provider.adapterId) : null;
  }
}

module.exports = {
  SOCIAL_PROVIDER_DEFINITIONS,
  SocialProviderRegistry
};
