'use strict';

/**
 * HezTech Treg Integration Adapter
 * Connects to Treg tool catalog and MCP proxy (https://treg.to)
 *
 * Security & Reliability Principles:
 * - Independent adapter in Tool Registry layer, NOT a hard dependency of HezTech core.
 * - Credentials stored encrypted in Backend OS credential store (secureStore DPAPI).
 * - Never returns raw tokens to frontend or logs.
 * - Enforces per-call cost caps (X-Treg-Route-Max-Cost).
 * - Records cost metrics (X-Treg-Cost-Micro) into HezTech Audit Log.
 * - Transparent fallback to native tools if token is not configured or network is unavailable.
 */

const secureStore = require('../core/secure-store');
const { SecurityManager } = require('../core/security');

const TREG_BASE_URL = process.env.HEZTECH_TREG_BASE_URL || 'https://treg.to';
const DEFAULT_MAX_COST_MICRO = 50000; // $0.05 USD max per call default cap
const TIMEOUT_MS = 15000;

class TregAdapter {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || TREG_BASE_URL;
    this.secureStore = secureStore;
  }

  /**
   * Retrieves sanitized connection status.
   */
  async getStatus() {
    const creds = this.secureStore.loadCredentials(true);
    const token = creds.treg?.apiKey || creds.treg?.token;

    if (!token) {
      return {
        id: 'treg',
        name: 'Treg Agent Tool Catalog',
        configured: false,
        connected: false,
        mcpEndpoint: `${this.baseUrl}/mcp/`,
        catalogUrl: `${this.baseUrl}/docs`,
        message: 'توکن Treg تنظیم نشده است. سیستم از ابزارهای داخلی استفاده می‌کند.',
        details: 'Not configured — fallback to native tools is active.'
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/account/balance`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'HezTech-Desktop/2.0.3'
        },
        signal: AbortSignal.timeout(5000)
      });

      if (!res.ok) {
        return {
          id: 'treg',
          name: 'Treg Agent Tool Catalog',
          configured: true,
          connected: false,
          mcpEndpoint: `${this.baseUrl}/mcp/`,
          catalogUrl: `${this.baseUrl}/docs`,
          statusCode: res.status,
          message: 'خطا در احراز هویت با Treg: ' + res.statusText,
          details: 'Authentication rejected or expired'
        };
      }

      const data = await res.json().catch(() => ({}));
      return {
        id: 'treg',
        name: 'Treg Agent Tool Catalog',
        configured: true,
        connected: true,
        mcpEndpoint: `${this.baseUrl}/mcp/`,
        catalogUrl: `${this.baseUrl}/docs`,
        balanceUsd: data.balance_usd || data.balance || 0,
        teamSlug: data.team_slug || data.org || null,
        message: 'اتصال با کاتالوگ Treg برقرار است.',
        details: 'Connected and ready for agent tool dispatch'
      };
    } catch (err) {
      return {
        id: 'treg',
        name: 'Treg Agent Tool Catalog',
        configured: true,
        connected: false,
        mcpEndpoint: `${this.baseUrl}/mcp/`,
        catalogUrl: `${this.baseUrl}/docs`,
        message: 'خطا در برقراری ارتباط با سرور Treg: ' + err.message,
        details: 'Network error or timeout'
      };
    }
  }

  /**
   * Save Treg API token securely in OS vault
   */
  configure({ apiKey, orgSlug = '' }) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 8) {
      return { success: false, error: 'کلید دسترسی Treg نامعتبر است.' };
    }

    try {
      const creds = this.secureStore.loadCredentials(true);
      creds.treg = {
        apiKey: apiKey.trim(),
        orgSlug: String(orgSlug || '').trim(),
        updatedAt: new Date().toISOString()
      };
      this.secureStore.saveCredentials(creds);

      SecurityManager.logAudit('TREG_CONFIGURED', {
        orgSlug: orgSlug || null,
        timestamp: new Date().toISOString()
      });

      return { success: true, message: 'اطلاعات احراز هویت Treg با موفقیت در فضای امن ذخیره شد.' };
    } catch (err) {
      return { success: false, error: 'خطا در ذخیره امن کلید: ' + err.message };
    }
  }

  /**
   * Disconnect and wipe Treg credentials
   */
  disconnect() {
    try {
      const creds = this.secureStore.loadCredentials(true);
      delete creds.treg;
      this.secureStore.saveCredentials(creds);

      SecurityManager.logAudit('TREG_DISCONNECTED', {
        timestamp: new Date().toISOString()
      });

      return { success: true, message: 'اتصال Treg با موفقیت قطع و کلید محلی حذف شد.' };
    } catch (err) {
      return { success: false, error: 'خطا در حذف کلید: ' + err.message };
    }
  }

  /**
   * Search tools by job/task in Treg catalog
   */
  async searchCatalog({ query, job, limit = 10 }) {
    const creds = this.secureStore.loadCredentials(true);
    const token = creds.treg?.apiKey;

    const searchTerm = query || job || '';
    if (!searchTerm) {
      return { success: false, error: 'عبارت جستجو مشخص نشده است.' };
    }

    const headers = {
      'User-Agent': 'HezTech-Desktop/2.0.3'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const url = new URL(`${this.baseUrl}/api/catalog/search`);
      url.searchParams.set('q', searchTerm);
      url.searchParams.set('limit', String(Math.min(50, Math.max(1, limit))));

      const res = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });

      if (!res.ok) {
        return {
          success: false,
          error: `Treg catalog search error: ${res.status} ${res.statusText}`,
          fallbackToNative: true
        };
      }

      const results = await res.json();
      return {
        success: true,
        query: searchTerm,
        results: Array.isArray(results.tools) ? results.tools : (Array.isArray(results) ? results : []),
        total: results.total || 0
      };
    } catch (err) {
      return {
        success: false,
        error: 'خطای شبکه در جستجوی کاتالوگ Treg: ' + err.message,
        fallbackToNative: true
      };
    }
  }

  /**
   * Call a tool via Treg gateway proxy with cost limit check
   */
  async callTool({ toolId, endpointUrl, method = 'POST', params = {}, maxCostMicro = DEFAULT_MAX_COST_MICRO }) {
    const creds = this.secureStore.loadCredentials(true);
    const token = creds.treg?.apiKey;

    if (!token) {
      return {
        success: false,
        error: 'توکن Treg تنظیم نشده است. لطفاً ابتدا در تنظیمات احراز هویت کنید.',
        fallbackToNative: true
      };
    }

    const callTarget = endpointUrl
      ? `${this.baseUrl}/call/${endpointUrl.replace(/^https?:\/\//, '')}`
      : `${this.baseUrl}/call/tool/${encodeURIComponent(toolId)}`;

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Treg-Route-Max-Cost': String(maxCostMicro || DEFAULT_MAX_COST_MICRO),
      'User-Agent': 'HezTech-Desktop/2.0.3'
    };
    if (creds.treg?.orgSlug) {
      headers['X-Treg-Org'] = creds.treg.orgSlug;
    }

    try {
      const startTime = Date.now();
      const res = await fetch(callTarget, {
        method,
        headers,
        body: method.toUpperCase() !== 'GET' ? JSON.stringify(params) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });

      const costMicro = parseInt(res.headers.get('x-treg-cost-micro') || '0', 10);
      const costUsd = costMicro / 1000000;
      const durationMs = Date.now() - startTime;

      SecurityManager.logAudit('TREG_TOOL_CALLED', {
        toolId,
        costMicro,
        costUsd,
        durationMs,
        status: res.status
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          success: false,
          status: res.status,
          error: `Treg tool execution failed: ${res.statusText}`,
          detail: errorText,
          costMicro,
          costUsd,
          fallbackToNative: true
        };
      }

      const data = await res.json().catch(() => ({}));
      return {
        success: true,
        data,
        costMicro,
        costUsd,
        durationMs
      };
    } catch (err) {
      return {
        success: false,
        error: 'خطای اجرای ابزار در Treg: ' + err.message,
        fallbackToNative: true
      };
    }
  }
}

module.exports = new TregAdapter();
