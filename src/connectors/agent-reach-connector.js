/**
 * ARTA / HezTech — Agent-Reach Connector
 *
 * Integrates the Agent-Reach CLI (v1.6.1, MIT License, github.com/Panniantong/Agent-Reach)
 * into ARTA's existing tool execution and Council research paths.
 *
 * SECURITY CONTRACT:
 *  - Read-only: no account credentials, no browser cookies, no personal sessions.
 *  - Only verified public channels are enabled: web, github (public API), youtube.
 *  - Login-required channels (twitter, reddit, xiaohongshu, etc.) are DISABLED
 *    pending a separate security review.
 *  - All subprocess calls run with a strict timeout and no shell injection.
 *  - The existing Social Media page and OAuth provider adapters are untouched.
 *  - This connector does NOT modify global OpenClaw configuration.
 *
 * VERIFIED IDENTITY (confirmed 2026-11-05):
 *  Binary: C:\Users\Green\.local\bin\agent-reach.exe
 *  Version: 1.6.1 (uv tool install from GitHub release ZIP)
 *  License: MIT — Copyright (c) 2025 Agent Eyes
 *  Channels passing health check: web (exa + jina), github (public API), youtube (yt-dlp)
 *  Channels DISABLED here: v2ex (SSL expired), bilibili (login needed for read),
 *                          twitter/reddit/instagram (login-required, not added)
 */

'use strict';

const { execFile } = require('child_process');
const path = require('path');

// Absolute path to the installed binary — no PATH dependency.
const AGENT_REACH_BIN = path.join(
  process.env.USERPROFILE || 'C:\\Users\\Green',
  '.local', 'bin', 'agent-reach.exe'
);

// Maximum time (ms) we allow any agent-reach subprocess to run.
const DEFAULT_TIMEOUT_MS = 30000;

// Channels we allow ARTA to invoke. Must be in this exact allow-list.
const ALLOWED_CHANNELS = new Set(['web', 'github', 'youtube']);

// Actions we allow per channel (defense-in-depth against future expansions).
const CHANNEL_ACTION_ALLOWLIST = {
  web:     new Set(['search', 'read']),
  github:  new Set(['search', 'read']),
  youtube: new Set(['search', 'read', 'subtitle']),
};

/**
 * Run an agent-reach CLI command safely.
 * @param {string[]} args   e.g. ['web', 'search', 'روانشناسی']
 * @param {number}   timeout
 * @returns {Promise<object>}  parsed JSON from agent-reach stdout
 */
