/**
 * JARVIS Security & Authorization Engine
 * Enforces least-privilege access, command allowlisting, and Human-in-the-Loop approvals.
 */

const crypto = require('crypto');

// Strict Allowlist for Windows Command Execution
const COMMAND_ALLOWLIST = new Set([
  'ipconfig',
  'ipconfig /all',
  'ping 8.8.8.8 -n 3',
  'ping 1.1.1.1 -n 3',
  'netstat -ano',
  'systeminfo',
  'tasklist',
  'dir',
  'hostname',
  'whoami',
  'ver',
  'cmd /c ver',
  'get-date'
]);

// Strict App Launcher Whitelist
const APP_ALLOWLIST = {
  'calc': 'calc.exe',
  'calculator': 'calc.exe',
  'notepad': 'notepad.exe',
  'explorer': 'explorer.exe',
  'taskmgr': 'taskmgr.exe',
  'powershell': 'start powershell.exe',
  'cmd': 'start cmd.exe',
  'settings': 'start ms-settings:',
  'browser': 'start https://google.com',
  'calendar': 'start ms-settings:dateandtime'
};

// Destructive command pattern blacklist
const DESTRUCTIVE_PATTERNS = [
  /format\s+[a-z]:/i,
  /rmdir\s+\/s\s+\/q/i,
  /del\s+\/f\s+\/s/i,
  /remove-item\s+.*-recurse.*-force/i,
  /drop\s+database/i,
  /reg\s+delete/i,
  /diskpart/i,
  /shutdown/i,
  /restart-computer/i
];

const fs = require('fs');
const path = require('path');
const os = require('os');

// Application runtime data directory - completely isolated from Obsidian Vault
function getHezTechDataDir() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return process.env.HEZTECH_DATA_DIR || path.join(appData, 'HezTech');
}

const APP_DATA_DIR = getHezTechDataDir();
const APPROVALS_FILE = path.join(APP_DATA_DIR, 'pending-approvals.json');

// Roots that no model-driven file operation may touch, even with an approval.
// They hold owner data (vault), external projects, or operating-system binaries.
const PROTECTED_ROOTS = [
  path.join(require('os').homedir(), 'openclaw', 'vault'),
  path.resolve(process.env.HEZTECH_DATA_DIR || 'C:\\Users\\Green\\openclaw\\vault'),
  path.resolve('C:\\capcut-bridge-kit'),
  path.resolve(process.env.HEZTECH_CAPCUT_BRIDGE_DIR || path.join(require('os').homedir(), 'openclaw', '.audit', 'capcut-bridge-kit')),
  path.resolve('C:\\Windows'),
  path.resolve('C:\\Program Files'),
  path.resolve('C:\\Program Files (x86)'),
  path.resolve('C:\\ProgramData')
];

const APPROVAL_TTL_MS = 300000; // 5 minutes, matches the interactive timeout

class SecurityManager {
  constructor() {
    this.pendingApprovals = new Map(); // id -> { id, type, details, riskLevel, timestamp, resolve, reject }
    this.auditLog = [];
    this.ensureApprovalsFile();
  }

  ensureApprovalsFile() {
    try {
      if (!fs.existsSync(APP_DATA_DIR)) fs.mkdirSync(APP_DATA_DIR, { recursive: true });
      if (!fs.existsSync(APPROVALS_FILE)) {
        const legacyVaultFile = path.join('C:\\Users\\Green\\openclaw\\vault', 'pending-approvals.json');
        if (!process.env.HEZTECH_DATA_DIR && fs.existsSync(legacyVaultFile)) {
          try {
            const legacyContent = fs.readFileSync(legacyVaultFile, 'utf-8');
            fs.writeFileSync(APPROVALS_FILE, legacyContent, 'utf-8');
          } catch (_) {
            fs.writeFileSync(APPROVALS_FILE, JSON.stringify([], null, 2), 'utf-8');
          }
        } else {
          fs.writeFileSync(APPROVALS_FILE, JSON.stringify([], null, 2), 'utf-8');
        }
      }
    } catch(e) {}
  }

