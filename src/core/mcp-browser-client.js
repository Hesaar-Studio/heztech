/**
 * HezTech Microsoft Playwright MCP Integration Client
 * Provides an MCP stdio client connecting HezTech to @playwright/mcp.
 * Implements:
 * 1. Process lifecycle & session isolation (separate automation user-data-dir)
 * 2. Strict SSRF security guard (blocks localhost, private subnets, metadata, file://)
 * 3. Controlled browser operations (navigate, snapshot, click, type, screenshot, console, network, close)
 * 4. Multi-agent authorization matrix (Master, Research, Analytics, Operations)
 * 5. Safe resource cleanup to eliminate orphan browser processes
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const webTools = require('./web-tools');
const { SecurityManager } = require('./security');

const BROWSER_PROFILE_DIR = path.resolve('C:\\Users\\Green\\openclaw\\jarvis-command-center\\data\\browser-profile');
const SCREENSHOTS_DIR = path.resolve('C:\\Users\\Green\\openclaw\\jarvis-command-center\\data\\browser-screenshots');

// Ensure isolated directories exist
if (!fs.existsSync(BROWSER_PROFILE_DIR)) fs.mkdirSync(BROWSER_PROFILE_DIR, { recursive: true });
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// Allowed specialist agent domains for browser operations
const PERMITTED_AGENTS = {
  master: ['navigate', 'snapshot', 'click', 'type', 'fill_form', 'screenshot', 'console', 'network', 'close'],
  research: ['navigate', 'snapshot', 'screenshot', 'console', 'network', 'close'],
  analytics: ['navigate', 'snapshot', 'screenshot', 'console', 'network', 'close'],
  operations: ['navigate', 'snapshot', 'click', 'type', 'fill_form', 'screenshot', 'console', 'network', 'close']
};

class McpBrowserClient {
  constructor() {
    this.process = null;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    this.initialized = false;
    this.isStarting = false;
    this.startPromise = null;
    this.activeUrl = null;
    this.activeTitle = null;
    this.lastError = null;
    this.toolsList = [];

    // Ensure cleanup on process exit
    process.on('exit', () => this.forceKill());
  }

  /**
   * Check if a specialist agent is authorized for a specific browser operation.
   */
  isAgentAuthorized(agentId = 'master', action = 'navigate') {
    const norm = (agentId || 'master').toLowerCase();
    const allowed = PERMITTED_AGENTS[norm];
    if (!allowed) return false;
    return allowed.includes(action);
  }

  /**
   * Start the @playwright/mcp process with isolated profile & stdio JSON-RPC.
   */
  async ensureStarted() {
    if (this.initialized && this.process && !this.process.killed) {
      return true;
    }
    if (this.isStarting) {
      return this.startPromise;
    }

    this.isStarting = true;
    this.startPromise = new Promise((resolve, reject) => {
      try {
        console.log('[Playwright MCP] Spawning @playwright/mcp server process...');
        const args = [
          '-y',
          '@playwright/mcp@latest',
          '--headless',
          `--user-data-dir=${BROWSER_PROFILE_DIR}`
        ];

        this.process = spawn('npx', args, {
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: 'C:\\Users\\Green\\AppData\\Local\\ms-playwright' }
        });

        this.process.stdout.on('data', (data) => this._handleData(data));
        this.process.stderr.on('data', (data) => {
          const text = data.toString();
          // Filter out standard npx download warnings
          if (!text.includes('DeprecationWarning') && !text.includes('npm warn')) {
            console.warn('[Playwright MCP STDERR]:', text.trim());
          }
        });

        this.process.on('error', (err) => {
          console.error('[Playwright MCP Process Error]:', err.message);
          this.lastError = err.message;
          this.initialized = false;
          this.isStarting = false;
          reject(err);
        });

        this.process.on('close', (code) => {
          console.log(`[Playwright MCP] Process closed with exit code ${code}`);
          this.initialized = false;
          this.isStarting = false;
          this.process = null;
          this.activeUrl = null;
          this.activeTitle = null;
        });

        // Send MCP initialize request
        const initReq = {
          jsonrpc: '2.0',
          id: this.nextId++,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'heztech-playwright-client', version: '2.0.0' }
          }
        };

        const timer = setTimeout(() => {
          this.isStarting = false;
          reject(new Error('Playwright MCP initialization timed out (25s)'));
        }, 25000);

        this.pending.set(initReq.id, {
          resolve: async (res) => {
            clearTimeout(timer);
            // Send notifications/initialized
            this._send({ jsonrpc: '2.0', method: 'notifications/initialized' });
            this.initialized = true;
            this.isStarting = false;

            // Fetch available tools list
            try {
              const listRes = await this._callMethod('tools/list', {});
              this.toolsList = listRes?.tools || [];
              console.log(`[Playwright MCP] Initialized successfully! Registered tools: ${this.toolsList.length}`);
            } catch (listErr) {
              console.warn('[Playwright MCP] tools/list error:', listErr.message);
            }
            resolve(true);
          },
          reject: (err) => {
            clearTimeout(timer);
            this.isStarting = false;
            reject(err);
          }
        });

        this._send(initReq);
      } catch (err) {
        this.isStarting = false;
        reject(err);
      }
    });

    return this.startPromise;
  }

  _send(obj) {
    if (!this.process || !this.process.stdin.writable) {
      throw new Error('Playwright MCP process stdin is not writable');
    }
    this.process.stdin.write(JSON.stringify(obj) + '\n');
  }

  _handleData(chunk) {
    this.buffer += chunk.toString();
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop(); // Retain remainder in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch (e) {
        // Not a JSON message line, ignore
      }
    }
  }

  _callMethod(method, params, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request ${method} (id=${id}) timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });

      this._send({ jsonrpc: '2.0', id, method, params });
    });
  }

  /**
   * Execute an MCP tool via tools/call.
   */
  async callTool(name, args = {}, timeoutMs = 35000) {
    await this.ensureStarted();
    return await this._callMethod('tools/call', { name, arguments: args }, timeoutMs);
  }

  // ==========================================
  // HIGH-LEVEL CONTROLLED BROWSER CAPABILITIES
  // ==========================================

  /**
   * 1. Open a public web page with strict SSRF validation.
   */
  async navigate(url, agentId = 'master') {
    const timestamp = new Date().toISOString();

    if (!this.isAgentAuthorized(agentId, 'navigate')) {
      return {
        success: false,
        error: `عامل «${agentId}» دسترسی مجاز برای باز کردن مرورگر ندارد.`,
        agentId
      };
    }

    // SSRF Security Gate
    const validation = await webTools.validatePublicUrl(url);
    if (!validation.allowed) {
      SecurityManager.logAudit('BROWSER_SSRF_BLOCKED', { url, reason: validation.reason, agentId });
      return {
        success: false,
        error: `امنیت مرز شبکه (SSRF Guard): دسترسی به این آدرس مسدود شد. دلیل: ${validation.reason}`,
        url,
        timestamp
      };
    }

    try {
      const res = await this.callTool('browser_navigate', { url: validation.url });
      this.activeUrl = validation.url;

      // Parse result text for Page Title
      const text = res?.content?.map(c => c.text).join('\n') || '';
      const titleMatch = text.match(/Page Title:\s*(.+)/i);
      this.activeTitle = titleMatch ? titleMatch[1].trim() : 'Unknown Title';

      SecurityManager.logAudit('BROWSER_NAVIGATE_SUCCESS', { url: validation.url, title: this.activeTitle, agentId });

      return {
        success: true,
        url: validation.url,
        title: this.activeTitle,
        details: text.slice(0, 1000),
        agentId,
        timestamp
      };
    } catch (err) {
      return {
        success: false,
        error: `خطا در باز کردن صفحه وب: ${err.message}`,
        url,
        agentId,
        timestamp
      };
    }
  }

  /**
   * 2. Read accessibility snapshot & textual content of current page.
   */
  async snapshot(agentId = 'master') {
    if (!this.isAgentAuthorized(agentId, 'snapshot')) {
      return { success: false, error: `عامل «${agentId}» دسترسی مجاز برای خواندن مرورگر ندارد.` };
    }
    try {
      const res = await this.callTool('browser_snapshot', {});
      const text = res?.content?.map(c => c.text).join('\n') || '';
      return {
        success: true,
        url: this.activeUrl,
        title: this.activeTitle,
        snapshot: text.length > 8000 ? text.substring(0, 8000) + '\n... [متن خلاصه شد]' : text,
        length: text.length,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return { success: false, error: `خطا در استخراج محتوای صفحه: ${err.message}` };
    }
  }

  /**
   * 3. Click an element on the page.
   */
  async click(elementRef, agentId = 'master') {
    if (!this.isAgentAuthorized(agentId, 'click')) {
      return { success: false, error: `عامل «${agentId}» دسترسی مجاز برای کلیک در مرورگر ندارد.` };
    }
    try {
      const target = typeof elementRef === 'string' ? elementRef : (elementRef.target || elementRef.selector);
      const args = { target };
      if (typeof elementRef === 'object' && elementRef.element) args.element = elementRef.element;
      if (typeof elementRef === 'object' && elementRef.button) args.button = elementRef.button;
      const res = await this.callTool('browser_click', args);
      const text = res?.content?.map(c => c.text).join('\n') || 'Clicked successfully';
      return {
        success: true,
        action: 'click',
        target,
        result: text,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return { success: false, error: `خطا در کلیک روی المان: ${err.message}`, target: elementRef };
    }
  }

  /**
   * 4. Type text into an editable element.
   */
  async type(selector, text, agentId = 'master') {
    if (!this.isAgentAuthorized(agentId, 'type')) {
      return { success: false, error: `عامل «${agentId}» دسترسی مجاز برای تایپ در مرورگر ندارد.` };
    }
    try {
      const target = typeof selector === 'string' ? selector : (selector?.target || selector?.selector);
      const textVal = typeof text === 'string' ? text : (selector?.text || '');
      const args = { target, text: textVal };
      const res = await this.callTool('browser_type', args);
      return {
        success: true,
        action: 'type',
        selector: target,
        result: res?.content?.map(c => c.text).join('\n') || 'Typed successfully',
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return { success: false, error: `خطا در وارد کردن متن: ${err.message}`, selector };
    }
  }

  /**
   * 5. Capture a browser screenshot.
   */
  async takeScreenshot(filename = null, agentId = 'master') {
    if (!this.isAgentAuthorized(agentId, 'screenshot')) {
      return { success: false, error: `عامل «${agentId}» دسترسی مجاز برای ثبت اسکرین‌شات ندارد.` };
    }
    try {
      const targetName = filename || `shot_${Date.now()}.png`;
      const targetPath = path.join(SCREENSHOTS_DIR, targetName);
      const res = await this.callTool('browser_take_screenshot', { scale: 'css' });

      // Save base64 image data to the target path if returned
      const imgPart = res?.content?.find(c => c.type === 'image' && c.data);
      if (imgPart) {
        fs.writeFileSync(targetPath, Buffer.from(imgPart.data, 'base64'));
      }

      return {
        success: true,
        path: targetPath,
        filename: targetName,
        url: this.activeUrl,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return { success: false, error: `خطا در ثبت اسکرین‌شات: ${err.message}` };
    }
  }

  /**
   * 6. Inspect console messages / errors.
   */
  async getConsoleMessages(agentId = 'master') {
    if (!this.isAgentAuthorized(agentId, 'console')) {
      return { success: false, error: `عامل «${agentId}» دسترسی مجاز برای مشاهده کنسول مرورگر ندارد.` };
    }
    try {
      const res = await this.callTool('browser_console_messages', { level: 'info' });
      const text = res?.content?.map(c => c.text).join('\n') || 'No console messages';
      return {
        success: true,
        messages: text,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return { success: false, error: `خطا در دریافت پیام‌های کنسول: ${err.message}` };
    }
  }

  /**
   * 7. Inspect permitted network requests.
   */
  async getNetworkRequests(agentId = 'master') {
    if (!this.isAgentAuthorized(agentId, 'network')) {
      return { success: false, error: `عامل «${agentId}» دسترسی مجاز برای مشاهده درخواست‌های شبکه ندارد.` };
    }
    try {
      const res = await this.callTool('browser_network_requests', { static: false });
      const text = res?.content?.map(c => c.text).join('\n') || 'No network activity recorded';
      return {
        success: true,
        requests: text,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return { success: false, error: `خطا در دریافت گزارش شبکه: ${err.message}` };
    }
  }

  /**
   * 8. Close browser session & clean up.
   */
  async close(agentId = 'master') {
    try {
      if (this.initialized && this.process && !this.process.killed) {
        await this.callTool('browser_close', {}, 8000).catch(() => {});
      }
    } catch (e) {
      // ignore
    } finally {
      this.forceKill();
    }
    return {
      success: true,
      message: 'جلسه مرورگر مایکروسافت با موفقیت بسته و پروسه‌ها متوقف شدند.',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Force kill process to ensure no orphans remain.
   */
  forceKill() {
    if (this.process && !this.process.killed) {
      try {
        console.log('[Playwright MCP] Terminating browser server process...');
        this.process.kill('SIGTERM');
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL');
          }
        }, 1500);
      } catch (e) {}
    }
    this.process = null;
    this.initialized = false;
    this.isStarting = false;
    this.activeUrl = null;
    this.activeTitle = null;
    this.pending.clear();
  }

  /**
   * Get operational status of Playwright MCP client.
   */
  getStatus() {
    return {
      available: true,
      initialized: this.initialized,
      activeUrl: this.activeUrl,
      activeTitle: this.activeTitle,
      profileDir: BROWSER_PROFILE_DIR,
      toolsCount: this.toolsList.length,
      tools: this.toolsList.map(t => t.name),
      pid: this.process ? this.process.pid : null,
      permittedAgents: PERMITTED_AGENTS
    };
  }
}

module.exports = new McpBrowserClient();
