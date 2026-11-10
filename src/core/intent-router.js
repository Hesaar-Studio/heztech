'use strict';

/**
 * Intent router — the bridge between the chat composer and real execution.
 *
 * A request is either a concrete action (read a file, check a port, inspect a
 * drive, create/edit a file) or a conversation. Actions go straight to the tool
 * registry and return the real tool output plus an operation-log entry;
 * conversations go to the model router. Nothing here fabricates a result.
 */

const fs = require('fs');
const path = require('path');

const FILE_SEARCH = /(جستجو|جست‌وجو|پیدا\s*کن|بیاب|سرچ|search|find).{0,25}(فایل|فايل|files?|پوشه)|(فایل|فايل|files?).{0,25}(جستجو|پیدا|search)/i;
const READ_FILE = /(بخوان|بخوانم|رو\s*بخوان|محتوای\s*فایل|read).{0,40}(فایل|فايل|file)|(فایل|فايل|file).{0,60}(بخوان|بخوانم|read)/i;
const CHECK_PORT = /پورت\s*(\d{1,5})|port\s*(\d{1,5})/i;
const DISK_INFO = /(درایو|دیسک|فضا|drive|disk).{0,30}(بررسی|وضعیت|چقدر|چنده|فضای|check|space|info)|(فضای|وضعیت)\s*(درایو|دیسک)/i;
const LIST_DIR = /(پوشه|فولدر|directory|folder).{0,30}(بررسی|نمایش|لیست|فهرست|باز کن)|فهرست\s*(پوشه|فایل)/i;
const PROJECT = /(پروژه|project).{0,30}(بررسی|تحلیل|وضعیت|وابستگی|overview|deps)/i;
const WRITE_FILE = /(فایل|فايل|file).{0,30}(بساز|ایجاد کن|درست کن|create)|ساخت\s*(فایل|یک فایل)/i;
const EDIT_FILE = /(اصلاح|ویرایش|تغییر بده|edit).{0,40}(فایل|فايل|file)|(فایل|فايل|file).{0,40}(اصلاح|ویرایش)/i;