  loadApprovalsFromDisk() {
    try {
      this.ensureApprovalsFile();
      return JSON.parse(fs.readFileSync(APPROVALS_FILE, 'utf-8')) || [];
    } catch(e) {
      return [];
    }
  }

  saveApprovalsToDisk(list) {
    try {
      fs.writeFileSync(APPROVALS_FILE, JSON.stringify(list, null, 2), 'utf-8');
      return true;
    } catch(e) {
      return false;
    }
  }

  // ------------------------------------------------------------------
  // File authorization (single owner for every read/write decision)
  // ------------------------------------------------------------------

  _normalizeForCompare(value) {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }

  isProtectedPath(resolvedPath) {
    const candidate = this._normalizeForCompare(resolvedPath);
    return PROTECTED_ROOTS.some(root => {
      const normalizedRoot = this._normalizeForCompare(root);
      return candidate === normalizedRoot || candidate.startsWith(normalizedRoot + path.sep);
    });
  }

  /**
   * Resolve symlinks on the longest existing ancestor so a link cannot be used
   * to escape the allowed root. Non-existent tails are appended verbatim.
   */
  _realpathLoose(target) {
    let current = path.resolve(target);
    const tail = [];
    for (let depth = 0; depth < 64; depth++) {
      try {
        const real = fs.realpathSync.native ? fs.realpathSync.native(current) : fs.realpathSync(current);
        return tail.length ? path.join(real, ...tail) : real;
      } catch (e) {
        const parent = path.dirname(current);
        if (parent === current) return path.resolve(target);
        tail.unshift(path.basename(current));
        current = parent;
      }
    }
    return path.resolve(target);
  }

  /**
   * Authorize a filesystem target against an allowed root.
   * Absolute paths outside the root, `..` escapes, symlink escapes and
   * protected roots are all rejected.
   */
  normalizeTarget(root, requested) {
    if (typeof requested !== 'string' || !requested.trim()) {
      return { ok: false, reason: 'PATH_INVALID' };
    }
    if (requested.includes('\0')) {
      return { ok: false, reason: 'PATH_INVALID' };
    }

    const baseReal = this._realpathLoose(root);
    const candidate = path.isAbsolute(requested)
      ? path.resolve(requested)
      : path.resolve(baseReal, requested);
    const resolved = this._realpathLoose(candidate);

    const baseCmp = this._normalizeForCompare(baseReal);
    const resolvedCmp = this._normalizeForCompare(resolved);
    const insideRoot = resolvedCmp === baseCmp || resolvedCmp.startsWith(baseCmp + path.sep);

    if (!insideRoot) {
      this.logAudit('PATH_BLOCKED', { root: baseReal, requested, resolved, reason: 'OUTSIDE_ALLOWED_ROOT' });
      return { ok: false, reason: 'PATH_OUTSIDE_ALLOWED_ROOT', resolvedPath: resolved };
    }
    if (this.isProtectedPath(resolved)) {
      this.logAudit('PATH_BLOCKED', { root: baseReal, requested, resolved, reason: 'PROTECTED_ROOT' });
      return { ok: false, reason: 'PATH_PROTECTED', resolvedPath: resolved };
    }
    return { ok: true, resolvedPath: resolved };
  }

  // ------------------------------------------------------------------
  // Approval binding (content-addressed, single use, owner-issued)
  // ------------------------------------------------------------------

