'use strict';

const crypto = require('node:crypto');

const GRAPH_API_VERSION = 'v26.0';
const AUTHORIZATION_ENDPOINT = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;
const REDIRECT_URI = 'https://www.facebook.com/connect/login_success.html';
const REQUESTED_PERMISSIONS = Object.freeze([
  'public_profile',
  'pages_show_list',
  'pages_read_engagement',
  'instagram_basic'
]);
const TOOL_DEFINITIONS = Object.freeze([
  {
    name: 'meta_connection_status',
    description: 'Return local Meta authorization status without contacting Meta.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'meta_verify_accounts',
    description: 'Read the authorized Facebook profile, Pages, and linked Instagram professional accounts.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
]);

function isMetaAuthorizationRedirect(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://www.facebook.com' &&
      !url.username && !url.password &&
      url.pathname === '/connect/login_success.html';
  } catch {
    return false;
  }
}

function isAllowedMetaAuthorizationNavigation(value) {
  try {
    const url = new URL(value);
    if (isMetaAuthorizationRedirect(value)) return true;
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const hostname = url.hostname.toLowerCase();
    return hostname === 'facebook.com' || hostname.endsWith('.facebook.com') ||
      hostname === 'instagram.com' || hostname.endsWith('.instagram.com');
  } catch {
    return false;
  }
}

class MetaMcpAdapter {
  constructor({ fetchImpl = globalThis.fetch, now = Date.now, credentialStore } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('A Fetch-compatible function is required.');
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.credentialStore = credentialStore || createMemoryCredentialStore();
    this.accessToken = null;
    this.expiresAt = 0;
    this.appId = null;
    this.grantedPermissions = [];
    this.pendingAuthorization = null;
    this._restoreCredentials();
  }

  listTools() {
    return TOOL_DEFINITIONS.map(tool => ({
      ...tool,
      inputSchema: {
        ...tool.inputSchema,
        properties: { ...tool.inputSchema.properties }
      }
    }));
  }

  getConnectionStatus() {
    if (this.accessToken && this.expiresAt <= this.now()) this._clearCredentials();
    return {
      success: true,
      provider: 'meta',
      connected: Boolean(this.accessToken),
      appIdConfigured: Boolean(this.appId),
      expiresAt: this.accessToken ? new Date(this.expiresAt).toISOString() : null,
      grantedPermissions: [...this.grantedPermissions],
      mode: 'read-only',
      availableTools: TOOL_DEFINITIONS.map(tool => tool.name)
    };
  }

  beginAuthorization(appId) {
    const normalizedAppId = typeof appId === 'string' ? appId.trim() : '';
    if (!/^\d{5,20}$/.test(normalizedAppId)) {
      return { success: false, error: 'INVALID_META_APP_ID' };
    }

    const state = crypto.randomBytes(32).toString('base64url');
    this.appId = normalizedAppId;
    this.pendingAuthorization = {
      state,
      appId: normalizedAppId,
      scopes: [...REQUESTED_PERMISSIONS],
      expiresAt: this.now() + 180_000
    };

    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.searchParams.set('client_id', normalizedAppId);
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    // Meta's desktop webview flow documents fragment tokens; its code
    // exchange requires a confidential app secret, so PKCE is not assumed.
    url.searchParams.set('response_type', 'token,granted_scopes');
    url.searchParams.set('scope', this.pendingAuthorization.scopes.join(','));
    url.searchParams.set('state', state);
    return { success: true, authorizationUrl: url.toString() };
  }

  completeAuthorization(redirectUrl) {
    const pending = this.pendingAuthorization;
    this.pendingAuthorization = null;
    if (!pending || pending.expiresAt <= this.now() || !isMetaAuthorizationRedirect(redirectUrl)) {
      return { success: false, error: 'INVALID_OR_EXPIRED_META_AUTHORIZATION' };
    }

    let url;
    try {
      url = new URL(redirectUrl);
    } catch {
      return { success: false, error: 'INVALID_META_AUTHORIZATION_RESPONSE' };
    }

    const query = url.searchParams;
    const fragment = new URLSearchParams(url.hash.slice(1));
    const state = fragment.get('state') || query.get('state');
    if (!this._matchesState(pending.state, state)) {
      return { success: false, error: 'META_AUTHORIZATION_STATE_MISMATCH' };
    }

    const error = fragment.get('error') || query.get('error');
    if (error) return { success: false, error: 'META_AUTHORIZATION_DENIED' };

    if (query.has('access_token') || query.has('code') ||
        fragment.has('code') || url.port || url.searchParams.has('redirect_uri')) {
      return { success: false, error: 'INVALID_META_AUTHORIZATION_RESPONSE' };
    }

    const accessToken = fragment.get('access_token');
    const expiresIn = Number(fragment.get('expires_in'));
    if (!accessToken || accessToken.length > 4096 || /\s/.test(accessToken) ||
        !Number.isSafeInteger(expiresIn) || expiresIn <= 0 || expiresIn > 7_776_000) {
      return { success: false, error: 'INVALID_META_AUTHORIZATION_RESPONSE' };
    }

    const grantedPermissions = (fragment.get('granted_scopes') || query.get('granted_scopes') || '')
      .split(',')
      .map(permission => permission.trim())
      .filter(Boolean)
      .filter((permission, index, list) => list.indexOf(permission) === index);
    if (grantedPermissions.some(permission => !pending.scopes.includes(permission))) {
      return { success: false, error: 'UNREQUESTED_META_PERMISSION_GRANTED' };
    }

    const credentials = {
      accessToken,
      expiresAt: this.now() + expiresIn * 1000,
      appId: pending.appId,
      grantedPermissions
    };
    try {
      this.credentialStore.set('meta', credentials);
    } catch (error) {
      this._clearCredentials();
      return { success: false, error: 'META_CREDENTIAL_STORAGE_FAILED', detail: error.message };
    }
    this._setCredentials(credentials);

    return { success: true, connected: true };
  }

