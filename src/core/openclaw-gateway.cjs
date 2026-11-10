'use strict';

/**
 * HezTech gateway client — main-process only.
 *
 * Implements the OpenClaw Gateway v4 wire protocol:
 *   socket open → `connect.challenge` event → signed `connect` request → `hello-ok`
 *
 * Device identity is an Ed25519 keypair kept in the app's user-data directory.
 * The signature payload is the documented v3 form:
 *   v3|deviceId|clientId|clientMode|role|scopes|signedAt|token|nonce|platform|deviceFamily
 * and the public key travels as unpadded base64url of the 32 raw key bytes.
 *
 * Nothing here guesses: a challenge that arrives is always answered, and a
 * transport failure is reported as a transport failure (never as "no gateway").
 */

const WebSocket = require('ws');
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PROTOCOL = 4;
const CONNECT_TIMEOUT_MS = 10000;
const CHALLENGE_TIMEOUT_MS = 15000;
const REQUEST_TIMEOUT_MS = 60000;
const RECONNECT_BASE_MS = 1200;
const RECONNECT_MAX_MS = 20000;

// The gateway accepts a closed set of client ids/modes (packages/gateway-protocol
// /src/client-info.ts) and the Control UI class additionally requires a browser
// Origin the gateway has allow-listed. HezTech connects from the desktop shell
// with no browser Origin, so it uses the generic operator client class.
const CLIENT_ID = process.env.HEZTECH_CLIENT_ID || 'cli';
const CLIENT_MODE = process.env.HEZTECH_CLIENT_MODE || 'cli';
const ROLE = 'operator';
const REQUESTED_SCOPES = ['operator.read', 'operator.write'];

const PLATFORM = { win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform] || 'linux';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function rawPublicKeyFromPem(publicKeyPem) {
  const der = Buffer.from(
    publicKeyPem.replace(/-----[^-]+-----/gu, '').replace(/\s+/gu, ''),
    'base64'
  );
  // Ed25519 SPKI: 12-byte prefix + 32 raw bytes
  return der.subarray(der.length - 32);
}

function loadOrCreateIdentity(userDataDir) {
  const file = path.join(userDataDir, 'device-identity.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (
      typeof parsed.deviceId === 'string' &&
      /^[a-f0-9]{64}$/u.test(parsed.deviceId) &&
      typeof parsed.publicKeyPem === 'string' &&
      typeof parsed.privateKeyPem === 'string'
    ) {
      return { ...parsed, file };
    }
  } catch {
    /* first run or unreadable — regenerate below */
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const deviceId = crypto.createHash('sha256').update(rawPublicKeyFromPem(publicKeyPem)).digest('hex');
  const identity = { deviceId, publicKeyPem, privateKeyPem, createdAt: new Date().toISOString() };
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(identity, null, 2), { mode: 0o600 });
  } catch (err) {
    // Keep working for this session even if the identity cannot be persisted.
  }
  return { ...identity, file };
}

