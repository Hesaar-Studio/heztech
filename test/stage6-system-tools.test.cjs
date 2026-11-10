'use strict';

/** Acceptance-style tests for real Windows tool access from the chat layer. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heztech-systools-'));
process.env.HEZTECH_DATA_DIR = dataDir;
const searchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heztech-systools-search-'));
process.env.HEZTECH_FILE_SEARCH_ROOTS = searchDir;

const { classify } = require('../src/core/intent-router');
const ToolManager = require('../src/core/tools');

test.after(() => {
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(searchDir, { recursive: true, force: true }); } catch (e) {}
});

test('SYS-1: «درایو C را بررسی کن» routes to real disk inspection', () => {
  const intent = classify('درایو C را بررسی کن');
  assert.equal(intent.tool, 'disk_info');
  assert.equal(intent.args.drive.toUpperCase(), 'C');
});

test('SYS-2: «فایل README را بخوان» routes to a real file read', () => {
  const intent = classify('فایل README را بخوان');
  assert.equal(intent.tool, 'read_file');
  assert.ok(intent.args.path);
});

test('SYS-3: «پورت ۱۸۷۸۹ را بررسی کن» understands Persian digits', () => {
  const intent = classify('پورت ۱۸۷۸۹ را بررسی کن');
  assert.equal(intent.tool, 'check_port');
  assert.equal(intent.args.port, 18789);
});

test('SYS-4: «پروژه HezTech را بررسی کن» routes to project overview', () => {
  const intent = classify('پروژه HezTech را بررسی کن');
  assert.equal(intent.tool, 'project_overview');
  assert.equal(intent.args.project, 'heztech');
});

test('SYS-5: «یک فایل آزمایشی بساز» routes to a real file creation', () => {
  const intent = classify('یک فایل آزمایشی بساز');
  assert.equal(intent.tool, 'write_file');
  assert.ok(intent.args.name);
});

test('SYS-6: disk_info returns real usage for C:', async () => {
  const res = await ToolManager.invokeTool('disk_info', { drive: 'C' });
  assert.equal(res.success, true);
  assert.ok(res.result.usage.totalGB > 0);
  assert.ok(res.result.usage.freeGB > 0);
  assert.ok(Array.isArray(res.result.rootFolders) && res.result.rootFolders.length > 0);
});

test('SYS-7: check_port reports the real state of a listening port', async () => {
  const http = require('node:http');
  const server = http.createServer(() => {});
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;
  try {
    const res = await ToolManager.invokeTool('check_port', { port });
    assert.equal(res.success, true);
    assert.equal(res.result.listening, true);
    assert.ok(res.result.listeners[0].pid > 0);
    assert.ok(res.result.listeners[0].processName);
  } finally {
    server.close();
  }

  const closed = await ToolManager.invokeTool('check_port', { port: 59999 });
  assert.equal(closed.result.listening, false);
});

test('SYS-8: read_file reads a real file and refuses protected paths', async () => {
  const sample = path.join(searchDir, 'note.md');
  fs.writeFileSync(sample, '# سلام\nاین یک فایل واقعی است.', 'utf-8');

  const res = await ToolManager.invokeTool('read_file', { path: sample });
  assert.equal(res.success, true);
  assert.match(res.result.content, /فایل واقعی/);

  const protectedAttempt = await ToolManager.invokeTool('read_file', { path: path.join(dataDir, 'config.json') });
  assert.equal(protectedAttempt.success, false);
});

test('SYS-9: write_file creates a real file and edit_file modifies it with a backup', async () => {
  const created = await ToolManager.invokeTool('write_file', { name: 'acceptance.md', content: 'نسخهٔ اول' });
  assert.equal(created.success, true);
  assert.ok(fs.existsSync(created.result.path));

  const edited = await ToolManager.invokeTool('edit_file', { path: created.result.path, find: 'اول', replace: 'دوم' });
  assert.equal(edited.success, true);
  assert.equal(edited.result.replaced, 1);
  assert.ok(fs.existsSync(edited.result.backup));
  assert.match(fs.readFileSync(created.result.path, 'utf-8'), /نسخهٔ دوم/);
});

test('SYS-10: project_overview reports the real HezTech package', async () => {
  const res = await ToolManager.invokeTool('project_overview', { project: 'heztech' });
  assert.equal(res.success, true);
  assert.equal(res.result.name, 'jarvis-command-center');
  assert.equal(res.result.version, '2.0.3');
  assert.ok(res.result.dependencies.length > 0);
});
