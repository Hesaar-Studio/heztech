'use strict';

/**
 * Durable task execution for HezTech.
 *
 * Design borrowed from Paperclip (MIT) — claim-by-CAS, heartbeat reaping,
 * append-only hash-chained run log, idempotent cost ledger, explicit approval
 * state machine — but implemented against this app's existing JSON storage so
 * there is no second server, dashboard or database.
 *
 * Guarantees:
 * - A task is only ever `running` under a single claim token.
 * - A process that dies mid-run leaves `running` + a stale heartbeat; the next
 *   startup reaps it to `interrupted` and requeues it while attempts remain.
 * - Every state change is appended to an NDJSON log whose entries chain by
 *   sha256(previous), so a truncated or edited history is detectable.
 * - Costs are keyed by idempotency key, so a retried step cannot double-charge.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_DATA_DIR = path.resolve(process.env.HEZTECH_DATA_DIR || 'C:\\Users\\Green\\openclaw\\vault');

const STATE = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  INTERRUPTED: 'interrupted',
  CANCELLED: 'cancelled',
  NEEDS_APPROVAL: 'needs_approval'
});

const TERMINAL = new Set([STATE.SUCCEEDED, STATE.FAILED, STATE.CANCELLED]);

function atomicWriteJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

class DurableTaskStore {
  constructor(options = {}) {
    this.dataDir = options.dataDir || DEFAULT_DATA_DIR;
    this.clock = options.clock || (() => Date.now());
    this.heartbeatTtlMs = options.heartbeatTtlMs || 30000;
    this.maxAttempts = options.maxAttempts || 3;

    this.tasksFile = path.join(this.dataDir, 'durable-tasks.json');
    this.runLogFile = path.join(this.dataDir, 'durable-runs.ndjson');
    this.costFile = path.join(this.dataDir, 'durable-costs.json');

    fs.mkdirSync(this.dataDir, { recursive: true });
    this.tasks = this._loadTasks();
  }

  _loadTasks() {
    try {
      if (fs.existsSync(this.tasksFile)) {
        const parsed = JSON.parse(fs.readFileSync(this.tasksFile, 'utf-8'));
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      // A corrupt store is preserved, not silently discarded.
      try { fs.renameSync(this.tasksFile, `${this.tasksFile}.corrupt-${Date.now()}`); } catch (e) {}
    }
    return [];
  }

  _save() {
    atomicWriteJson(this.tasksFile, this.tasks);
  }

  _find(taskId) {
    return this.tasks.find(t => t.id === taskId) || null;
  }

  _log(task, event, detail = {}) {
    const previous = this._lastLogHash();
    const entry = {
      at: new Date(this.clock()).toISOString(),
      taskId: task ? task.id : null,
      event,
      state: task ? task.state : null,
      attempt: task ? task.attempts : 0,
      detail,
      prev: previous
    };
    entry.hash = sha256(JSON.stringify({ ...entry, hash: undefined }));
    fs.appendFileSync(this.runLogFile, `${JSON.stringify(entry)}\n`, 'utf-8');
    return entry;
  }

  _lastLogHash() {
    try {
      if (!fs.existsSync(this.runLogFile)) return 'genesis';
      const lines = fs.readFileSync(this.runLogFile, 'utf-8').trim().split('\n').filter(Boolean);
      if (!lines.length) return 'genesis';
      return JSON.parse(lines[lines.length - 1]).hash;
    } catch (e) {
      return 'unreadable';
    }
  }

  createTask({ title, payload = {}, requiresApproval = false, costCapUsd = 0 } = {}) {
    if (!title || typeof title !== 'string') throw new Error('TASK_TITLE_REQUIRED');
    const now = this.clock();
    const task = {
      id: `dt_${now.toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
      title: title.trim(),
      payload,
      state: requiresApproval ? STATE.NEEDS_APPROVAL : STATE.QUEUED,
      attempts: 0,
      maxAttempts: this.maxAttempts,
      claimToken: null,
      workerId: null,
      heartbeatAt: null,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      lastError: null,
      result: null,
      approval: requiresApproval
        ? { state: 'pending', requestedAt: new Date(now).toISOString(), decidedBy: null, decidedAt: null, expiresAt: null }
        : null,
      costCapUsd,
      costUsd: 0
    };
    this.tasks.push(task);
    this._save();
    this._log(task, 'created', { requiresApproval });
    return task;
  }

  /**
   * Claim the next runnable task. The state transition is written before the
   * caller starts work, so a crash can never leave an unowned `running` row.
   */
  claimNext(workerId) {
    if (!workerId) throw new Error('WORKER_ID_REQUIRED');
    this.recoverOrphans();

    const candidate = this.tasks
      .filter(t => t.state === STATE.QUEUED)
      .filter(t => t.attempts < t.maxAttempts)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];

    if (!candidate) return null;

    candidate.state = STATE.RUNNING;
    candidate.attempts += 1;
    candidate.claimToken = crypto.randomBytes(12).toString('hex');
    candidate.workerId = workerId;
    candidate.heartbeatAt = new Date(this.clock()).toISOString();
    candidate.updatedAt = candidate.heartbeatAt;
    this._save();
    this._log(candidate, 'claimed', { workerId, attempt: candidate.attempts });
    return { ...candidate };
  }

  heartbeat(taskId, claimToken) {
    const task = this._find(taskId);
    if (!task || task.state !== STATE.RUNNING) return { ok: false, error: 'TASK_NOT_RUNNING' };
    if (task.claimToken !== claimToken) return { ok: false, error: 'CLAIM_TOKEN_MISMATCH' };
    task.heartbeatAt = new Date(this.clock()).toISOString();
    task.updatedAt = task.heartbeatAt;
    this._save();
    return { ok: true, heartbeatAt: task.heartbeatAt };
  }

  complete(taskId, { claimToken, result = null, costUsd = 0, idempotencyKey = null } = {}) {
    const task = this._find(taskId);
    if (!task) return { ok: false, error: 'TASK_NOT_FOUND' };
    if (task.state !== STATE.RUNNING) return { ok: false, error: 'TASK_NOT_RUNNING' };
    if (task.claimToken !== claimToken) return { ok: false, error: 'CLAIM_TOKEN_MISMATCH' };

    if (costUsd > 0) {
      const charge = this.recordCost(taskId, costUsd, idempotencyKey || `${taskId}:${task.attempts}`);
      if (!charge.ok) return charge;
    }
    if (task.costCapUsd > 0 && task.costUsd > task.costCapUsd) {
      task.state = STATE.FAILED;
      task.lastError = 'COST_CAP_EXCEEDED';
      task.updatedAt = new Date(this.clock()).toISOString();
      this._save();
      this._log(task, 'failed', { reason: 'COST_CAP_EXCEEDED', costUsd: task.costUsd });
      return { ok: false, error: 'COST_CAP_EXCEEDED', task: { ...task } };
    }

    task.state = STATE.SUCCEEDED;
    task.result = result;
    task.claimToken = null;
    task.updatedAt = new Date(this.clock()).toISOString();
    this._save();
    this._log(task, 'succeeded', { costUsd: task.costUsd });
    return { ok: true, task: { ...task } };
  }

  fail(taskId, { claimToken, error = 'UNKNOWN', retryable = true } = {}) {
    const task = this._find(taskId);
    if (!task) return { ok: false, error: 'TASK_NOT_FOUND' };
    if (task.state !== STATE.RUNNING) return { ok: false, error: 'TASK_NOT_RUNNING' };
    if (task.claimToken !== claimToken) return { ok: false, error: 'CLAIM_TOKEN_MISMATCH' };

    task.lastError = String(error).slice(0, 500);
    task.claimToken = null;
    task.updatedAt = new Date(this.clock()).toISOString();

    if (retryable && task.attempts < task.maxAttempts) {
      task.state = STATE.QUEUED;
      this._save();
      this._log(task, 'retry_scheduled', { error: task.lastError });
    } else {
      task.state = STATE.FAILED;
      this._save();
      this._log(task, 'failed', { error: task.lastError });
    }
    return { ok: true, task: { ...task } };
  }

  /**
   * Reap tasks whose worker stopped heartbeating. Called on startup and before
   * every claim, so "unexpected stop" is a recoverable state rather than a
   * permanently stuck row.
   */
  recoverOrphans() {
    const now = this.clock();
    const recovered = [];
    for (const task of this.tasks) {
      if (task.state !== STATE.RUNNING) continue;
      const age = now - Date.parse(task.heartbeatAt || task.updatedAt);
      if (!Number.isFinite(age) || age < this.heartbeatTtlMs) continue;

      task.state = STATE.INTERRUPTED;
      task.lastError = 'PROCESS_LOST';
      task.claimToken = null;
      task.updatedAt = new Date(now).toISOString();

      if (task.attempts < task.maxAttempts) {
        task.state = STATE.QUEUED;
        this._log(task, 'recovered_requeued', { attempt: task.attempts });
      } else {
        task.state = STATE.FAILED;
        this._log(task, 'recovered_failed', { attempt: task.attempts });
      }
      recovered.push({ ...task });
    }
    if (recovered.length) this._save();
    return recovered;
  }

  requestApproval(taskId, { expiresInMs = 3600000 } = {}) {
    const task = this._find(taskId);
    if (!task) return { ok: false, error: 'TASK_NOT_FOUND' };
    const now = this.clock();
    task.approval = {
      state: 'pending',
      requestedAt: new Date(now).toISOString(),
      decidedBy: null,
      decidedAt: null,
      expiresAt: new Date(now + expiresInMs).toISOString()
    };
    task.state = STATE.NEEDS_APPROVAL;
    task.updatedAt = new Date(now).toISOString();
    this._save();
    this._log(task, 'approval_requested', { expiresAt: task.approval.expiresAt });
    return { ok: true, task: { ...task } };
  }

  decideApproval(taskId, { approved, actor, reason = '' } = {}) {
    const task = this._find(taskId);
    if (!task || !task.approval) return { ok: false, error: 'APPROVAL_NOT_FOUND' };
    if (!actor) return { ok: false, error: 'ACTOR_REQUIRED' };
    this._expireApproval(task);

    if (task.approval.state !== 'pending') {
      return { ok: false, error: `APPROVAL_${String(task.approval.state).toUpperCase()}` };
    }
    const now = this.clock();
    task.approval.state = approved ? 'approved' : 'denied';
    task.approval.decidedBy = actor;
    task.approval.decidedAt = new Date(now).toISOString();
    task.approval.reason = reason;
    task.state = approved ? STATE.QUEUED : STATE.CANCELLED;
    task.updatedAt = new Date(now).toISOString();
    this._save();
    this._log(task, approved ? 'approval_granted' : 'approval_denied', { actor });
    return { ok: true, task: { ...task } };
  }

  _expireApproval(task) {
    if (!task.approval || task.approval.state !== 'pending' || !task.approval.expiresAt) return;
    if (this.clock() <= Date.parse(task.approval.expiresAt)) return;
    task.approval.state = 'expired';
    task.state = STATE.CANCELLED;
    task.updatedAt = new Date(this.clock()).toISOString();
    this._save();
    this._log(task, 'approval_expired');
  }

  /** Idempotent spend recording. Same key never charges twice. */
  recordCost(taskId, amountUsd, idempotencyKey) {
    if (!idempotencyKey) return { ok: false, error: 'IDEMPOTENCY_KEY_REQUIRED' };
    const ledger = this._loadCostLedger();
    if (ledger.entries.some(e => e.key === idempotencyKey)) {
      return { ok: true, duplicate: true, totalUsd: ledger.totalUsd };
    }
    const task = this._find(taskId);
    if (!task) return { ok: false, error: 'TASK_NOT_FOUND' };

    const amount = Number(amountUsd) || 0;
    ledger.entries.push({
      key: idempotencyKey,
      taskId,
      amountUsd: amount,
      at: new Date(this.clock()).toISOString()
    });
    ledger.totalUsd = Math.round((ledger.totalUsd + amount) * 1e6) / 1e6;
    atomicWriteJson(this.costFile, ledger);

    task.costUsd = Math.round((task.costUsd + amount) * 1e6) / 1e6;
    task.updatedAt = new Date(this.clock()).toISOString();
    this._save();
    return { ok: true, duplicate: false, totalUsd: ledger.totalUsd, taskCostUsd: task.costUsd };
  }

  _loadCostLedger() {
    try {
      if (fs.existsSync(this.costFile)) {
        const parsed = JSON.parse(fs.readFileSync(this.costFile, 'utf-8'));
        if (parsed && Array.isArray(parsed.entries)) return parsed;
      }
    } catch (e) {}
    return { totalUsd: 0, entries: [] };
  }

  totalCostUsd() {
    return this._loadCostLedger().totalUsd;
  }

  /** Verify the run log hash chain. Detects edits and truncated history. */
  verifyRunLog() {
    if (!fs.existsSync(this.runLogFile)) return { ok: true, entries: 0, reason: 'EMPTY' };
    const lines = fs.readFileSync(this.runLogFile, 'utf-8').trim().split('\n').filter(Boolean);
    let previous = 'genesis';
    let index = 0;
    for (const line of lines) {
      index += 1;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch (e) {
        return { ok: false, entries: index, reason: 'UNPARSEABLE_ENTRY' };
      }
      if (entry.prev !== previous) {
        return { ok: false, entries: index, reason: 'BROKEN_CHAIN' };
      }
      const expected = sha256(JSON.stringify({ ...entry, hash: undefined }));
      if (expected !== entry.hash) {
        return { ok: false, entries: index, reason: 'HASH_MISMATCH' };
      }
      previous = entry.hash;
    }
    return { ok: true, entries: lines.length };
  }

  runHistory(taskId) {
    if (!fs.existsSync(this.runLogFile)) return [];
    return fs.readFileSync(this.runLogFile, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch (e) { return null; }
      })
      .filter(entry => entry && (!taskId || entry.taskId === taskId));
  }

  listTasks({ state = null, limit = 50 } = {}) {
    return this.tasks
      .filter(t => (state ? t.state === state : true))
      .slice(-limit)
      .reverse()
      .map(t => ({ ...t }));
  }

  summary() {
    const counts = {};
    for (const task of this.tasks) counts[task.state] = (counts[task.state] || 0) + 1;
    return {
      total: this.tasks.length,
      counts,
      runnable: this.tasks.filter(t => t.state === STATE.QUEUED && t.attempts < t.maxAttempts).length,
      totalCostUsd: this.totalCostUsd(),
      log: this.verifyRunLog()
    };
  }
}

module.exports = { DurableTaskStore, STATE, TERMINAL, getDurableTaskStore };

let defaultStore = null;

/**
 * One process-wide store. main.js and the tool registry must share the same
 * in-memory view, otherwise two writers would clobber each other's file.
 */
function getDurableTaskStore(options) {
  if (!defaultStore) defaultStore = new DurableTaskStore(options);
  return defaultStore;
}