function normalizeMetadata(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function buildDeviceAuthPayloadV3({ deviceId, clientId, clientMode, role, scopes, signedAtMs, token, nonce, platform, deviceFamily }) {
  return [
    'v3',
    deviceId,
    clientId,
    clientMode,
    role,
    scopes.join(','),
    String(signedAtMs),
    token || '',
    nonce,
    normalizeMetadata(platform),
    normalizeMetadata(deviceFamily)
  ].join('|');
}

/** Turn a connect failure frame into a stable, displayable classification. */
function classifyConnectError(frame) {
  const err = (frame && frame.error) || {};
  const details = err.details || {};
  const code = String(details.code || err.code || '').toUpperCase();
  const message = String(err.message || '');
  const reason = String(details.reason || '');

  if (code === 'PAIRING_REQUIRED' || code === 'NOT_PAIRED' || /not.?paired/iu.test(message)) {
    return {
      kind: 'pairing_required',
      code: code || 'PAIRING_REQUIRED',
      reason,
      message,
      details,
      retryable: false
    };
  }
  if (code === 'AUTH_TOKEN_MISMATCH' || code === 'AUTH_PASSWORD_MISMATCH' || /auth/iu.test(code)) {
    return {
      kind: 'auth_failed',
      code: code || 'AUTH_FAILED',
      reason,
      message,
      details,
      retryable: false
    };
  }
  if (code === 'AUTH_SCOPE_MISMATCH' || code === 'OPERATOR_ACCESS_DENIED') {
    return { kind: 'scope_denied', code, reason, message, details, retryable: false };
  }
  if (code === 'UNAVAILABLE' && reason === 'startup-sidecars') {
    return { kind: 'starting', code, reason, message, details, retryable: true };
  }
  if (code === 'DEVICE_AUTH_NONCE_REQUIRED' || code.startsWith('DEVICE_AUTH_')) {
    return { kind: 'device_auth_failed', code, reason, message, details, retryable: false };
  }
  return { kind: 'rejected', code: code || 'REJECTED', reason, message, details, retryable: false };
}

class GatewayClient extends EventEmitter {
  constructor({ userDataDir }) {
    super();
    this.userDataDir = userDataDir;
    this.identity = loadOrCreateIdentity(userDataDir);
    this.ws = null;
    this.state = 'idle';
    this.url = '';
    this.token = '';
    this.password = '';
    this.hello = null;
    this.pending = new Map();
    this.nextId = 1;
    this.challengeTimer = null;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.userClosed = false;
    this.counters = { expected: 0, unexpected: 0 };
    this.lastError = null;
  }

  status() {
    return {
      state: this.state,
      url: this.url,
      connected: this.state === 'connected',
      hello: this.hello,
      deviceId: this.identity.deviceId,
      counters: { ...this.counters },
      lastError: this.lastError,
      clientId: CLIENT_ID,
      platform: PLATFORM
    };
  }

  setState(state, extra = {}) {
    this.state = state;
    this.emit('state', { state, ...extra, status: this.status() });
  }

  connect({ url, token, password }) {
    this.disconnect();
    this.userClosed = false;
    this.terminal = false;
    this.url = String(url || '').trim();
    this.token = typeof token === 'string' ? token : '';
    this.password = typeof password === 'string' ? password : '';
    this.hello = null;
    this.lastError = null;
    this.open();
  }

  open() {
    this.clearTimers();
    try {
      if (this.ws) {
        this.ws.onopen = this.ws.onmessage = this.ws.onerror = this.ws.onclose = null;
        try { this.ws.close(); } catch { /* already gone */ }
      }
    } catch { /* ignore */ }

    this.setState(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting', {
      attempt: this.reconnectAttempt
    });

    let socket;
    try {
      socket = new WebSocket(this.url);
    } catch (err) {
      this.counters.unexpected += 1;
      this.lastError = {
        kind: 'invalid_url',
        message: err && err.message ? err.message : String(err),
        detail: 'url_parse'
      };
      this.setState('error', { error: this.lastError });
      return;
    }
    this.ws = socket;
    this.opened = false;
    const gen = (this.gen = (this.gen || 0) + 1);

    // Phase 1: reaching the socket. A refused connection surfaces as an
    // `error` event with no matching `close` on the WHATWG WebSocket, so this
    // timer is the backstop and `onerror` handles the common case.
    this.connectTimer = setTimeout(() => {
      if (this.opened) return;
      this.counters.unexpected += 1;
      this.lastError = {
        kind: 'connection_failed',
        message: 'Could not establish a connection to ' + this.url + '.',
        detail: 'connect_timeout'
      };
      this.setState('error', { error: this.lastError });
      try { socket.close(); } catch { /* ignore */ }
    }, CONNECT_TIMEOUT_MS);

    socket.onopen = () => {
      if (gen !== this.gen) return;
      this.opened = true;
      clearTimeout(this.connectTimer);
      this.setState('challenge', { detail: 'socket_open' });

      // Phase 2: the gateway must send connect.challenge before we can sign.
      // A challenge that arrives is always answered (see sendConnect); this
      // timer only fires when none arrives at all.
      this.challengeTimer = setTimeout(() => {
        if (this.state !== 'challenge') return;
        this.counters.unexpected += 1;
        this.lastError = {
          kind: 'handshake_timeout',
          message: 'The gateway accepted the socket but sent no connect.challenge within ' + CHALLENGE_TIMEOUT_MS + ' ms.',
          detail: 'challenge_timeout'
        };
        this.setState('error', { error: this.lastError });
        try { socket.close(); } catch { /* ignore */ }
      }, CHALLENGE_TIMEOUT_MS);
    };

    socket.onmessage = (ev) => {
      if (gen !== this.gen) return;
      let frame;
      try {
        frame = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
      } catch {
        this.counters.unexpected += 1;
        return;
      }
      this.handleFrame(frame);
    };

    socket.onerror = (ev) => {
      if (gen !== this.gen) return;
      // Before the socket opens, an error means the connection itself failed
      // (refused, DNS, TLS). The event carries no code, so the message stays
      // factual and the detail records what we do know.
      if (!this.opened) {
        clearTimeout(this.connectTimer);
        this.counters.unexpected += 1;
        const detailText = (ev && (ev.message || (ev.error && ev.error.message))) || 'ws_error_event';
        this.lastError = {
          kind: 'connection_failed',
          message: 'Could not establish a connection to ' + this.url + '.',
          detail: detailText
        };
        this.setState('error', { error: this.lastError });
        return;
      }
      this.emit('transport', {
        kind: 'transport_error',
        message: 'WebSocket reported an error after the socket opened.',
        detail: (ev && ev.message) || 'ws_error_event'
      });
    };

    socket.onclose = (ev) => {
      if (gen !== this.gen) return;
      this.clearTimers();
      if (this.terminal) return;
      const wasConnected = this.state === 'connected';
      if (this.userClosed) {
        this.setState('closed', { code: ev.code, reason: ev.reason });
        return;
      }
      if (this.state === 'error') {
        // Already classified; a trailing close frame adds nothing.
        return;
      }
      if (this.state === 'connected' || wasConnected) {
        this.counters.expected += 1;
        this.lastError = {
          kind: 'disconnected',
          message: 'Connection to the gateway was closed.',
          detail: 'close_code_' + ev.code,
          code: ev.code,
          reason: ev.reason || ''
        };
        this.scheduleReconnect();
        return;
      }
      // Never reached connected. 1006 means the transport failed without a
      // close frame — it does not prove that no gateway is listening.
      this.counters.unexpected += 1;
      this.lastError = {
        kind: 'connection_failed',
        message: 'Could not establish a connection to ' + this.url + '.',
        detail: 'close_code_' + ev.code + (ev.reason ? ' reason=' + ev.reason : ''),
        code: ev.code,
        reason: ev.reason || ''
      };
      this.setState('error', { error: this.lastError });
    };
  }

  handleFrame(frame) {
    if (!frame || typeof frame !== 'object') return;

    if (frame.type === 'event' && frame.event === 'connect.challenge') {
      this.sendConnect(frame.payload || {});
      return;
    }

    if (frame.type === 'res') {
      if (frame.id && this.pending.has(frame.id)) {
        const entry = this.pending.get(frame.id);
        this.pending.delete(frame.id);
        clearTimeout(entry.timer);
        if (frame.ok) entry.resolve(frame.payload);
        else entry.reject(frame.error || { code: 'UNKNOWN', message: 'Request failed' });
        return;
      }
      if (frame.id === this.connectId) {
        this.onConnectResult(frame);
      }
      return;
    }

    if (frame.type === 'event') {
      this.emit('gateway-event', { event: frame.event, payload: frame.payload });
    }
  }

  sendConnect(challenge) {
    clearTimeout(this.challengeTimer);
    this.setState('authenticating', { detail: 'challenge_received' });

    const ts = challenge && challenge.ts;
    const nonce = challenge && typeof challenge.nonce === 'string' ? challenge.nonce : '';
    if (!Number.isSafeInteger(ts) || ts < 0) {
      this.counters.unexpected += 1;
      this.lastError = {
        kind: 'invalid_challenge',
        message: 'connect.challenge arrived without a usable timestamp.',
        detail: 'challenge_ts_invalid'
      };
      this.setState('error', { error: this.lastError });
      try { this.ws.close(); } catch { /* ignore */ }
      return;
    }

    const scopes = [...REQUESTED_SCOPES];
    const payload = buildDeviceAuthPayloadV3({
      deviceId: this.identity.deviceId,
      clientId: CLIENT_ID,
      clientMode: CLIENT_MODE,
      role: ROLE,
      scopes,
      signedAtMs: ts,
      token: this.token || '',
      nonce,
      platform: PLATFORM,
      deviceFamily: 'desktop'
    });

    let signature;
    try {
      signature = b64url(
        crypto.sign(null, Buffer.from(payload, 'utf8'), crypto.createPrivateKey(this.identity.privateKeyPem))
      );
    } catch (err) {
      this.counters.unexpected += 1;
      this.lastError = { kind: 'sign_failed', message: String(err.message || err), detail: 'sign' };
      this.setState('error', { error: this.lastError });
      return;
    }

    const auth = {};
    if (this.token) auth.token = this.token;
    if (this.password) auth.password = this.password;

    this.connectId = 'c' + this.nextId++;
    const frame = {
      type: 'req',
      id: this.connectId,
      method: 'connect',
      params: {
        minProtocol: PROTOCOL,
        maxProtocol: PROTOCOL,
        client: {
          id: CLIENT_ID,
          version: '0.1.0',
          platform: PLATFORM,
          deviceFamily: 'desktop',
          mode: CLIENT_MODE
        },
        role: ROLE,
        scopes,
        caps: [],
        commands: [],
        permissions: {},
        auth,
        locale: 'fa-IR',
        userAgent: 'heztech-desktop/0.1.0',
        device: {
          id: this.identity.deviceId,
          publicKey: b64url(rawPublicKeyFromPem(this.identity.publicKeyPem)),
          signature,
          signedAt: ts,
          nonce
        }
      }
    };

    try {
      this.ws.send(JSON.stringify(frame));
    } catch (err) {
      this.counters.unexpected += 1;
      this.lastError = { kind: 'send_failed', message: String(err.message || err), detail: 'connect_send' };
      this.setState('error', { error: this.lastError });
    }
  }

  onConnectResult(frame) {
    if (frame.ok) {
      this.reconnectAttempt = 0;
      const hello = frame.payload || {};
      this.hello = { server: hello.server, features: hello.features, auth: { role: hello.auth?.role, scopes: hello.auth?.scopes } }; // Never forward deviceToken to renderer.
      this.lastError = null;
      this.setState('connected', { hello: this.hello });
      return;
    }
    const classified = classifyConnectError(frame);
    if (classified.retryable) this.counters.expected += 1;
    else this.counters.expected += 1;
    this.lastError = classified;
    this.setState(classified.kind === 'pairing_required' ? 'pairing' : 'error', { error: classified });
    if (!classified.retryable) {
      // Terminal: keep the classified error visible; the trailing close frame
      // must not overwrite it with a generic "closed".
      this.terminal = true;
      this.userClosed = true;
      try { this.ws.close(); } catch { /* ignore */ }
    } else {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.userClosed) return;
    this.reconnectAttempt += 1;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (this.reconnectAttempt - 1), RECONNECT_MAX_MS);
    this.setState('reconnecting', { attempt: this.reconnectAttempt, retryInMs: delay });
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (!this.userClosed) this.open();
    }, delay);
  }

  clearTimers() {
    clearTimeout(this.connectTimer);
    clearTimeout(this.challengeTimer);
    this.connectTimer = null;
    this.challengeTimer = null;
  }

  request(method, params, timeoutMs = REQUEST_TIMEOUT_MS) {
    if (!this.ws || this.state !== 'connected') {
      return Promise.reject({ code: 'NOT_CONNECTED', message: 'Not connected to the gateway.' });
    }
    const id = 'r' + this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject({ code: 'TIMEOUT', message: 'No response for ' + method + ' within ' + timeoutMs + ' ms.' });
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      try {
        this.ws.send(JSON.stringify({ type: 'req', id, method, params: params || {} }));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject({ code: 'SEND_FAILED', message: String(err.message || err) });
      }
    });
  }

  disconnect() {
    this.userClosed = true;
    this.terminal = false;
    this.reconnectAttempt = 0;
    clearTimeout(this.reconnectTimer);
    this.clearTimers();
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject({ code: 'CANCELLED', message: 'Connection closed by the user.' });
    }
    this.pending.clear();
    if (this.ws) {
      try { this.ws.close(1000, 'client disconnect'); } catch { /* ignore */ }
    }
    this.token = '';
    this.password = '';
    this.hello = null;
    this.setState('closed');
  }
}

module.exports = { GatewayClient, classifyConnectError, CLIENT_ID };
