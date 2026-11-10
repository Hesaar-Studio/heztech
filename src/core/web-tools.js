/**
 * HezTech Web Tools & Live Internet Access Layer
 * Provides:
 * 1. checkInternetConnectivity - Honest online/offline detection
 * 2. validatePublicUrl - SSRF protection blocking localhost, private subnets, and non-http schemes
 * 3. webSearch - Live internet search with clean direct source URLs and timestamps
 * 4. webFetch - Safe readable text extraction from public webpages
 * 5. browsePage - Browser-based rendering for JavaScript-heavy public pages
 */

const net = require('net');
const dns = require('dns').promises;

class WebTools {
  constructor() {
    this.defaultUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  }

  /**
   * Check whether the local system currently has real internet connectivity.
   */
  async checkInternetConnectivity(timeoutMs = 4000) {
    const t0 = Date.now();
    const probeEndpoints = [
      'https://www.google.com/generate_204',
      'https://1.1.1.1',
      'https://dns.google'
    ];

    for (const endpoint of probeEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'HEAD',
          signal: AbortSignal.timeout(timeoutMs)
        });
        const latencyMs = Date.now() - t0;
        return {
          online: true,
          status: 'online',
          latencyMs,
          checkedAt: new Date().toISOString(),
          endpoint
        };
      } catch (e) {
        // Continue to fallback probe
      }
    }

    // Secondary fallback: DNS resolve check
    try {
      await dns.resolve('google.com');
      const latencyMs = Date.now() - t0;
      return {
        online: true,
        status: 'online',
        latencyMs,
        checkedAt: new Date().toISOString(),
        endpoint: 'dns:google.com'
      };
    } catch (e) {
      return {
        online: false,
        status: 'offline',
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
        error: 'اتصال به اینترنت برقرار نیست یا دسترسی به سرورهای عمومی مسدود است.'
      };
    }
  }

  /**
   * SSRF Protection: Validates that a URL is public and not pointing to localhost or private IPs.
   */
  async validatePublicUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return { allowed: false, reason: 'آدرس اینترنتی ارائه نشده است.' };
    }

    let parsed;
    try {
      parsed = new URL(rawUrl.trim());
    } catch (err) {
      return { allowed: false, reason: `فرمت نشانی اینترنتی نامعتبر است: ${err.message}` };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { allowed: false, reason: `پروتکل «${parsed.protocol}» مجاز نیست. فقط نشانی‌های http و https پشتیبانی می‌شوند.` };
    }

    const host = parsed.hostname.toLowerCase();

    // 1. Block localhost and internal names
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.lan') ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1'
    ) {
      return { allowed: false, reason: `دسترسی به لوکال هاست یا شبکه داخلی (${host}) به دلایل امنیتی (پیشگیری از SSRF) مسدود است.` };
    }

    // 2. Check direct IP address
    if (this._isPrivateIp(host)) {
      return { allowed: false, reason: `دسترسی به آدرس IP خصوصی یا محدودشده (${host}) مسدود است.` };
    }

    // 3. Resolve hostname to verify destination IP is not private
    try {
      const addresses = await dns.lookup(host, { all: true });
      for (const addr of addresses) {
        if (this._isPrivateIp(addr.address)) {
          return { allowed: false, reason: `دامنه ${host} به نشانی خصوصی (${addr.address}) اشاره می‌کند و دسترسی به آن مسدود شد.` };
        }
      }
    } catch (dnsErr) {
      // If DNS lookup fails, let fetch fail naturally unless host was already blocked
    }

    return { allowed: true, url: parsed.href, hostname: host };
  }

  _isPrivateIp(ip) {
    if (!ip || typeof ip !== 'string') return false;
    let candidate = ip.trim().toLowerCase();

    // Normalize IPv4-mapped IPv6 (::ffff:127.0.0.1) so a loopback or private
    // IPv4 address cannot be smuggled past the IPv4 checks.
    const mapped = candidate.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) candidate = mapped[1];

    if (net.isIPv4(candidate)) {
      const p = candidate.split('.').map(Number);
      if (p[0] === 127) return true; // 127.0.0.0/8 Loopback
      if (p[0] === 10) return true; // 10.0.0.0/8 Private
      if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true; // 172.16.0.0/12 Private
      if (p[0] === 192 && p[1] === 168) return true; // 192.168.0.0/16 Private
      if (p[0] === 169 && p[1] === 254) return true; // 169.254.0.0/16 Link-local / metadata
      if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // 100.64.0.0/10 CGNAT
      if (p[0] === 192 && p[1] === 0 && p[2] === 0) return true; // 192.0.0.0/24 IETF
      if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true; // 198.18.0.0/15 Benchmark
      if (p[0] === 0) return true; // 0.0.0.0/8
      if (p[0] >= 224) return true; // Multicast & Reserved
      return false;
    }
    if (net.isIPv6(candidate)) {
      if (candidate === '::1' || candidate === '::') return true;
      if (candidate.startsWith('fc') || candidate.startsWith('fd')) return true; // Unique local
      if (candidate.startsWith('fe8') || candidate.startsWith('fe9') || candidate.startsWith('fea') || candidate.startsWith('feb')) return true; // Link local
      // Any remaining IPv4-mapped form (hex notation such as ::ffff:7f00:1).
      if (candidate.startsWith('::ffff:')) return true;
      return false;
    }
    return false;
  }

  /**
   * Fetch with manual redirect handling so every hop is re-validated.
   * A public URL must not be able to redirect into loopback or private space.
   */
  async _safeFetch(startUrl, { headers, signal, maxRedirects = 5 }) {
    let currentUrl = startUrl;

    for (let hop = 0; hop <= maxRedirects; hop++) {
      const check = await this.validatePublicUrl(currentUrl);
      if (!check.allowed) {
        return { ok: false, blocked: true, reason: check.reason, url: currentUrl };
      }

      const response = await fetch(check.url, {
        method: 'GET',
        redirect: 'manual',
        headers,
        signal
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return { ok: false, response, url: check.url };
        currentUrl = new URL(location, check.url).href;
        continue;
      }

      return { ok: true, response, url: check.url };
    }

    return {
      ok: false,
      blocked: true,
      reason: 'تعداد تغییر مسیرهای HTTP بیش از حد مجاز است و درخواست متوقف شد.',
      url: currentUrl
    };
  }

  /**
   * Clean redirect links from search engines into direct clickable URLs.
   */
  _extractDirectUrl(rawUrl) {
    if (!rawUrl) return '';
    const full = rawUrl.startsWith('//') ? 'https:' + rawUrl : rawUrl;
    try {
      const u = new URL(full, 'https://duckduckgo.com');
      if (u.searchParams.has('uddg')) {
        return decodeURIComponent(u.searchParams.get('uddg'));
      }
      return u.href;
    } catch {
      return rawUrl;
    }
  }

  /**
   * Live Web Search returning real results, direct URLs, snippets, and timestamp.
   */
  async webSearch(query, limit = 5) {
    const timestamp = new Date().toISOString();
    if (!query || !query.trim()) {
      return { success: false, error: 'عبارت جستجو نمی‌تواند خالی باشد.', timestamp };
    }

    const cleanQuery = query.trim();

    // 1. Verify Internet Connectivity first
    const conn = await this.checkInternetConnectivity();
    if (!conn.online) {
      return {
        success: false,
        online: false,
        error: 'اینترنت قطع است؛ امکان دسترسی به داده‌های زنده وب وجود ندارد.',
        checkedAt: conn.checkedAt,
        query: cleanQuery,
        results: [],
        timestamp
      };
    }

    try {
      const enc = encodeURIComponent(cleanQuery);
      const searchUrl = `https://html.duckduckgo.com/html/?q=${enc}`;
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': this.defaultUserAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fa,en-US;q=0.9,en;q=0.8'
        },
        signal: AbortSignal.timeout(10000)
      });

      const html = await response.text();
      const results = [];
      const titleMatches = [...html.matchAll(/class="result__title[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
      const snippetMatches = [...html.matchAll(/class="result__snippet[^>]*>([\s\S]*?)<\/a>/g)];

      for (let i = 0; i < Math.min(titleMatches.length, limit); i++) {
        const rawUrl = titleMatches[i][1];
        const directUrl = this._extractDirectUrl(rawUrl);
        const title = titleMatches[i][2].replace(/<[^>]+>/g, '').trim();
        const snippet = snippetMatches[i] ? snippetMatches[i][1].replace(/<[^>]+>/g, '').trim() : '';

        if (title && directUrl) {
          let domain = '';
          try { domain = new URL(directUrl).hostname; } catch {}
          results.push({
            title,
            url: directUrl,
            domain,
            snippet,
            retrievedAt: timestamp
          });
        }
      }

      return {
        success: true,
        online: true,
        query: cleanQuery,
        count: results.length,
        results,
        retrievedAt: timestamp
      };
    } catch (err) {
      return {
        success: false,
        online: true,
        error: `خطا در اجرای جستجوی وب: ${err.message}`,
        query: cleanQuery,
        results: [],
        timestamp
      };
    }
  }

  /**
   * Safe web fetching and readable text extraction from public web pages.
   */
  async webFetch(rawUrl, maxChars = 8000) {
    const timestamp = new Date().toISOString();

    // 1. SSRF Security Validation
    const validation = await this.validatePublicUrl(rawUrl);
    if (!validation.allowed) {
      return {
        success: false,
        error: `امنیت: ${validation.reason}`,
        url: rawUrl,
        timestamp
      };
    }

    // 2. Connectivity check
    const conn = await this.checkInternetConnectivity();
    if (!conn.online) {
      return {
        success: false,
        online: false,
        error: 'اینترنت قطع است؛ امکان دریافت صفحه وب وجود ندارد.',
        url: validation.url,
        timestamp
      };
    }

    try {
      const fetchResult = await this._safeFetch(validation.url, {
        headers: {
          'User-Agent': this.defaultUserAgent,
          'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(12000)
      });

      if (!fetchResult.ok) {
        return {
          success: false,
          blocked: !!fetchResult.blocked,
          error: fetchResult.reason || 'دریافت صفحه ممکن نشد.',
          url: fetchResult.url || validation.url,
          timestamp
        };
      }

      const response = fetchResult.response;

      if (!response.ok) {
        return {
          success: false,
          error: `خطای سرور مقصد: کد ${response.status} (${response.statusText})`,
          url: validation.url,
          timestamp
        };
      }

      const contentType = response.headers.get('content-type') || '';
      const html = await response.text();

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const pageTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : validation.hostname;

      // Clean HTML to readable plain text
      let text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<svg[\s\S]*?<\/svg>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, ' ')
        .trim();

      if (text.length > maxChars) {
        text = text.substring(0, maxChars) + '... [متن خلاصه شد]';
      }

      return {
        success: true,
        online: true,
        url: validation.url,
        title: pageTitle,
        content: text,
        characterCount: text.length,
        retrievedAt: timestamp
      };
    } catch (err) {
      return {
        success: false,
        error: `خطا در دریافت صفحه: ${err.message}`,
        url: validation.url,
        timestamp
      };
    }
  }

  /**
   * Browser-based page inspection using an isolated headless/offscreen browser instance.
   * If Electron is available in process, it creates a secure sandbox window.
   */
  async browsePage(rawUrl, maxChars = 8000) {
    const timestamp = new Date().toISOString();

    // 1. SSRF Validation
    const validation = await this.validatePublicUrl(rawUrl);
    if (!validation.allowed) {
      return { success: false, error: `امنیت: ${validation.reason}`, url: rawUrl, timestamp };
    }

    // 2. Connectivity check
    const conn = await this.checkInternetConnectivity();
    if (!conn.online) {
      return { success: false, online: false, error: 'اینترنت قطع است؛ امکان مرور صفحه وجود ندارد.', url: validation.url, timestamp };
    }

    // If inside Electron with BrowserWindow available:
    let electron;
    try { electron = require('electron'); } catch {}
    const BrowserWindow = electron?.BrowserWindow;

    if (BrowserWindow) {
      return new Promise((resolve) => {
        let win = null;
        let finished = false;

        const cleanup = (res) => {
          if (finished) return;
          finished = true;
          try {
            if (win && !win.isDestroyed()) win.destroy();
          } catch {}
          resolve(res);
        };

        const timer = setTimeout(() => {
          cleanup({ success: false, error: 'زمان مرور صفحه منقضی شد (Timeout 15s).', url: validation.url, timestamp });
        }, 15000);

        try {
          win = new BrowserWindow({
            show: false,
            width: 1280,
            height: 800,
            webPreferences: {
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
              webSecurity: true,
              images: false
            }
          });

          win.webContents.setAudioMuted(true);

          win.webContents.once('did-finish-load', async () => {
            try {
              // Wait 1 second for client hydration
              await new Promise(r => setTimeout(r, 1000));
              if (win.isDestroyed()) return;

              const pageTitle = win.getTitle() || validation.hostname;
              const extractedText = await win.webContents.executeJavaScript(`
                (() => {
                  try {
                    const clone = document.body.cloneNode(true);
                    const removeSelectors = ['script', 'style', 'nav', 'header', 'footer', 'noscript', 'svg', 'iframe', '.ad', '.ads'];
                    removeSelectors.forEach(sel => {
                      clone.querySelectorAll(sel).forEach(el => el.remove());
                    });
                    return clone.innerText || '';
                  } catch (e) {
                    return document.body?.innerText || '';
                  }
                })()
              `);

              clearTimeout(timer);
              let text = (extractedText || '').replace(/\s+/g, ' ').trim();
              if (text.length > maxChars) {
                text = text.substring(0, maxChars) + '... [متن خلاصه شد]';
              }

              cleanup({
                success: true,
                online: true,
                mode: 'browser-render',
                url: validation.url,
                title: pageTitle,
                content: text,
                characterCount: text.length,
                retrievedAt: new Date().toISOString()
              });
            } catch (err) {
              clearTimeout(timer);
              cleanup({ success: false, error: `خطا در استخراج محتوا: ${err.message}`, url: validation.url, timestamp });
            }
          });

          win.webContents.once('did-fail-load', (e, code, desc) => {
            clearTimeout(timer);
            cleanup({ success: false, error: `عدم موفقیت در بارگذاری مرورگر: ${desc} (کد: ${code})`, url: validation.url, timestamp });
          });

          win.loadURL(validation.url);
        } catch (err) {
          clearTimeout(timer);
          cleanup({ success: false, error: `خطای راه‌اندازی مرورگر: ${err.message}`, url: validation.url, timestamp });
        }
      });
    }

    // Fallback to webFetch if running in standard Node process
    return await this.webFetch(rawUrl, maxChars);
  }
}

module.exports = new WebTools();
