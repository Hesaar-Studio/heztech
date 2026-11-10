'use strict';

const IDENTITY = require('./identity');

const API_BASE_URL = 'http://127.0.0.1:8000';
const CHAT_ENDPOINT = `${API_BASE_URL}/v1/chat/completions`;

const ROLE_HINTS = Object.freeze({
  research: 'پژوهش و بررسی شواهد',
  strategy: 'راهبرد و تصمیم‌گیری',
  operations: 'عملیات و پایداری',
  analytics: 'تحلیل داده و معماری',
  risk: 'امنیت و ارزیابی ریسک',
  knowledge: 'سازمان‌دهی دانش',
  architect: 'معماری',
  engineer: 'مهندسی نرم‌افزار',
  security: 'امنیت',
  devops: 'عملیات',
  critic: 'نقد',
  judge: 'داوری'
});

function normalizeModel(modelName) {
  if (!modelName) return 'openclaw-default';
  const m = String(modelName).trim().toLowerCase();
  if (['openclaw', 'openclaw-main', 'openclaw-default', 'heztech-local', 'ai_models', 'ai', 'master', 'default', 'analytics', 'research'].includes(m)) {
    return 'openclaw-default';
  }
  return modelName;
}

class OpenClawChat {
  constructor({ profileDir, safeStorage, client, fetchImpl = globalThis.fetch } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('A Fetch-compatible function is required.');
    this.profileDir = profileDir;
    this.safeStorage = safeStorage;
    this.fetchImpl = fetchImpl;
    this.modelStates = new Map();
  }

  status(model = 'openclaw-default') {
    const current = this.modelStates.get(normalizeModel(model)) || { connected: false, verified: false, error: null };
    return {
      ...current,
      state: current.connected ? 'connected' : 'disconnected'
    };
  }

  async listModels() {
      const response = await this.fetchImpl(`${API_BASE_URL}/v1/models`, {
        headers: { Authorization: 'Bearer local-gateway' },
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) throw new Error(`Local gateway HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.data)) throw new Error('Invalid gateway model list');
      return data.data.filter(model => typeof model.id === 'string' && model.id);
  }

  async connect() {
    try {
      await this.listModels();
      this.modelStates.set('openclaw-default', { ...this.status(), connected: true, error: null });
    } catch (error) {
      this.modelStates.clear();
      this.modelStates.set('openclaw-default', { connected: false, verified: false, error: error.message });
      throw error;
    }
    return this.status();
  }

  async ask({ message, conversationId, model = 'openclaw-default', agentId, signal, onToken, history = [], timeoutMs = 120000 }) {
    signal?.throwIfAborted();
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    const targetModel = normalizeModel(model);

    try {
      // Use the configured local OpenAI-compatible gateway. Provider credentials
      // remain owned by the gateway and never enter the desktop process.
      const systemPrompt = IDENTITY.assistantPrompt();

      const outboundMessages = [
        { role: 'system', content: systemPrompt }
      ];

      // Append sanitized recent history if available
      if (Array.isArray(history) && history.length > 0) {
        for (const h of IDENTITY.sanitizeHistory(history).slice(-6)) {
          if (h && h.content && typeof h.content === 'string') {
            outboundMessages.push({
              role: h.role === 'assistant' ? 'assistant' : 'user',
              content: h.content
            });
          }
        }
      }

      // Add current user message
      outboundMessages.push({ role: 'user', content: message });

      const response = await this.fetchImpl(CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer local-gateway'
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: targetModel,
          messages: outboundMessages,
          stream: true
        })
      });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail || data.error || '');
          throw new Error(`Local gateway HTTP ${response.status}: ${detail.slice(0, 500)}`);
        }

        let data;
        let reply;
        const contentType = response.headers?.get?.('content-type') || '';
        if (contentType.toLowerCase().includes('text/event-stream')) {
          reply = await this._readEventStream(response, onToken, controller.signal);
          data = {};
        } else {
          data = await response.json();
          reply = data?.choices?.[0]?.message?.content;
          if (reply && typeof onToken === 'function') onToken(reply);
        }

        if (typeof reply === 'string' && reply.trim() &&
            !reply.startsWith('⚠️ گیت‌وی تلاش کرد به سرویس‌ها وصل شود اما خطاهای زیر رخ داد')) {
          this.modelStates.set(targetModel, { verified: true, connected: true, error: null });
          return {
            reply,
            model: data?.model || targetModel,
            provider: data?.provider || 'local-gateway',
            agentId: agentId || targetModel,
            latencyMs: Date.now() - startedAt
          };
        }
      throw new Error('Local gateway returned no valid response.');
    } catch (err) {
      if (err.name === 'AbortError' || signal?.aborted || controller.signal.aborted) {
        throw new Error('درخواست به دلیل پایان مهلت زمانی یا لغو دستی متوقف شد.');
      }
      this.modelStates.set(targetModel, { verified: false, connected: false, error: err.message });
      throw err;
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async _readEventStream(response, onToken, signal) {
    if (!response.body || typeof response.body.getReader !== 'function') {
      throw new Error('Local gateway returned an unreadable event stream.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let reply = '';
    let finished = false;

    const processLine = line => {
      if (!line.startsWith('data:')) return;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') {
        if (data === '[DONE]') finished = true;
        return;
      }

      let payload;
      try {
        payload = JSON.parse(data);
      } catch {
        throw new Error('Local gateway returned an invalid event stream.');
      }

      const content = payload?.choices?.[0]?.delta?.content;
      const text = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map(part => typeof part?.text === 'string' ? part.text : '').join('')
          : '';
      if (text) {
        reply += text;
        onToken?.(text);
      }
    };

    try {
      while (!finished) {
        signal.throwIfAborted();
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) processLine(line);
        if (done) break;
      }
      if (buffer) processLine(buffer);
      return reply;
    } finally {
      reader.releaseLock();
    }
  }

  close() {
    this.modelStates.clear();
  }
}

module.exports = { OpenClawChat, ROLE_HINTS, normalizeModel };