  cancelAuthorization() {
    this.pendingAuthorization = null;
    return { success: true };
  }

  async disconnect() {
    const token = this.accessToken;
    this._clearCredentials();
    if (!token) return { success: true, connected: false, revoked: false };

    try {
      const response = await this.fetchImpl(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/me/permissions`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
          cache: 'no-store'
        }
      );
      if (!response.ok) return { success: true, connected: false, revoked: false, error: 'META_TOKEN_REVOCATION_FAILED' };
      return { success: true, connected: false, revoked: true };
    } catch {
      return { success: true, connected: false, revoked: false, error: 'META_TOKEN_REVOCATION_FAILED' };
    }
  }

  _setCredentials(credentials) {
    this.appId = credentials.appId;
    this.accessToken = credentials.accessToken;
    this.expiresAt = credentials.expiresAt;
    this.grantedPermissions = [...credentials.grantedPermissions];
  }

  _clearCredentials() {
    this.accessToken = null;
    this.expiresAt = 0;
    this.appId = null;
    this.grantedPermissions = [];
    this.pendingAuthorization = null;
    this.credentialStore.delete('meta');
  }

  _restoreCredentials() {
    const credentials = this.credentialStore.get('meta');
    if (!credentials) return;
    if (typeof credentials.accessToken !== 'string' ||
        typeof credentials.expiresAt !== 'number' ||
        typeof credentials.appId !== 'string' ||
        !Array.isArray(credentials.grantedPermissions) ||
        credentials.grantedPermissions.some(permission => !REQUESTED_PERMISSIONS.includes(permission))) {
      this.credentialStore.delete('meta');
      throw new Error('Stored Meta credentials are invalid.');
    }
    if (credentials.expiresAt <= this.now()) {
      this.credentialStore.delete('meta');
      return;
    }
    this._setCredentials(credentials);
  }

  async verifyAccounts() {
    if (!this.accessToken || this.expiresAt <= this.now()) {
      if (this.accessToken) this._clearCredentials();
      return { success: false, error: 'META_NOT_CONNECTED' };
    }

    try {
      const profile = await this._graphGet('/me', 'id,name');
      if (!profile || typeof profile.id !== 'string' || typeof profile.name !== 'string') {
        return { success: false, error: 'META_ACCOUNT_RESPONSE_INVALID' };
      }

      const pageResponse = await this._graphGet(
        '/me/accounts',
        'id,name,instagram_business_account{id,username}',
        { limit: '100' }
      );
      if (!Array.isArray(pageResponse?.data)) {
        return { success: false, error: 'META_ACCOUNT_RESPONSE_INVALID' };
      }

      const pages = pageResponse.data
        .filter(page => typeof page?.id === 'string')
        .map(page => ({
          id: page.id,
          name: typeof page.name === 'string' ? page.name : '',
          instagramAccount: typeof page.instagram_business_account?.id === 'string'
            ? {
                id: page.instagram_business_account.id,
                username: typeof page.instagram_business_account.username === 'string'
                  ? page.instagram_business_account.username
                  : ''
              }
            : null
        }));

      return {
        success: true,
        verifiedAt: new Date(this.now()).toISOString(),
        facebookAccount: { id: profile.id, name: profile.name },
        pages,
        hasMorePages: Boolean(pageResponse.paging?.next)
      };
    } catch {
      return { success: false, error: 'META_ACCOUNT_VERIFICATION_FAILED' };
    }
  }

  async callTool(name, args = {}) {
    if (!args || typeof args !== 'object' || Array.isArray(args) ||
        Object.keys(args).length !== 0) {
      return this._toolError('This tool accepts no arguments.');
    }

    if (name === 'meta_connection_status') {
      return this._toolResult(this.getConnectionStatus());
    }
    if (name === 'meta_verify_accounts') {
      const result = await this.verifyAccounts();
      return result.success ? this._toolResult(result) : this._toolError(result.error);
    }

    return this._toolError('Unknown or write-capable Meta tools are not enabled in Phase 1.');
  }

  async _graphGet(path, fields, params = {}) {
    const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}${path}`);
    url.searchParams.set('fields', fields);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.accessToken}` },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('META_GRAPH_REQUEST_FAILED');
    const payload = await response.json();
    if (!payload || typeof payload !== 'object' || payload.error) {
      throw new Error('META_GRAPH_RESPONSE_INVALID');
    }
    return payload;
  }

  _matchesState(expected, actual) {
    if (typeof actual !== 'string' || expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  }

  _toolResult(value) {
    return {
      isError: false,
      content: [{ type: 'text', text: JSON.stringify(value) }]
    };
  }

  _toolError(message) {
    return {
      isError: true,
      content: [{ type: 'text', text: String(message) }]
    };
  }
}

module.exports = {
  MetaMcpAdapter,
  GRAPH_API_VERSION,
  AUTHORIZATION_ENDPOINT,
  REDIRECT_URI,
  REQUESTED_PERMISSIONS,
  isMetaAuthorizationRedirect,
  isAllowedMetaAuthorizationNavigation
};

function createMemoryCredentialStore() {
  const credentials = new Map();
  return {
    get(key) { return credentials.get(key) || null; },
    set(key, value) { credentials.set(key, value); },
    delete(key) { credentials.delete(key); }
  };
}
