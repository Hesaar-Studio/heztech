'use strict';

/**
 * Stage 3 — durable task execution (Paperclip-inspired, local implementation).
 * Proves: single-claim execution, crash recovery, retry limits, idempotent cost
 * accounting, cost caps, approval expiry and a tamper-evident run log.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The tool registry resolves its data directory at require time, so the
// isolated directory must be set before any module is loaded.
process.env.HEZTECH_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'heztech-durable-tools-'));
const { DurableTaskStore, STATE } = require('../src/core/durable-tasks');
const ToolManager = require('../src/core/tools');

function makeStore(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heztech-durable-'));
  const clock = { now: Date.parse('2026-11-07T10:00:00.000Z') };
  const store = new DurableTaskStore({
    dataDir: dir,
    clock: () => clock.now,
    heartbeatTtlMs: 30000,
    maxAttempts: 3,
    ...options
  });
  return { dir, store, clock };
}

test('STAGE3-1: a task runs under a single claim and completes with a history', () => {
  const { store, dir } = makeStore();
  const task = store.createTask({ title: 'بررسی وضعیت انتشار', payload: { kind: 'release' } });
  assert.equal(task.state, STATE.QUEUED);

  const claimed = store.claimNext('worker-1');
  assert.ok(claimed);
  assert.equal(claimed.state, STATE.RUNNING);
  assert.equal(claimed.attempts, 1);
  assert.ok(claimed.claimToken);

  // A second worker cannot claim the same task.
  assert.equal(store.claimNext('worker-2'), null);

  const done = store.complete(task.id, { claimToken: claimed.claimToken, result: { ok: true }, costUsd: 0.02, idempotencyKey: 'step-1' });
  assert.equal(done.ok, true);
  assert.equal(done.task.state, STATE.SUCCEEDED);
  assert.equal(done.task.costUsd, 0.02);

  const history = store.runHistory(task.id).map(e => e.event);
  assert.deepEqual(history, ['created', 'claimed', 'succeeded']);
  assert.equal(store.verifyRunLog().ok, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('STAGE3-2: a task whose process died is recovered and requeued on restart', () => {
  const { dir, store, clock } = makeStore();
  const task = store.createTask({ title: 'مأموریت طولانی' });
  const claimed = store.claimNext('worker-1');
  assert.equal(claimed.state, STATE.RUNNING);

  // Simulate the process disappearing: no completion, heartbeat goes stale.
  clock.now += 120000;
  const restarted = new DurableTaskStore({ dataDir: dir, clock: () => clock.now, heartbeatTtlMs: 30000, maxAttempts: 3 });
  const recovered = restarted.recoverOrphans();

  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].state, STATE.QUEUED);
  assert.equal(recovered[0].lastError, 'PROCESS_LOST');
  assert.equal(recovered[0].claimToken, null);

  const reclaimed = restarted.claimNext('worker-2');
  assert.equal(reclaimed.id, task.id);
  assert.equal(reclaimed.attempts, 2);

  const events = restarted.runHistory(task.id).map(e => e.event);
  assert.ok(events.includes('recovered_requeued'));
  assert.equal(restarted.verifyRunLog().ok, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('STAGE3-3: recovery gives up once attempts are exhausted', () => {
  const { dir, store, clock } = makeStore({ maxAttempts: 1 });
  const task = store.createTask({ title: 'مأموریت تک‌تلاش' });
  store.claimNext('worker-1');

  clock.now += 120000;
  const recovered = store.recoverOrphans();
  assert.equal(recovered[0].state, STATE.FAILED);
  assert.equal(store.claimNext('worker-2'), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('STAGE3-4: a stale claim token cannot complete or fail a task', () => {
  const { dir, store } = makeStore();
  const task = store.createTask({ title: 'تست توکن' });
  const claimed = store.claimNext('worker-1');

  const wrong = store.complete(task.id, { claimToken: 'not-the-token' });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.error, 'CLAIM_TOKEN_MISMATCH');

  const failed = store.fail(task.id, { claimToken: claimed.claimToken, error: 'boom', retryable: true });
  assert.equal(failed.ok, true);
  assert.equal(failed.task.state, STATE.QUEUED);
  assert.equal(failed.task.lastError, 'boom');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('STAGE3-5: cost accounting is idempotent per key', () => {
  const { dir, store } = makeStore();
  const task = store.createTask({ title: 'تست هزینه' });
  const claimed = store.claimNext('worker-1');

  const first = store.recordCost(task.id, 0.05, 'call-A');
  const second = store.recordCost(task.id, 0.05, 'call-A');
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(store.totalCostUsd(), 0.05);
  assert.equal(store.runHistory(task.id).find(e => e.event === 'claimed').attempt, 1);

  store.complete(task.id, { claimToken: claimed.claimToken, idempotencyKey: 'call-B' });
  assert.equal(store.totalCostUsd(), 0.05);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('STAGE3-6: a cost cap stops an over-budget task', () => {
  const { dir, store } = makeStore();
  const task = store.createTask({ title: 'تست سقف هزینه', costCapUsd: 0.01 });
  const claimed = store.claimNext('worker-1');

  store.recordCost(task.id, 0.02, 'big-call');
  const result = store.complete(task.id, { claimToken: claimed.claimToken, costUsd: 0, idempotencyKey: 'done' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'COST_CAP_EXCEEDED');
  assert.equal(store.runHistory(task.id).some(e => e.event === 'failed'), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('STAGE3-7: approvals expire instead of silently proceeding', () => {
  const { dir, store, clock } = makeStore();
  const task = store.createTask({ title: 'عملیات حساس', requiresApproval: true });
  assert.equal(task.state, STATE.NEEDS_APPROVAL);
  assert.equal(store.claimNext('worker-1'), null);

  const requested = store.requestApproval(task.id, { expiresInMs: 60000 });
  assert.equal(requested.ok, true);

  clock.now += 61000;
  const decision = store.decideApproval(task.id, { approved: true, actor: 'owner' });
  assert.equal(decision.ok, false);
  assert.equal(decision.error, 'APPROVAL_EXPIRED');
  assert.equal(store.runHistory(task.id).some(e => e.event === 'approval_expired'), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('STAGE3-8: an approved task becomes runnable; a denied one never runs', () => {
  const { dir, store } = makeStore();
  const approvedTask = store.createTask({ title: 'انتشار', requiresApproval: true });
  store.requestApproval(approvedTask.id);
  const decision = store.decideApproval(approvedTask.id, { approved: true, actor: 'owner' });
  assert.equal(decision.ok, true);
  assert.equal(decision.task.state, STATE.QUEUED);
  assert.equal(store.claimNext('worker-1').id, approvedTask.id);

  const deniedTask = store.createTask({ title: 'حذف داده', requiresApproval: true });
  store.requestApproval(deniedTask.id);
  const denied = store.decideApproval(deniedTask.id, { approved: false, actor: 'owner', reason: 'too risky' });
  assert.equal(denied.task.state, STATE.CANCELLED);
  assert.equal(store.claimNext('worker-2'), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('STAGE3-9: the run log detects tampering', () => {
  const { dir, store } = makeStore();
  store.createTask({ title: 'الف' });
  store.createTask({ title: 'ب' });
  const logPath = path.join(dir, 'durable-runs.ndjson');
  assert.equal(store.verifyRunLog().ok, true);

  const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
  const tampered = JSON.parse(lines[1]);
  tampered.event = 'succeeded';
  lines[1] = JSON.stringify(tampered);
  fs.writeFileSync(logPath, `${lines.join('\n')}\n`, 'utf-8');

  const verdict = store.verifyRunLog();
  assert.equal(verdict.ok, false);
  assert.ok(['HASH_MISMATCH', 'BROKEN_CHAIN'].includes(verdict.reason));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('STAGE3-11: the agent tool registry exposes durable task management', async () => {
  assert.ok(ToolManager.getAvailableTools().map(t => t.id).includes('durable_tasks'));

  const created = await ToolManager.invokeTool('durable_tasks', { action: 'create', title: 'مأموریت آزمایشی ماندگار' });
  assert.equal(created.success, true);
  assert.ok(created.result.task.id);
  assert.equal(created.result.task.state, STATE.QUEUED);

  const summary = await ToolManager.invokeTool('durable_tasks', { action: 'summary' });
  assert.equal(summary.success, true);
  assert.ok(summary.result.total >= 1);

  const verify = await ToolManager.invokeTool('durable_tasks', { action: 'verify_log' });
  assert.equal(verify.success, true);
  assert.equal(verify.result.ok, true);

  const history = await ToolManager.invokeTool('durable_tasks', { action: 'history', taskId: created.result.task.id });
  assert.equal(history.result.entries[0].event, 'created');
});

test('STAGE3-10: summary reports real state counts and runnable work', () => {
  const { dir, store } = makeStore();
  store.createTask({ title: 'یک' });
  const second = store.createTask({ title: 'دو' });
  store.claimNext('worker-1');

  const summary = store.summary();
  assert.equal(summary.total, 2);
  assert.equal(summary.counts[STATE.QUEUED], 1);
  assert.equal(summary.counts[STATE.RUNNING], 1);
  assert.equal(summary.runnable, 1);
  assert.equal(summary.log.ok, true);
  assert.ok(second.id);
  fs.rmSync(dir, { recursive: true, force: true });
});
