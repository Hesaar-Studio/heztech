'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MetaMcpAdapter,
  GRAPH_API_VERSION,
  REDIRECT_URI,
  isAllowedMetaAuthorizationNavigation
} = require('../src/integrations/meta-mcp-adapter');

function authorize(adapter, appId = '1234567890', token = 'mock-access-token') {
  const started = adapter.beginAuthorization(appId);
  assert.equal(started.success, true);
  const authUrl = new URL(started.authorizationUrl);
  const state = authUrl.searchParams.get('state');
  const redirect = new URL(REDIRECT_URI);
  redirect.hash = new URLSearchParams({
    access_token: token,
    expires_in: '3600',
    granted_scopes: 'public_profile,pages_show_list,pages_read_engagement,instagram_basic',
    state
  }).toString();
  return { started, authUrl, redirect };
}

test('authorization is owner-started and requests only read permissions', () => {
  const adapter = new MetaMcpAdapter({ fetchImpl: async () => { throw new Error('unexpected network'); } });
  assert.equal(adapter.beginAuthorization('not-an-app-id').error, 'INVALID_META_APP_ID');

  const { authUrl } = authorize(adapter);
  assert.equal(authUrl.origin, 'https://www.facebook.com');
  assert.equal(authUrl.pathname, `/${GRAPH_API_VERSION}/dialog/oauth`);
  assert.equal(authUrl.searchParams.get('response_type'), 'token,granted_scopes');
  assert.equal(authUrl.searchParams.get('redirect_uri'), REDIRECT_URI);
  assert.equal(authUrl.searchParams.get('scope'), 'public_profile,pages_show_list,pages_read_engagement,instagram_basic');
  assert.equal(adapter.getConnectionStatus().connected, false);
});

test('authorization callback validates origin and state without exposing token', () => {
  const adapter = new MetaMcpAdapter();
  const { redirect } = authorize(adapter, '1234567890', 'mock-secret-token');
  const malicious = new URL(redirect);
  malicious.hostname = 'evil.example';
  assert.equal(adapter.completeAuthorization(malicious.toString()).success, false);
  assert.equal(adapter.getConnectionStatus().connected, false);

  const { redirect: validRedirect } = authorize(adapter, '1234567890', 'mock-secret-token');
  const wrongState = new URL(validRedirect);
  const fragment = new URLSearchParams(wrongState.hash.slice(1));
  fragment.set('state', 'wrong-state');
  wrongState.hash = fragment.toString();
  assert.equal(adapter.completeAuthorization(wrongState.toString()).error, 'META_AUTHORIZATION_STATE_MISMATCH');

  const { redirect: validRetry } = authorize(adapter, '1234567890', 'mock-secret-token');
  assert.deepEqual(adapter.completeAuthorization(validRetry.toString()), { success: true, connected: true });
  const visibleStatus = JSON.stringify(adapter.getConnectionStatus());
  assert.equal(visibleStatus.includes('mock-secret-token'), false);
});

test('Meta credentials survive adapter recreation using injected secure storage and are revoked on disconnect', async () => {
  const credentials = new Map();
  const credentialStore = {
    get: key => credentials.get(key) || null,
    set: (key, value) => credentials.set(key, value),
    delete: key => credentials.delete(key)
  };
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    return { ok: true, json: async () => ({ data: [] }) };
  };
  const first = new MetaMcpAdapter({ credentialStore, fetchImpl });
  const { redirect } = authorize(first);
  assert.equal(first.completeAuthorization(redirect.toString()).success, true);

  const restored = new MetaMcpAdapter({ credentialStore, fetchImpl });
  assert.equal(restored.getConnectionStatus().connected, true);
  const disconnected = await restored.disconnect();
  assert.equal(disconnected.revoked, true);
  assert.equal(restored.getConnectionStatus().connected, false);
  assert.equal(credentials.has('meta'), false);
  assert.equal(requests[0].options.method, 'DELETE');
  assert.equal(requests[0].url, `https://graph.facebook.com/${GRAPH_API_VERSION}/me/permissions`);
});

test('Meta authorization rejects unrequested scopes and navigation userinfo', () => {
  const adapter = new MetaMcpAdapter();
  const { redirect } = authorize(adapter);
  const expanded = new URL(redirect);
  const fragment = new URLSearchParams(expanded.hash.slice(1));
  fragment.set('granted_scopes', 'public_profile,instagram_content_publish');
  expanded.hash = fragment.toString();
  assert.equal(adapter.completeAuthorization(expanded.toString()).error, 'UNREQUESTED_META_PERMISSION_GRANTED');
  assert.equal(adapter.getConnectionStatus().connected, false);
  assert.equal(isAllowedMetaAuthorizationNavigation('https://attacker@facebook.com/login'), false);
});