  _stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(v => this._stableStringify(v)).join(',') + ']';
    return '{' + Object.keys(value).sort()
      .map(k => JSON.stringify(k) + ':' + this._stableStringify(value[k])).join(',') + '}';
  }

  /**
   * Bind an approval to the exact tool call, including the full payload.
   * Any change to path or content after approval produces a different hash.
   */
  hashBinding(tool, params) {
    return crypto.createHash('sha256')
      .update(this._stableStringify({ tool: String(tool), params: params || {} }))
      .digest('hex');
  }

  findPendingByBinding(binding) {
    return this.loadApprovalsFromDisk().find(record =>
      record.binding === binding &&
      record.status === 'pending' &&
      !record.consumedAt &&
      record.expiresAt &&
      Date.parse(record.expiresAt) > Date.now()
    ) || null;
  }

  /**
   * Create a pending approval record bound to a tool call.
   * Records are always created by the runtime or the owner UI, never by the model.
   */
  createApproval({ type, tool, params, riskLevel = 'HIGH', ttlMs = APPROVAL_TTL_MS }) {
    const id = 'appr_' + crypto.randomBytes(6).toString('hex');
    const now = Date.now();
    const binding = this.hashBinding(tool, params);

    const item = {
      id,
      type,
      tool,
      binding,
      riskLevel,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
      consumedAt: null,
      status: 'pending',
      source: 'ui'
    };

    const list = this.loadApprovalsFromDisk();
    list.unshift(item);
    if (list.length > 100) list.pop();
    this.saveApprovalsToDisk(list);
    this.logAudit('APPROVAL_REQUESTED', { id, type, tool, riskLevel });

    return { id, binding };
  }

  /**
   * Consume an owner-approved record for this exact tool call.
   * Denies on: missing, forged, pending, rejected, expired, already consumed,
   * or payload mismatch. Returns ok:true only for a valid owner approval.
   */
  consumeApproval({ tool, params }) {
    const binding = this.hashBinding(tool, params);
    const list = this.loadApprovalsFromDisk();
    const now = Date.now();

    const match = list.find(record =>
      record.binding === binding &&
      record.status === 'approved' &&
      !record.consumedAt &&
      record.expiresAt &&
      Date.parse(record.expiresAt) > now
    );

    if (!match) {
      this.logAudit('APPROVAL_DENIED', { tool, binding, reason: 'NO_VALID_APPROVAL' });
      return { ok: false, reason: 'NO_VALID_APPROVAL' };
    }

    match.consumedAt = new Date(now).toISOString();
    this.saveApprovalsToDisk(list);
    this.logAudit('APPROVAL_CONSUMED', { id: match.id, tool });
    return { ok: true, id: match.id };
  }

  /**
   * Evaluates if a shell command is permitted.
   */
  evaluateCommand(cmd) {
    if (!cmd || typeof cmd !== 'string') {
      return { allowed: false, reason: 'Command is empty or invalid.' };
    }

    const trimmed = cmd.trim();
    const lower = trimmed.toLowerCase();

    // 1. Check for destructive patterns
    for (const pattern of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(lower)) {
        this.logAudit('COMMAND_BLOCKED', { cmd: trimmed, reason: 'Destructive pattern detected' });
        return { allowed: false, riskLevel: 'CRITICAL', reason: 'Command contains hazardous or destructive operations.' };
      }
    }

    // 2. Check exact allowlist
    if (COMMAND_ALLOWLIST.has(lower)) {
      this.logAudit('COMMAND_ALLOWED', { cmd: trimmed, policy: 'EXACT_ALLOWLIST' });
      return { allowed: true, riskLevel: 'LOW', requiresApproval: false };
    }

    // 3. For any other command, enforce Human Approval Gate
    return {
      allowed: false,
      riskLevel: 'HIGH',
      requiresApproval: true,
      reason: 'Command is not on the pre-approved whitelist and requires explicit owner authorization.'
    };
  }

  /**
   * Request interactive Human-in-the-Loop approval for an operation.
   */
  requestApproval(type, details, riskLevel = 'HIGH') {
    const id = 'appr_' + crypto.randomBytes(6).toString('hex');
    const now = Date.now();
    const item = {
      id,
      type,
      details,
      riskLevel,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + APPROVAL_TTL_MS).toISOString(),
      consumedAt: null,
      // When the payload names a tool, bind the approval to that exact call.
      binding: details && details.tool ? this.hashBinding(details.tool, details.params) : null,
      status: 'pending',
      source: 'ui'
    };

    // Persist to Vault
    const list = this.loadApprovalsFromDisk();
    list.unshift(item);
    if (list.length > 100) list.pop();
    this.saveApprovalsToDisk(list);

    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingApprovals.has(id)) {
          this.pendingApprovals.delete(id);
          this.logAudit('APPROVAL_TIMEOUT', { id, type });
          try {
            reject(new Error('Approval request timed out after 5 minutes.'));
          } catch(e) {}
        }
      }, 300000); // 5 minutes expiration
      if (timer.unref) timer.unref();

      this.pendingApprovals.set(id, {
        ...item,
        resolve,
        reject,
        timer
      });

      this.logAudit('APPROVAL_REQUESTED', { id, type, riskLevel });
    });

    promise.id = id;
    return promise;
  }

  /**
   * Resolves a pending approval. Only the owner-facing UI (or an authenticated
   * paired device) may call this. The model must never be able to approve its
   * own operation, so source:'model' is rejected outright.
   */
  resolveApproval(id, approved, user = 'Owner', source = 'ui') {
    if (source === 'model' || source === 'agent' || source === 'tool') {
      this.logAudit('APPROVAL_DENIED', { id, reason: 'MODEL_CANNOT_APPROVE' });
      return { success: false, error: 'MODEL_CANNOT_APPROVE' };
    }

    // 1. Update Vault persistent record
    const list = this.loadApprovalsFromDisk();
    const target = list.find(a => a.id === id);
    if (target) {
      if (target.consumedAt) {
        this.logAudit('APPROVAL_DENIED', { id, reason: 'ALREADY_CONSUMED' });
        return { success: false, error: 'APPROVAL_ALREADY_CONSUMED' };
      }
      if (target.status !== 'pending') {
        this.logAudit('APPROVAL_DENIED', { id, reason: 'NOT_PENDING', status: target.status });
        return { success: false, error: 'APPROVAL_NOT_PENDING' };
      }
      if (target.expiresAt && Date.parse(target.expiresAt) <= Date.now()) {
        target.status = 'expired';
        this.saveApprovalsToDisk(list);
        this.logAudit('APPROVAL_DENIED', { id, reason: 'EXPIRED' });
        return { success: false, error: 'APPROVAL_EXPIRED' };
      }
      target.status = approved ? 'approved' : 'rejected';
      target.resolvedBy = user;
      target.resolvedAt = new Date().toISOString();
      this.saveApprovalsToDisk(list);
    }

    // 2. Resolve in-memory promise if present in this process
    const record = this.pendingApprovals.get(id);
    if (record) {
      clearTimeout(record.timer);
      this.pendingApprovals.delete(id);

      if (approved) {
        this.logAudit('APPROVAL_GRANTED', { id, user, type: record.type });
        record.resolve({ approved: true, id, user });
      } else {
        this.logAudit('APPROVAL_REJECTED', { id, user, type: record.type });
        record.reject(new Error(`Operation rejected by ${user}.`));
      }
    } else {
      this.logAudit(approved ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED', { id, user });
    }

    return { success: true, status: approved ? 'approved' : 'rejected' };
  }

  /**
   * Get all active pending approvals for the UI.
   */
  getPendingApprovals() {
    const list = this.loadApprovalsFromDisk();
    return list.filter(a => a.status === 'pending');
  }

  /**
   * Strips sensitive secrets (API keys, passwords) from logs and outputs.
   */
  sanitizeSecrets(text) {
    if (!text || typeof text !== 'string') return text;
    return text
      .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_GEMINI_KEY]')
      .replace(/sk-[a-zA-Z0-9-_]{20,}/g, '[REDACTED_API_KEY]')
      .replace(/(bearer\s+)[a-zA-Z0-9\._-]{10,}/gi, '$1[REDACTED_TOKEN]')
      .replace(/(password|secret|token)\s*[:=]\s*["']?([^"'\s]+)["']?/gi, '$1="[REDACTED]"');
  }

  logAudit(event, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      data: typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : data
    };
    this.auditLog.unshift(entry);
    if (this.auditLog.length > 500) this.auditLog.pop();
  }

  getAuditLog(limit = 50) {
    return this.auditLog.slice(0, limit);
  }
}

module.exports = {
  SecurityManager: new SecurityManager(),
  APP_ALLOWLIST,
  COMMAND_ALLOWLIST
};
