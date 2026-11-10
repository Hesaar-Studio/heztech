'use strict';

/**
 * Unified multi-provider model adapter for ARTA.
 *
 * One contract for every provider, so the chat does not care whether an answer
 * comes from Google, an OpenAI-compatible endpoint, Anthropic or the local
 * runtime:
 *
 *   chat({ messages, mode, preferred }) -> { ok, reply, provider, model, latencyMs, attempts }
 *
 * Guarantees the owner asked for:
 * - OFFLINE never touches a cloud provider.
 * - ONLINE only uses cloud providers.
 * - AUTO prefers healthy cloud providers, then falls back to local inference.
 * - A provider that failed a health check is skipped until the cache expires,
 *   so an invalid key is never retried on every message.
 */

const ConfigManager = require('./config');

const MODE = Object.freeze({ OFFLINE: 'offline', ONLINE: 'online', AUTO: 'auto' });
const DEFAULT_HEALTH_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 25000;

function trimBase(value) {
  return String(value || '').replace(/\/+$/, '');
}

function splitMessages(messages) {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const turns = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '')
  }));
  return { system, turns };
}

class ModelRouter {
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.now = options.now || (() => Date.now());
    this.healthTtlMs = options.healthTtlMs || DEFAULT_HEALTH_TTL_MS;
    this.credentials = options.credentials || null;
    this.healthCache = new Map();
  }

  providers() {
    if (this.credentials) return this.credentials;

    const cfg = ConfigManager.load() || {};
    // The stored key may be DPAPI-encrypted; never send the ciphertext to a provider.
    const geminiKey = typeof ConfigManager.getDecryptedApiKey === 'function'
      ? (ConfigManager.getDecryptedApiKey() || cfg.geminiApiKey)
      : cfg.geminiApiKey;
    const env = process.env;
    const list = [];

    if (geminiKey && !String(geminiKey).startsWith('dpapi:')) {
      list.push({
        id: 'gemini',
        label: 'Google Gemini',
        kind: 'gemini',
        base: 'https://generativelanguage.googleapis.com',
        key: String(geminiKey),
        model: env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
        cloud: true
      });
    }
    if (env.OPENAI_API_KEY) {
      list.push({
        id: 'openai',
        label: 'OpenAI-compatible',
        kind: 'openai',
        base: trimBase(env.OPENAI_BASE_URL || env.AI_GATEWAY_URL || 'https://api.openai.com/v1'),
        key: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL || '',
        cloud: true
      });
    }
    if (env.ANTHROPIC_API_KEY) {
      list.push({
        id: 'anthropic',
        label: 'Anthropic',
        kind: 'anthropic',
        base: trimBase(env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'),
        key: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_MODEL || '',
        cloud: true
      });
    }

    // Local runtime is always available as the offline floor.
    list.push({
      id: 'local',
      label: 'Local runtime',
      kind: 'openai',
      base: `${trimBase(cfg.openclawUrl || 'http://127.0.0.1:8000')}/v1`,
      key: env.OPENCLAW_GATEWAY_TOKEN || '',
      model: env.LOCAL_MODEL || '',
      cloud: false
    });

    return list;
  }

  _cacheGet(providerId) {
    const entry = this.healthCache.get(providerId);
    if (!entry) return null;
    if (this.now() - entry.at > this.healthTtlMs) {
      this.healthCache.delete(providerId);
      return null;
    }
    return entry;
  }

  async health(provider, { useCache = true } = {}) {
    if (useCache) {
      const cached = this._cacheGet(provider.id);
      if (cached) return cached;
    }

    const record = async (ok, error, models) => {
      const entry = { id: provider.id, ok, error: error || null, models: models || [], at: this.now() };
      this.healthCache.set(provider.id, entry);
      return entry;
    };

    try {
      let url;
      const headers = {};
      if (provider.kind === 'gemini') {
        url = `${provider.base}/v1beta/models?key=${encodeURIComponent(provider.key)}&pageSize=20`;
      } else if (provider.kind === 'anthropic') {
        url = `${provider.base}/v1/models`;
        headers['x-api-key'] = provider.key;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        url = `${provider.base}/models`;
        if (provider.key) headers.Authorization = `Bearer ${provider.key}`;
      }

      const res = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.text();
          if (body) detail = body.replace(/\s+/g, ' ').slice(0, 180);
        } catch (e) {}
        return record(false, detail, []);
      }

      let models = [];
      try {
        const data = await res.json();
        if (Array.isArray(data.data)) models = data.data.map(m => m.id).filter(Boolean);
        else if (Array.isArray(data.models)) models = data.models.map(m => String(m.name || '').replace('models/', '')).filter(Boolean);
      } catch (e) {}

      return record(true, null, models);
    } catch (err) {
      return record(false, err.message, []);
    }
  }

  async _discoverModel(provider) {
    if (provider.model) return provider.model;
    const health = await this.health(provider);
    const usable = (health.models || []).filter(id => !/embedding|embed|tts|image|audio|live|native-audio/i.test(id));
    return usable[0] || '';
  }

  _timeout(ms) {
    return AbortSignal.timeout(ms);
  }

  async _call(provider, model, messages, timeoutMs) {
    const { system, turns } = splitMessages(messages);

    if (provider.kind === 'gemini') {
      const contents = turns.map(t => ({
        role: t.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: t.content }]
      }));
      const body = { contents };
      if (system) body.systemInstruction = { parts: [{ text: system }] };

      const res = await this.fetchImpl(
        `${provider.base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(provider.key)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: this._timeout(timeoutMs) }
      );
      const text = await res.text();
      if (!res.ok) throw new Error(text.replace(/\s+/g, ' ').slice(0, 200));
      const data = JSON.parse(text);
      const reply = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
      if (!reply) throw new Error('EMPTY_PROVIDER_RESPONSE');
      return reply;
    }

    if (provider.kind === 'anthropic') {
      const body = {
        model,
        max_tokens: 1024,
        messages: turns.map(t => ({ role: t.role, content: t.content }))
      };
      if (system) body.system = system;
      const res = await this.fetchImpl(`${provider.base}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': provider.key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body),
        signal: this._timeout(timeoutMs)
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text.replace(/\s+/g, ' ').slice(0, 200));
      const data = JSON.parse(text);
      const reply = (data.content || []).map(p => p.text || '').join('').trim();
      if (!reply) throw new Error('EMPTY_PROVIDER_RESPONSE');
      return reply;
    }

    // OpenAI-compatible (cloud or local runtime)
    const headers = { 'Content-Type': 'application/json' };
    if (provider.key) headers.Authorization = `Bearer ${provider.key}`;
    const res = await this.fetchImpl(`${provider.base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages: messages.map(m => ({ role: m.role, content: m.content })), stream: false }),
      signal: this._timeout(timeoutMs)
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text.replace(/\s+/g, ' ').slice(0, 200));
    const data = JSON.parse(text);
    const reply = String(data.choices?.[0]?.message?.content || '').trim();
    if (!reply) throw new Error('EMPTY_PROVIDER_RESPONSE');
    return reply;
  }

  orderProviders(mode, preferred = []) {
    const all = this.providers();
    let allowed;
    if (mode === MODE.OFFLINE) allowed = all.filter(p => !p.cloud);
    else if (mode === MODE.ONLINE) allowed = all.filter(p => p.cloud);
    else allowed = all;

    if (!preferred.length) return allowed;
    const rank = id => {
      const index = preferred.indexOf(id);
      return index === -1 ? preferred.length : index;
    };
    return allowed.slice().sort((a, b) => rank(a.id) - rank(b.id));
  }

  /**
   * @returns {Promise<{ok:boolean, reply?:string, provider?:string, model?:string,
   *   latencyMs?:number, attempts:Array, error?:string}>}
   */
  async chat({ messages, mode = MODE.AUTO, preferred = [], modelByProvider = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('MESSAGES_REQUIRED');
    }
    const effectiveMode = Object.values(MODE).includes(mode) ? mode : MODE.AUTO;
    const attempts = [];

    for (const provider of this.orderProviders(effectiveMode, preferred)) {
      const health = await this.health(provider);
      if (!health.ok) {
        attempts.push({ provider: provider.id, ok: false, skipped: true, error: health.error });
        continue;
      }

      const model = modelByProvider[provider.id] || provider.model || (await this._discoverModel(provider));
      if (!model) {
        attempts.push({ provider: provider.id, ok: false, skipped: true, error: 'NO_MODEL' });
        continue;
      }

      const startedAt = this.now();
      try {
        const reply = await this._call(provider, model, messages, timeoutMs);
        return {
          ok: true,
          reply,
          provider: provider.id,
          providerLabel: provider.label,
          model,
          latencyMs: this.now() - startedAt,
          mode: effectiveMode,
          attempts: attempts.concat([{ provider: provider.id, model, ok: true, latencyMs: this.now() - startedAt }])
        };
      } catch (err) {
        attempts.push({ provider: provider.id, model, ok: false, error: err.message.slice(0, 200) });
      }
    }

    return { ok: false, error: 'NO_PROVIDER_AVAILABLE', mode: effectiveMode, attempts };
  }

  status() {
    return this.providers().map(p => {
      const cached = this._cacheGet(p.id);
      return {
        id: p.id,
        label: p.label,
        cloud: p.cloud,
        configured: Boolean(p.key) || p.id === 'local',
        model: p.model || null,
        health: cached ? (cached.ok ? 'ok' : 'failed') : 'unknown',
        error: cached ? cached.error : null,
        checkedAt: cached ? new Date(cached.at).toISOString() : null
      };
    });
  }
}

module.exports = { ModelRouter, MODE, DEFAULT_HEALTH_TTL_MS };
