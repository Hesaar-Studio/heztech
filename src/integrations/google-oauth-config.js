'use strict';

const crypto = require('node:crypto');
const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const REDIRECT_ORIGIN = 'http://127.0.0.1';
const GOOGLE_SCOPE_GROUPS = Object.freeze({
  youtube: Object.freeze(['https://www.googleapis.com/auth/youtube.readonly']),
  youtubeUpload: Object.freeze(['https://www.googleapis.com/auth/youtube.upload']),
  analytics: Object.freeze(['https://www.googleapis.com/auth/analytics.readonly']),
  searchConsole: Object.freeze(['https://www.googleapis.com/auth/webmasters.readonly'])
});

function createGoogleAuthorization({ clientId, port, groups, now = Date.now } = {}) {
  if (typeof clientId !== 'string' || !/^[^@\s]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    return { success: false, error: 'INVALID_GOOGLE_CLIENT_ID' };
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return { success: false, error: 'INVALID_GOOGLE_LOOPBACK_PORT' };
  }
  if (!Array.isArray(groups) || !groups.length ||
      groups.some(group => !Object.hasOwn(GOOGLE_SCOPE_GROUPS, group))) {
    return { success: false, error: 'INVALID_GOOGLE_SCOPE_GROUP' };
  }

  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(32).toString('base64url');
  const redirectUri = `${REDIRECT_ORIGIN}:${port}/oauth2callback`;
  const scopes = [...new Set(groups.flatMap(group => GOOGLE_SCOPE_GROUPS[group]))];
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent');
  return {
    success: true,
    authorizationUrl: url.toString(),
    state,
    verifier,
    redirectUri,
    scopes,
    expiresAt: now() + 180_000
  };
}

function isGoogleLoopbackRedirect(value, expectedPort) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' &&
      url.port === String(expectedPort) && url.pathname === '/oauth2callback' &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}

module.exports = {
  AUTHORIZATION_ENDPOINT,
  GOOGLE_SCOPE_GROUPS,
  createGoogleAuthorization,
  isGoogleLoopbackRedirect
};