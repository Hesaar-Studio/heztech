'use strict';

const TELEGRAM_API = 'https://api.telegram.org';

class TelegramBotAdapter {
  constructor({ fetchImpl = globalThis.fetch, credentialStore } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('A Fetch-compatible function is required.');
    if (!credentialStore || typeof credentialStore.get !== 'function' ||
        typeof credentialStore.set !== 'function' || typeof credentialStore.delete !== 'function') {
      throw new TypeError('An OS-backed credential store is required.');
    }
    this.fetchImpl = fetchImpl;
    this.credentialStore = credentialStore;
    this.capabilities = ['bot-verification', 'channel-administrator-verification', 'read-only'];
  }

  getStatus() {
    return { connected: Boolean(this.credentialStore.get('telegram')) };
  }

  async beginAuthorization(input) {
    const botToken = typeof input?.botToken === 'string' ? input.botToken.trim() : '';
    const channelId = typeof input?.channelId === 'string' ? input.channelId.trim() : '';
    if (!/^\d{6,15}:[A-Za-z0-9_-]{20,}$/.test(botToken)) {
      return { success: false, error: 'INVALID_TELEGRAM_BOT_TOKEN' };
    }
    if (channelId && !/^@?[A-Za-z0-9_]{5,64}$|^-?\d{5,20}$/.test(channelId)) {
      return { success: false, error: 'INVALID_TELEGRAM_CHANNEL_ID' };
    }

    try {
      const bot = await this._call(botToken, 'getMe');
      if (!bot?.is_bot || typeof bot.id !== 'number') {
        return { success: false, error: 'TELEGRAM_BOT_IDENTITY_INVALID' };
      }
      if (channelId) await this._verifyChannel(botToken, bot.id, channelId);
      this.credentialStore.set('telegram', { botToken, botId: bot.id, channelId });
      return {
        success: true,
        connected: true,
        bot: { id: bot.id, username: bot.username || '', firstName: bot.first_name || '' },
        channelVerified: Boolean(channelId)
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async verifyAccounts(input = {}) {
    const credentials = this.credentialStore.get('telegram');
    if (!credentials) return { success: false, error: 'TELEGRAM_NOT_CONNECTED' };
    try {
      const bot = await this._call(credentials.botToken, 'getMe');
      const channelId = typeof input.channelId === 'string' ? input.channelId.trim() : credentials.channelId;
      const channel = channelId
        ? await this._verifyChannel(credentials.botToken, bot.id, channelId)
        : null;
      return {
        success: true,
        bot: { id: bot.id, username: bot.username || '', firstName: bot.first_name || '' },
        channel: channel ? { id: channel.id, title: channel.title || '', type: channel.type } : null,
        verifiedAt: new Date().toISOString()
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  disconnect() {
    this.credentialStore.delete('telegram');
    return {
      success: true,
      connected: false,
      revocationRequired: true,
      message: 'Revoke the bot token with BotFather to invalidate it outside this device.'
    };
  }

  async _verifyChannel(token, botId, channelId) {
    const chat = await this._call(token, 'getChat', { chat_id: channelId });
    const membership = await this._call(token, 'getChatMember', { chat_id: channelId, user_id: botId });
    if (!['administrator', 'creator'].includes(membership.status)) {
      throw new Error('TELEGRAM_BOT_CHANNEL_ADMIN_REQUIRED');
    }
    return chat;
  }

  async _call(token, method, parameters = {}) {
    const response = await this.fetchImpl(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parameters),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
      redirect: 'error'
    });
    if (!response.ok) throw new Error('TELEGRAM_API_REQUEST_FAILED');
    const payload = await response.json();
    if (!payload?.ok || !payload.result || typeof payload.result !== 'object') {
      throw new Error(payload?.description ? 'TELEGRAM_API_REQUEST_FAILED' : 'TELEGRAM_API_RESPONSE_INVALID');
    }
    return payload.result;
  }
}

module.exports = { TelegramBotAdapter };