function quoted(text) {
  const m = text.match(/[«"“]([^»"”]{2,120})[»"”]/);
  return m ? m[1].trim() : null;
}

function extractQuery(text) {
  const q = quoted(text);
  if (q) return q;

  const cleaned = text
    .replace(/(لطفاً|لطفا|برای\s*من|برام|بکن|کنید)/g, ' ')
    .replace(/(جستجو|جست‌وجو|پیدا|بیاب|سرچ|search|find|بخوان|بخوانم|read)/gi, ' ')
    .replace(/(فایل|فايل|فایل‌ها|فايلها|files?|پوشه)/gi, ' ')
    .replace(/[؟?!.:،,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.split(' ').filter(Boolean)[0] || '';
}

function extractFilePath(text) {
  const q = quoted(text);
  if (q) return q;
  // «فایل README را بخوان» → اولین توکن بعد از واژهٔ فایل
  const after = text.match(/(?:فایل|فايل|file)\s+([^\s،؟?!:]+)/i);
  if (after) return after[1].replace(/^«|»$/g, '');
  return extractQuery(text);
}

function normalizeDigits(text) {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  return String(text).replace(/[۰-۹]/g, d => String(fa.indexOf(d)));
}

function classify(query) {
  const raw = String(query || '').trim();
  if (!raw) return { intent: 'chat' };
  const text = normalizeDigits(raw);

  const portMatch = text.match(CHECK_PORT);
  if (portMatch) {
    const port = parseInt(portMatch[1] || portMatch[2], 10);
    return { intent: 'tool', tool: 'check_port', args: { port }, reason: 'check-port' };
  }
  if (DISK_INFO.test(text)) {
    const drive = (text.match(/\b([A-Z])\s*[:؟]/i) || text.match(/درایو\s*([A-Za-z])/) || [])[1] || 'C';
    return { intent: 'tool', tool: 'disk_info', args: { drive }, reason: 'disk-info' };
  }
  if (READ_FILE.test(text)) {
    return { intent: 'tool', tool: 'read_file', args: { path: extractFilePath(text) }, reason: 'read-file' };
  }
  if (WRITE_FILE.test(text)) {
    return {
      intent: 'tool',
      tool: 'write_file',
      args: { name: quoted(text) || `arta-${Date.now()}.md`, content: 'فایل آزمایشی ساخته‌شده توسط ARTA.' },
      reason: 'write-file'
    };
  }
  if (EDIT_FILE.test(text)) {
    const editPath = extractFilePath(text);
    const parts = (text.match(/[«"“]([^»"”]{2,120})[»"”]/g) || []).map(s => s.replace(/[«»"“”]/g, '').trim());
    const findToken = parts[1] || (text.match(/عبارت\s+(\S+)/) || [])[1] || '';
    if (editPath && findToken) {
      return { intent: 'tool', tool: 'edit_file', args: { path: editPath, find: findToken, replace: parts[2] || '' }, reason: 'edit-file' };
    }
    // بدون عبارت مشخص، به مدل/عامل سپرده می‌شود که خودش ابزار را صدا بزند.
    return { intent: 'chat' };
  }
  if (LIST_DIR.test(text)) {
    return { intent: 'tool', tool: 'list_directory', args: { path: 'C:\\' }, reason: 'list-dir' };
  }
  if (PROJECT.test(text)) {
    const project = /openclaw/i.test(text) ? 'openclaw' : 'heztech';
    return { intent: 'tool', tool: 'project_overview', args: { project }, reason: 'project' };
  }
  if (FILE_SEARCH.test(text)) {
    return { intent: 'tool', tool: 'file_search', args: { query: extractQuery(text) }, reason: 'file-search' };
  }
  if (/(وضعیت\s*(سیستم|سخت[‌ ]?افزار|کامپیوتر)|مصرف\s*(رم|cpu|پردازنده)|system\s*(status|info)|cpu|ram)/i.test(text)) {
    return { intent: 'tool', tool: 'system_telemetry', args: {}, reason: 'system-status' };
  }
  return { intent: 'chat' };
}

function formatTelemetry(result) {
  const r = result || {};
  return [
    'وضعیت واقعی سیستم:',
    `• پردازنده: ${r.cpuUsagePercent ?? '—'}% (${r.cpuCores || '—'} هسته)`,
    `• حافظه: ${r.usedMemoryGB ?? '—'} از ${r.totalMemoryGB ?? '—'} گیگابایت (${r.memoryUsagePercent ?? '—'}%)`,
    `• سیستم‌عامل: ${r.platform || '—'} (${r.arch || '—'})`,
    `• روشن بودن سیستم: ${r.uptimeHours ?? '—'} ساعت`
  ].join('\n');
}

function formatFileSearch(result) {
  const r = result || {};
  const matches = Array.isArray(r.matches) ? r.matches : [];
  if (!matches.length) {
    return `فایلی با عبارت «${r.query || '—'}» در مسیرهای مجاز پیدا نشد. (${r.scanned ?? 0} مورد بررسی شد)`;
  }
  const lines = matches.slice(0, 15).map(m => `• ${m.name} — ${m.path}`);
  return [
    `${matches.length} فایل پیدا شد (عبارت: «${r.query}»${r.truncated ? '، نتایج محدود شد' : ''}):`,
    ...lines
  ].join('\n');
}

function formatDisk(result) {
  const r = result || {};
  const u = r.usage || {};
  const folders = (r.rootFolders || []).slice(0, 18).join('، ');
  return [
    `درایو ${r.drive}:`,
    `• کل: ${u.totalGB ?? '—'} GB | آزاد: ${u.freeGB ?? '—'} GB | مصرف: ${u.usedGB ?? '—'} GB (${u.usedPercent ?? '—'}%)`,
    folders ? `• پوشه‌های ریشه: ${folders}` : ''
  ].filter(Boolean).join('\n');
}

function formatReadFile(result) {
  const r = result || {};
  return [
    `فایل: ${r.path} (${r.sizeBytes ?? 0} بایت${r.truncated ? '، ۴۰۰۰ کاراکتر اول' : ''})`,
    '---',
    String(r.content || '').trim()
  ].join('\n');
}

function formatPort(result) {
  const r = result || {};
  if (!r.listening) return `پورت ${r.port}: هیچ پردازه‌ای روی آن گوش نمی‌دهد (بسته).`;
  return [
    `پورت ${r.port}: در حال شنیدن ✅`,
    ...r.listeners.map(l => `• ${l.local} — PID ${l.pid} (${l.processName || 'نامشخص'})`)
  ].join('\n');
}

function formatProject(result) {
  const r = result || {};
  return [
    `پروژهٔ ${r.project} (${r.root}):`,
    `• نام پکیج: ${r.name} | نسخه: ${r.version}`,
    `• وابستگی‌ها: ${(r.dependencies || []).length} مورد | devDependency: ${(r.devDependencies || []).length} مورد`,
    `• اسکریپت‌ها: ${(r.scripts || []).slice(0, 8).join('، ')}${(r.scripts || []).length > 8 ? ' و…' : ''}`,
    `• node_modules: ${r.nodeModulesInstalled ? 'نصب است ✅' : 'نصب نیست ❌'}`,
    `• آخرین تغییر package.json: ${r.packageJsonModified}`
  ].join('\n');
}

function formatWrite(result) {
  return `فایل ساخته شد و وجودش تأیید شد:\n• ${result.path} (${result.sizeBytes} بایت)`;
}

function formatEdit(result) {
  return [
    'فایل اصلاح شد:',
    `• مسیر: ${result.path}`,
    `• ${result.replaced} مورد از ${result.occurrences} جایافت جایگزین شد`,
    `• پشتیبان: ${result.backup}`,
    `• حجم جدید: ${result.newSizeBytes} بایت`
  ].join('\n');
}

function formatListDir(result) {
  const r = result || {};
  const dirs = (r.items || []).filter(i => i.type === 'dir').slice(0, 15).map(i => i.name);
  const files = (r.items || []).filter(i => i.type === 'file').slice(0, 10).map(i => i.name);
  const disk = r.disk ? ` | کل ${r.disk.totalGB}GB، آزاد ${r.disk.freeGB}GB` : '';
  return [
    `مسیر: ${r.path} (${r.count} مورد${r.truncated ? '، محدود' : ''}${disk})`,
    dirs.length ? `• پوشه‌ها: ${dirs.join('، ')}` : '',
    files.length ? `• فایل‌ها: ${files.join('، ')}` : ''
  ].filter(Boolean).join('\n');
}

const FORMATTERS = {
  system_telemetry: formatTelemetry,
  file_search: formatFileSearch,
  disk_info: formatDisk,
  read_file: formatReadFile,
  check_port: formatPort,
  project_overview: formatProject,
  write_file: formatWrite,
  edit_file: formatEdit,
  list_directory: formatListDir
};

function loadDataDir() {
  return path.resolve(process.env.HEZTECH_DATA_DIR || 'C:\\Users\\Green\\openclaw\\vault');
}

function logOperation(entry) {
  try {
    const file = path.join(loadDataDir(), 'operations.ndjson');
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf-8');
  } catch (e) {}
}

class IntentRouter {
  constructor({ toolManager, dataDir } = {}) {
    this.toolManager = toolManager;
    this.dataDir = dataDir || loadDataDir();
  }

  classify(query) {
    return classify(query);
  }

  async execute(intent, { signal } = {}) {
    if (!intent || intent.intent !== 'tool') return { handled: false };
    if (!this.toolManager) throw new Error('TOOL_MANAGER_REQUIRED');

    const startedAt = Date.now();
    let response;
    try {
      response = await this.toolManager.invokeTool(intent.tool, intent.args || {}, { signal });
    } catch (err) {
      response = { success: false, error: err.message };
    }
    const ok = Boolean(response && response.success);
    const durationMs = Date.now() - startedAt;

    logOperation({
      at: new Date().toISOString(),
      tool: intent.tool,
      args: intent.args || {},
      ok,
      durationMs,
      error: ok ? null : String(response?.error || 'UNKNOWN').slice(0, 300)
    });

    if (!ok) {
      return {
        handled: true,
        ok: false,
        tool: intent.tool,
        reply: `اجرای «${intent.tool}» ناموفق بود: ${String(response?.error || 'خطای نامشخص').slice(0, 300)}`,
        error: response?.error
      };
    }

    const formatter = FORMATTERS[intent.tool];
    const reply = formatter
      ? formatter(response.result)
      : `نتیجهٔ ${intent.tool}: ${JSON.stringify(response.result).slice(0, 800)}`;

    return { handled: true, ok: true, tool: intent.tool, reply, result: response.result, durationMs };
  }
}

module.exports = { IntentRouter, classify, extractQuery, logOperation, formatFileSearch, formatTelemetry };