test('starting a reauthorization preserves the existing token until user approval completes', () => {
  const adapter = new MetaMcpAdapter();
  const { redirect } = authorize(adapter);
  assert.equal(adapter.completeAuthorization(redirect.toString()).success, true);
  assert.equal(adapter.beginAuthorization('1234567890').success, true);
  assert.equal(adapter.getConnectionStatus().connected, true);
  adapter.cancelAuthorization();
  assert.equal(adapter.getConnectionStatus().connected, true);
});

test('account verification makes read-only Graph calls with bearer auth and returns sanitized fields', async () => {
  const requests = [];
  const adapter = new MetaMcpAdapter({
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      if (requests.length === 1) {
        return { ok: true, json: async () => ({ id: 'fb-id', name: 'Test Owner', access_token: 'must-not-return' }) };
      }
      return {
        ok: true,
        json: async () => ({
          data: [{
            id: 'page-id',
            name: 'Test Page',
            access_token: 'must-not-return',
            instagram_business_account: { id: 'ig-id', username: 'test-account', access_token: 'must-not-return' }
          }],
          paging: { next: 'https://graph.facebook.com/next?access_token=must-not-follow' }
        })
      };
    }
  });
  const { redirect } = authorize(adapter);
  assert.deepEqual(adapter.completeAuthorization(redirect.toString()), { success: true, connected: true });
  const result = await adapter.verifyAccounts();

  assert.equal(result.success, true);
  assert.equal(result.facebookAccount.name, 'Test Owner');
  assert.deepEqual(result.pages, [{
    id: 'page-id',
    name: 'Test Page',
    instagramAccount: { id: 'ig-id', username: 'test-account' }
  }]);
  assert.equal(result.hasMorePages, true);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url.host, 'graph.facebook.com');
    assert.equal(request.url.pathname.startsWith(`/${GRAPH_API_VERSION}/`), true);
    assert.equal(request.url.searchParams.has('access_token'), false);
    assert.equal(request.options.headers.Authorization, 'Bearer mock-access-token');
  }
  assert.equal(JSON.stringify(result).includes('must-not-return'), false);
  assert.equal(JSON.stringify(result).includes('mock-access-token'), false);
});

test('verification is offline and fails closed before authorization', async () => {
  let requestCount = 0;
  const adapter = new MetaMcpAdapter({ fetchImpl: async () => { requestCount += 1; } });
  assert.deepEqual(await adapter.verifyAccounts(), { success: false, error: 'META_NOT_CONNECTED' });
  assert.equal(requestCount, 0);
  assert.deepEqual(adapter.getConnectionStatus().availableTools, [
    'meta_connection_status',
    'meta_verify_accounts'
  ]);
});

test('expired authorization clears the in-memory token', () => {
  let now = 1000;
  const adapter = new MetaMcpAdapter({ now: () => now });
  const { redirect } = authorize(adapter);
  assert.equal(adapter.completeAuthorization(redirect.toString()).success, true);
  now += 3_600_001;
  assert.equal(adapter.getConnectionStatus().connected, false);
  assert.deepEqual(adapter.getConnectionStatus().grantedPermissions, []);
});

test('MCP tool surface rejects unknown and write-capable operations', async () => {
  const adapter = new MetaMcpAdapter();
  for (const name of [
    'meta_publish_post',
    'meta_delete_post',
    'meta_schedule_post',
    'meta_send_message'
  ]) {
    const result = await adapter.callTool(name, {});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /not enabled/i);
  }
  assert.deepEqual(adapter.listTools().map(tool => tool.name), [
    'meta_connection_status',
    'meta_verify_accounts'
  ]);
});

test('authorization window navigation is restricted to Meta HTTPS origins', () => {
  assert.equal(isAllowedMetaAuthorizationNavigation('https://www.facebook.com/login'), true);
  assert.equal(isAllowedMetaAuthorizationNavigation('https://www.instagram.com/'), true);
  assert.equal(isAllowedMetaAuthorizationNavigation(REDIRECT_URI), true);
  assert.equal(isAllowedMetaAuthorizationNavigation('http://www.facebook.com/'), false);
  assert.equal(isAllowedMetaAuthorizationNavigation('https://evil.example/'), false);
});