function runAgentReach(args, timeout = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    // Validate every argument is a plain string — no shell metacharacters.
    for (const arg of args) {
      if (typeof arg !== 'string') {
        return reject(new Error(`آرگومان نامعتبر agent-reach: ${JSON.stringify(arg)}`));
      }
      // Block dangerous shell metacharacters (preserve safe URL characters like ? and =)
      if (/[`$;&|><(){}!*]/.test(arg)) {
        return reject(new Error(`آرگومان حاوی کاراکتر غیرمجاز شل است: ${arg}`));
      }
    }

    execFile(
      AGENT_REACH_BIN,
      args,
      { timeout, windowsHide: true, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          return reject(new Error(
            `agent-reach خطا: ${(stderr || err.message || 'خروجی ناموجود').trim().slice(0, 300)}`
          ));
        }

        const raw = (stdout || '').trim();
        if (!raw) {
          return reject(new Error('agent-reach هیچ خروجی JSON برنگرداند.'));
        }

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (parseErr) {
          return reject(new Error(`خطای تجزیه JSON خروجی agent-reach: ${parseErr.message}`));
        }

        resolve(parsed);
      }
    );
  });
}

class AgentReachConnector {
  constructor() {
    this._lastHealthCheck = null;
    this._healthCache = null;
    this._healthCacheTtlMs = 5 * 60 * 1000; // 5-minute cache
  }

  // ─────────────────────────────────────────────
  // Health & Status
  // ─────────────────────────────────────────────

  /**
   * Returns live health status of each allowed channel.
   * Results are cached for 5 minutes to avoid hammering the CLI.
   */
  async healthCheck(force = false) {
    const now = Date.now();
    if (!force && this._healthCache && (now - this._lastHealthCheck) < this._healthCacheTtlMs) {
      return this._healthCache;
    }

    const channels = {
      web:     { ok: false, latencyMs: null, error: null },
      github:  { ok: false, latencyMs: null, error: null },
      youtube: { ok: false, latencyMs: null, error: null },
    };

    // Run version check to verify binary is reachable
    let versionOk = false;
    let version = null;
    try {
      const t0 = Date.now();
      const res = await runAgentReach(['version'], 8000);
      versionOk = res.ok === true;
      version = res.result?.version || null;
      channels._binaryLatencyMs = Date.now() - t0;
    } catch (e) {
      this._healthCache = {
        ok: false,
        binaryReachable: false,
        error: `باینری agent-reach در دسترس نیست: ${e.message}`,
        channels,
        checkedAt: new Date().toISOString()
      };
      this._lastHealthCheck = now;
      return this._healthCache;
    }

    // Probe each channel with a lightweight real call
    const probes = [
      { channel: 'web',    args: ['web', 'search', 'test connectivity'] },
      { channel: 'github', args: ['github', 'search', 'react'] },
      { channel: 'youtube',args: ['youtube', 'search', 'test'] },
    ];

    await Promise.allSettled(probes.map(async ({ channel, args }) => {
      const t0 = Date.now();
      try {
        const res = await runAgentReach(args, 15000);
        channels[channel].ok = res.ok === true;
        channels[channel].latencyMs = Date.now() - t0;
        channels[channel].itemCount = res.items?.length || 0;
        if (!res.ok) {
          channels[channel].error = res.error?.message || 'وضعیت نامشخص';
        }
      } catch (e) {
        channels[channel].ok = false;
        channels[channel].latencyMs = Date.now() - t0;
        channels[channel].error = e.message;
      }
    }));

    this._healthCache = {
      ok: versionOk,
      binaryReachable: versionOk,
      version,
      binaryPath: AGENT_REACH_BIN,
      channels,
      disabledChannels: ['twitter', 'reddit', 'instagram', 'facebook', 'xiaohongshu',
                         'linkedin', 'boss', 'xueqiu', 'xiaoyuzhou', 'v2ex', 'bilibili'],
      disabledReason: 'نیازمند لاگین / بررسی امنیتی جداگانه',
      checkedAt: new Date().toISOString()
    };
    this._lastHealthCheck = now;
    return this._healthCache;
  }

  // ─────────────────────────────────────────────
  // Core Dispatcher
  // ─────────────────────────────────────────────

  /**
   * Invoke an agent-reach channel+action with strict allow-list enforcement.
   *
   * @param {string} channel  'web' | 'github' | 'youtube'
   * @param {string} action   'search' | 'read' | 'subtitle'
   * @param {string} query    URL for 'read'/'subtitle', keyword for 'search'
   * @param {object} [opts]   { timeoutMs }
   * @returns {Promise<object>}
   */
  async invoke(channel, action, query, opts = {}) {
    // Allow-list gate
    if (!ALLOWED_CHANNELS.has(channel)) {
      return {
        success: false,
        channel, action,
        error: `کانال «${channel}» در ARTA غیرفعال است. فقط کانال‌های عمومی بدون لاگین مجاز هستند.`,
        disabledReason: 'login-required or pending security review'
      };
    }
    if (!CHANNEL_ACTION_ALLOWLIST[channel]?.has(action)) {
      return {
        success: false,
        channel, action,
        error: `عملیات «${action}» برای کانال «${channel}» در این نسخه مجاز نیست.`
      };
    }
    if (!query || typeof query !== 'string' || !query.trim()) {
      return {
        success: false,
        channel, action,
        error: 'پارامتر جستجو یا آدرس URL نمی‌تواند خالی باشد.'
      };
    }

    const cleanQuery = query.trim();
    const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

    const t0 = Date.now();
    try {
      const raw = await runAgentReach([channel, action, cleanQuery], timeoutMs);
      const latencyMs = Date.now() - t0;

      if (!raw.ok) {
        return {
          success: false,
          channel, action,
          query: cleanQuery,
          latencyMs,
          error: raw.error?.message || 'agent-reach خطای ناشناخته برگرداند.',
          errorCode: raw.error?.code || null,
          backend: raw.backend || null,
          retrievedAt: new Date().toISOString()
        };
      }

      return {
        success: true,
        channel,
        action,
        query: cleanQuery,
        backend: raw.backend || null,
        items: raw.items || [],
        itemCount: (raw.items || []).length,
        latencyMs,
        retrievedAt: new Date().toISOString(),
        sourceAttribution: `Agent-Reach v1.6.1 / github.com/Panniantong/Agent-Reach (MIT) — کانال: ${channel}`
      };
    } catch (err) {
      return {
        success: false,
        channel, action,
        query: cleanQuery,
        latencyMs: Date.now() - t0,
        error: err.message,
        retrievedAt: new Date().toISOString()
      };
    }
  }

  // ─────────────────────────────────────────────
  // High-level Named Methods (used by tools.js)
  // ─────────────────────────────────────────────

  /** جستجوی وب عمومی از طریق Agent-Reach (بکند Exa) */
  async webSearch(query, opts = {}) {
    return this.invoke('web', 'search', query, opts);
  }

  /** خواندن محتوای یک URL عمومی از طریق Agent-Reach (بکند Jina/Exa) */
  async webRead(url, opts = {}) {
    return this.invoke('web', 'read', url, opts);
  }

  /** جستجوی مخازن و فایل‌های عمومی گیت‌هاب (بدون نیاز به توکن) */
  async githubSearch(query, opts = {}) {
    return this.invoke('github', 'search', query, opts);
  }

  /** خواندن یک مخزن عمومی گیت‌هاب یا Issue/PR */
  async githubRead(url, opts = {}) {
    return this.invoke('github', 'read', url, opts);
  }

  /** جستجوی ویدیوهای یوتیوب بدون لاگین (متادیتا عمومی) */
  async youtubeSearch(query, opts = {}) {
    return this.invoke('youtube', 'search', query, opts);
  }

  /** دریافت متادیتا و توضیحات یک ویدیوی عمومی یوتیوب */
  async youtubeRead(url, opts = {}) {
    return this.invoke('youtube', 'read', url, opts);
  }

  /** استخراج زیرنویس/متن یک ویدیوی عمومی یوتیوب (در صورت وجود زیرنویس) */
  async youtubeSubtitle(url, opts = {}) {
    return this.invoke('youtube', 'subtitle', url, opts);
  }

  /**
   * متد جامع تحقیق که بر اساس نوع ورودی، کانال مناسب را انتخاب می‌کند.
   * این متد توسط مسیرهای chat و Council فراخوانی می‌شود.
   *
   * @param {object} params
   * @param {string} params.query           عبارت جستجو
   * @param {'web'|'github'|'youtube'|'auto'} [params.channel='auto']
   * @param {'search'|'read'|'subtitle'}   [params.action='search']
   * @param {number} [params.timeoutMs]
   */
  async research(params = {}) {
    const { query, action = 'search', timeoutMs } = params;
    let { channel = 'auto' } = params;

    if (!query) {
      return { success: false, error: 'پارامتر query الزامی است.' };
    }

    // Auto-detect channel from query shape
    if (channel === 'auto') {
      if (/youtube\.com|youtu\.be/i.test(query)) {
        channel = 'youtube';
      } else if (/github\.com/i.test(query)) {
        channel = 'github';
      } else {
        channel = 'web';
      }
    }

    return this.invoke(channel, action, query, { timeoutMs });
  }
}

module.exports = new AgentReachConnector();

