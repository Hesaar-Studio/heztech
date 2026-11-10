'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  createGoogleAuthorization,
  isGoogleLoopbackRedirect
} = require('../src/integrations/google-oauth-config');

test('Google OAuth preparation uses authorization code and S256 PKCE with minimal requested scopes', () => {
  const result = createGoogleAuthorization({
    clientId: 'heztech.apps.googleusercontent.com',
    port: 43210,
    groups: ['youtube', 'analytics']
  });
  assert.equal(result.success, true);
  const url = new URL(result.authorizationUrl);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), crypto.createHash('sha256').update(result.verifier).digest('base64url'));
  assert.deepEqual(result.scopes, [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/analytics.readonly'
  ]);
  assert.equal(url.searchParams.get('client_secret'), null);
});

test('Google OAuth configuration rejects invalid client IDs, ports, and scope requests', () => {
  assert.equal(createGoogleAuthorization({ clientId: 'invalid', port: 43210, groups: ['youtube'] }).success, false);
  assert.equal(createGoogleAuthorization({ clientId: 'heztech.apps.googleusercontent.com', port: 80, groups: ['youtube'] }).success, false);
  assert.equal(createGoogleAuthorization({ clientId: 'heztech.apps.googleusercontent.com', port: 43210, groups: ['email'] }).success, false);
  assert.equal(isGoogleLoopbackRedirect('http://127.0.0.1:43210/oauth2callback', 43210), true);
  assert.equal(isGoogleLoopbackRedirect('http://localhost:43210/oauth2callback', 43210), false);
  assert.equal(isGoogleLoopbackRedirect('http://127.0.0.1:43211/oauth2callback', 43210), false);
});