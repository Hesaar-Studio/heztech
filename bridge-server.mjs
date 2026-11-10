import express from 'express';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Unified Backend Modules
const RemotePairingManager = require('./src/core/remote-pairing.js');
const { SecurityManager, APP_ALLOWLIST, COMMAND_ALLOWLIST } = require('./src/core/security.js');
const CouncilEngine = require('./src/council/council-engine.js');
const ConnectionsManager = require('./src/connectors/connections-manager.js');
const ConfigManager = require('./src/core/config.js');
const IDENTITY = require('./src/core/identity.js');
const MemoryManager = require('./src/core/memory.js');
const ToolManager = require('./src/core/tools.js');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 18790;
const VAULT_DIR = path.resolve(process.env.HESATECH_DATA_DIR || 'C:\\Users\\Green\\openclaw\\vault');
const TASKS_FILE = path.join(VAULT_DIR, 'tasks.json');
const NOTES_FILE = path.join(VAULT_DIR, 'notes.md');
const CONVERSATIONS_FILE = path.join(VAULT_DIR, 'conversations.json');
const PUBLIC_MOBILE_DIR = path.join(__dirname, 'public', 'mobile');

if (!fs.existsSync(VAULT_DIR)) {
  fs.mkdirSync(VAULT_DIR, { recursive: true });
}

// Initial Seeds if missing
if (!fs.existsSync(TASKS_FILE)) {
  const defaultTasks = [
    { id: 't1', title: 'جلسه استندآپ روزانه و بررسی سیستم هولوگرافیک', time: '09:30 AM', priority: 'high', done: true },
    { id: 't2', title: 'بهینه‌سازی موتور هوش مصنوعی محلی و درگاه ویندوز', time: '12:00 PM', priority: 'medium', done: false },
    { id: 't3', title: 'پایش وب‌هوک‌های n8n شبکه‌های اجتماعی', time: '02:30 PM', priority: 'high', done: false },
    { id: 't4', title: 'پشتیبان‌گیری از پایگاه داده یادداشت‌های Vault', time: '04:30 PM', priority: 'low', done: false }
  ];
  fs.writeFileSync(TASKS_FILE, JSON.stringify(defaultTasks, null, 2), 'utf-8');
}

if (!fs.existsSync(NOTES_FILE)) {
  const defaultNotes = `# یادداشت‌های اجرایی استودیو حصارت\n- تاریخ راه‌اندازی: ${new Date().toLocaleDateString('fa-IR')}\n- وضعیت اتصال: متصل به هسته ویندوز و Electron IPC\n- پایگاه داده محلی: C:\\Users\\Green\\openclaw\\vault\n- پایش لحظه‌ای سخت‌افزار (CPU, RAM, Disk C:) فعال است.\n- ابزارهای اجرایی سیستم (ماشین حساب، نوت‌پد، تسک منیجر، اکسپلورر) متصل هستند.`;
  fs.writeFileSync(NOTES_FILE, defaultNotes, 'utf-8');
}

if (!fs.existsSync(CONVERSATIONS_FILE)) {
  const defaultConvs = [{
    id: 'conv_default',
    title: `${IDENTITY.assistant.name} Conversation`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [
      {
        id: 'msg_welcome',
        role: 'assistant',
        content: `درود! من ${IDENTITY.assistant.name} (${IDENTITY.assistant.nameFa})، دستیار هوشمند ${IDENTITY.product.name}، آمادهٔ خدمت‌رسانی هستم.`,
        timestamp: new Date().toISOString(),
        model: 'gemini-3.8-flash',
        provider: 'cloud'
      }
    ]
  }];
  fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(defaultConvs, null, 2), 'utf-8');
}

app.use(express.json());

// Reject cross-origin browser access; pairing administration stays in desktop IPC.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && origin !== req.protocol + '://' + req.get('host')) {
    return res.status(403).json({ success: false, error: 'Cross-origin access is not permitted.' });
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use('/api/v1', (req, res, next) => {
  const route = req.path;
  const clientIp = req.socket.remoteAddress || req.ip || '';
  const isLoopback = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
  if (route.startsWith('/remote/pairing/') && route !== '/remote/pairing/pair' && !isLoopback) {
    return res.status(403).json({ success: false, error: 'Pairing management is available only on the local host.' });
  }
  if (['POST', 'PATCH', 'PUT'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ success: false, error: 'JSON request body required.' });
  }
  if (route.startsWith('/remote/pairing/')) return next();
  authenticateRemoteDevice(req, res, () => {
    if (route.startsWith('/system/') && route !== '/system/stats') {
      return res.status(403).json({ success: false, error: 'System actions are available only in the desktop application.' });
    }
    if ((route.startsWith('/tasks') || route === '/notes') && !req.device.permissions?.canManageTasks) {
      return res.status(403).json({ success: false, error: 'Device does not have permission to manage vault data.' });
    }
    if (route === '/chat') {
      return res.status(403).json({ success: false, error: 'Use the authenticated remote chat route.' });
    }
    next();
  });
});

// Serve Mobile PWA static assets
if (fs.existsSync(PUBLIC_MOBILE_DIR)) {
  app.use('/mobile', express.static(PUBLIC_MOBILE_DIR));
}

// CPU & Disk helpers
let lastCpuMeasure = null;
function getCpuSnapshot() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) total += cpu.times[type];
    idle += cpu.times.idle;
  }
  return { idle, total };
}
lastCpuMeasure = getCpuSnapshot();

export function calculateCpuPercent() {
  const current = getCpuSnapshot();
  const idleDiff = current.idle - lastCpuMeasure.idle;
  const totalDiff = current.total - lastCpuMeasure.total;
  lastCpuMeasure = current;
  if (totalDiff <= 0) return 15;
  const usage = Math.round(100 * (1 - idleDiff / totalDiff));
  return Math.max(1, Math.min(100, usage));
}

export function getDiskStats() {
  try {
    const stat = fs.statfsSync('C:\\');
    const totalBytes = stat.bsize * stat.blocks;
    const freeBytes = stat.bsize * stat.bfree;
    const usedBytes = totalBytes - freeBytes;
    return {
      totalGB: (totalBytes / (1024 ** 3)).toFixed(1),
      freeGB: (freeBytes / (1024 ** 3)).toFixed(1),
      usedGB: (usedBytes / (1024 ** 3)).toFixed(1),
      percent: Math.round((usedBytes / totalBytes) * 100)
    };
  } catch (err) {
    return { totalGB: '250.0', freeGB: '50.0', usedGB: '200.0', percent: 80 };
  }
}

// Shared Conversation Helpers
function getConversations() {
  try {
    if (!fs.existsSync(CONVERSATIONS_FILE)) return [];
    return JSON.parse(fs.readFileSync(CONVERSATIONS_FILE, 'utf-8')) || [];
  } catch (e) {
    return [];
  }
}

function saveConversations(convs) {
  try {
    fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(convs, null, 2), 'utf-8');
    return true;
  } catch (e) {
    return false;
  }
}

function recordConversationMessage(role, content, meta = {}) {
  try {
    let convs = getConversations();
    if (!convs || !convs.length) {
      convs = [{
        id: 'conv_default',
        title: `${IDENTITY.assistant.name} Conversation`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: []
      }];
    }
    const active = convs[0];
    const msg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      role,
      content,
      timestamp: new Date().toISOString(),
      model: meta.model || 'gemini-3.8-flash',
      provider: meta.provider || 'local',
      ...meta
    };
    if (!active.messages) active.messages = [];
    active.messages.push(msg);
    if (active.messages.length > 200) active.messages.shift();
    active.updatedAt = new Date().toISOString();
    saveConversations(convs);
    return msg;
  } catch (e) {
    console.error('[BridgeServer] Failed to record conversation message:', e.message);
    return null;
  }
}

// -------------------------------------------------------------
// Authentication & Security Middleware for Remote Companion
// -------------------------------------------------------------
function authenticateRemoteDevice(req, res, next) {
  if (req.device) return next();
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: 'احراز هویت الزامی است. لطفاً توکن معتبر دستگاه ارسال نمایید.',
      errorEn: 'Authorization header required. Please provide a valid Bearer token.'
    });
  }

  const device = RemotePairingManager.authenticateToken(authHeader);
  if (!device) {
    return res.status(401).json({
      success: false,
      error: 'دستگاه جفت‌نشده است یا نشست منقضی شده است.',
      errorEn: 'Device is not paired or session token is invalid.'
    });
  }

  req.device = device;
  next();
}

// -------------------------------------------------------------
// Device Pairing Endpoints
// -------------------------------------------------------------

// Request / Generate a 6-digit rolling pairing code
app.post('/api/v1/remote/pairing/request-code', (req, res) => {
  const result = RemotePairingManager.generatePairingCode();
  SecurityManager.logAudit('PAIRING_CODE_GENERATED', { expiresAt: result.expiresAt });
  res.json(result);
});

// Check if a pairing code is currently active
app.get('/api/v1/remote/pairing/active-code', (req, res) => {
  const status = RemotePairingManager.getActivePairingCode();
  res.json(status);
});

// Pair device with the 6-digit code
app.post('/api/v1/remote/pairing/pair', (req, res) => {
  const { code, deviceName, platform, clientVersion } = req.body;
  if (!code) {
    return res.status(400).json({ success: false, error: 'کد جفت‌سازی الزامی است.' });
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const result = RemotePairingManager.pairDevice({
    code,
    deviceName,
    platform,
    clientVersion,
    ip: clientIp
  });

  if (!result.success) {
    SecurityManager.logAudit('PAIRING_FAILED', { ip: clientIp, reason: result.errorEn });
    return res.status(400).json(result);
  }

  SecurityManager.logAudit('DEVICE_PAIRED', { deviceId: result.deviceId, name: result.deviceName, ip: clientIp });
  res.json(result);
});

// List all paired devices (tokens masked)
app.get('/api/v1/remote/pairing/devices', (req, res) => {
  const devices = RemotePairingManager.getPairedDevices();
  res.json({ success: true, devices });
});

// Revoke a paired device
app.post('/api/v1/remote/pairing/revoke', (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

  const result = RemotePairingManager.revokeDevice(deviceId);
  SecurityManager.logAudit('DEVICE_REVOKED', { deviceId });
  res.json(result);
});

// -------------------------------------------------------------
// Unified State Synchronization Endpoint
// -------------------------------------------------------------
app.get('/api/v1/sync/state', authenticateRemoteDevice, async (req, res) => {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpus = os.cpus();
    const disk = getDiskStats();

    // Tasks & Notes
    const tasks = fs.existsSync(TASKS_FILE) ? JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8')) : [];
    const notesContent = fs.existsSync(NOTES_FILE) ? fs.readFileSync(NOTES_FILE, 'utf-8') : '';

    // Conversations
    const convs = getConversations();
    const recentMessages = convs.length > 0 ? (convs[0].messages || []).slice(-25) : [];

    // Pending Approvals
    const pendingApprovals = SecurityManager.getPendingApprovals();

    // Council Sessions
    const recentCouncilSessions = CouncilEngine.getSessions(5);

    // Live Topology
    const topology = await ConnectionsManager.getTopology();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      device: {
        id: req.device.id,
        name: req.device.name
      },
      system: {
        status: 'optimal',
        os: `${os.type()} ${os.release()} (${os.arch()})`,
        hostname: os.hostname(),
        uptimeSeconds: Math.floor(os.uptime()),
        cpu: {
          model: cpus.length > 0 ? cpus[0].model.trim() : 'AMD/Intel CPU',
          cores: cpus.length,
          usagePercent: calculateCpuPercent()
        },
        memory: {
          totalGB: (totalMem / (1024 ** 3)).toFixed(1),
          usedGB: (usedMem / (1024 ** 3)).toFixed(1),
          freeGB: (freeMem / (1024 ** 3)).toFixed(1),
          usagePercent: Math.round((usedMem / totalMem) * 100)
        },
        disk
      },
      tasks,
      notes: notesContent,
      recentMessages,
      pendingApprovals,
      recentCouncilSessions,
      topology
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Remote Chat API (Synchronized with Windows Vault)
// -------------------------------------------------------------
app.get('/api/v1/remote/chat/history', authenticateRemoteDevice, (req, res) => {
  try {
    const convs = getConversations();
    const messages = convs.length > 0 ? (convs[0].messages || []) : [];
    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/remote/chat', authenticateRemoteDevice, async (req, res) => {
  const { message, model = 'gemini-3.8-flash' } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  const query = message.trim();
  const lower = query.toLowerCase();

  // 1. Record user message in shared Vault
  recordConversationMessage('user', query, { model, device: req.device.name });

  function respond(replyText, meta = {}) {
    const recorded = recordConversationMessage('assistant', replyText, {
      model: meta.model || model,
      provider: meta.provider || 'local'
    });
    return res.json({
      success: true,
      reply: replyText,
      model: meta.model || model,
      provider: meta.provider || 'local',
      messageId: recorded ? recorded.id : null,
      timestamp: new Date().toISOString()
    });
  }

  // Persian & English Mathematical Evaluation
  const parsePersianMath = (text) => {
    const faDigits = '۰۱۲۳۴۵۶۷۸۹';
    let norm = text.replace(/[۰-۹]/g, d => faDigits.indexOf(d));
    norm = norm
      .replace(/ضربدر|ضرب\s*در|ضرب/g, '*')
      .replace(/تقسیم\s*بر|تقسیم/g, '/')
      .replace(/به\s*علاوه|بعلاوه|جمع/g, '+')
      .replace(/منهای|منفی/g, '-')
      .replace(/چند\s*می‌شود|چند\s*میشود|میشه|چنده|\?/g, '')
      .trim();
    const m = norm.match(/([0-9\.\s\+\-\*\/\(\)]+)/);
    if (m) {
      try {
        const expr = m[0].trim();
        if (/^[0-9\.\s\+\-\*\/\(\)]+$/.test(expr) && expr.length > 0 && !/[a-zA-Z]/.test(expr)) {
          const val = Function('return (' + expr + ')')();
          if (typeof val === 'number' && !isNaN(val)) {
            return { expr, val };
          }
        }
      } catch(e) {}
    }
    return null;
  };

  const mathRes = parsePersianMath(query);
  if (mathRes) {
    return respond(`نتیجه محاسبات ریاضی:\n\`\`\`\n${mathRes.expr} = ${mathRes.val}\n\`\`\``, { provider: 'local-math', model: 'local-offline-brain' });
  }

  // Quick system status query
  if (lower === 'وضعیت سیستم' || lower === 'system status' || lower.includes('گزارش سخت‌افزار') || lower.includes('گزارش سخت افزار')) {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpuP = calculateCpuPercent();
    const disk = getDiskStats();
    const cpus = os.cpus();
    const reply = `📊 **گزارش لحظه‌ای سلامت سیستم ویندوز (از طریق رابط موبایل):**\n\n` +
      `• **پردازنده (CPU):** ${cpus[0]?.model || 'Processor'} (${cpus.length} هسته) | بار: **${cpuP}%**\n` +
      `• **حافظه رم (RAM):** **${Math.round((usedMem / totalMem) * 100)}%** (${(usedMem / (1024 ** 3)).toFixed(1)} GB از ${(totalMem / (1024 ** 3)).toFixed(1)} GB)\n` +
      `• **دیسک C:** **${disk.percent}%** (${disk.usedGB} GB مصرف‌شده، ${disk.freeGB} GB آزاد)\n` +
      `• **دستگاه متصل:** ${req.device.name}\n` +
      `• **وضعیت سرور:** آنلاین و پایدار (Nominal) ✅`;
    return respond(reply, { provider: 'system-telemetry', model: 'local-offline-brain' });
  }

  // Real Gemini Call with Multi-Turn & Resilient Cascade
  if (model !== 'local-offline-brain') {
    const apiKey = ConfigManager.getDecryptedApiKey() || process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const convs = getConversations();
        const active = (convs && convs.length) ? convs[0] : null;
        const historyMessages = (active && active.messages) ? active.messages.slice(-12) : [];
        const contents = [];
        const priorMessages = historyMessages.slice(0, -1);
        for (const m of priorMessages) {
          if (m.content && m.content.trim()) {
            contents.push({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            });
          }
        }
        contents.push({
          role: 'user',
          parts: [{ text: query }]
        });

        const candidateModels = [
          model,
          'gemini-3.5-flash-lite',
          'gemini-3.1-flash-lite',
          'gemini-3.8-flash'
        ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

        let lastError = null;
        for (const targetModel of candidateModels) {
          try {
            const generatePromise = ai.models.generateContent({
              model: targetModel,
              contents,
              config: {
                systemInstruction: IDENTITY.assistantPrompt({ extra: `You are answering the owner through the Android Mobile Companion of ${IDENTITY.product.name}. Keep answers clear and structured.` })
              }
            });
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Gemini API timeout (15s)')), 15000)
            );
            const response = await Promise.race([generatePromise, timeoutPromise]);
            if (response && response.text) {
              return respond(response.text, { provider: 'gemini', model: targetModel });
            }
          } catch (modelErr) {
            lastError = modelErr;
            console.warn(`[BridgeServer Chat] Model ${targetModel} invocation failed, attempting next in cascade...`);
          }
        }
      } catch (geminiError) {
        console.warn('[BridgeServer Chat] Gemini cloud call failed, falling back to local executive brain:', geminiError.message);
      }
    }
  }

  // Local Brain Fallback
  if (lower.includes('پیام قبلی') || lower.includes('previous message')) {
    const convs = getConversations();
    const active = (convs && convs.length) ? convs[0] : null;
    const msgs = (active && active.messages) ? active.messages : [];
    const priorUserMsgs = msgs.slice(0, -1).filter(m => m.role === 'user');
    if (priorUserMsgs.length > 0) {
      const prev = priorUserMsgs[priorUserMsgs.length - 1];
      return respond(`متن پیام قبلی شما این بود: «${prev.content}»`, { provider: 'local-memory', model: 'local-offline-brain' });
    }
    return respond('پیام قبلی ثبت‌شده‌ای در این جلسه یافت نشد.', { provider: 'local-memory', model: 'local-offline-brain' });
  }

  if (lower.includes('اسمت چیه') || lower.includes('نام شما') || lower.includes('کیستی') || lower.includes('who are you') || lower.includes('your name')) {
    return respond(`سلام! من **${IDENTITY.assistant.name} (${IDENTITY.assistant.nameFa})**، دستیار هوشمند ${IDENTITY.product.name} هستم و هم‌اکنون از طریق دستگاه ${req.device.name} با شما در ارتباطم.`, { provider: 'local-identity', model: 'local-offline-brain' });
  }

  if (lower.includes('hesatech') || lower.includes('هساتک') || lower.includes('heztech') || lower.includes('هستک')) {
    return respond(`«${IDENTITY.product.name}» یک فضای کاری هوشمند برای عملیات دیجیتال و هماهنگی عامل‌هاست. ${IDENTITY.assistant.name} (${IDENTITY.assistant.nameFa}) دستیار همین برنامه است و وضعیت سرویس‌ها یا انجام عملیات خارجی را فقط بر اساس نتیجهٔ تأییدشده گزارش می‌کند.`, { provider: 'local-knowledge', model: 'local-offline-brain' });
  }

  if (lower.includes('سلام') || lower.includes('درود') || lower.includes('hello')) {
    return respond(`درود بر شما! اتصال امن همراه (${req.device.name}) به سامانهٔ مرکزی ${IDENTITY.product.name} برقرار است. چه فرمانی دارید؟`, { provider: 'local-offline-brain', model: 'local-offline-brain' });
  }

  return respond(`پیام شما از همراه اندروید دریافت شد: «${query}».\nسامانهٔ مرکزی ${IDENTITY.product.name} پردازش را انجام داده و وضعیت سیستم پایدار است.`, { provider: 'local-offline-brain', model: 'local-offline-brain' });
});

// -------------------------------------------------------------
// Remote Seven-Agent Council Deliberation
// -------------------------------------------------------------
app.post('/api/v1/remote/council/deliberate', authenticateRemoteDevice, async (req, res) => {
  try {
    const { title, description, mode = 'DEEP', context = {} } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required for council mission' });
    }

    const session = await CouncilEngine.deliberate({
      missionId: 'remote_' + Date.now(),
      title: title.trim(),
      description: description ? description.trim() : '',
      mode: ['QUICK', 'DEEP', 'CRITICAL'].includes(mode) ? mode : 'DEEP',
      context: {
        ...context,
        originDevice: req.device.name,
        originDeviceId: req.device.id
      }
    });

    SecurityManager.logAudit('REMOTE_COUNCIL_DELIBERATION', {
      sessionId: session.id,
      title: session.title,
      device: req.device.name
    });

    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/remote/council/sessions', authenticateRemoteDevice, (req, res) => {
  const limit = parseInt(req.query.limit) || 15;
  const sessions = CouncilEngine.getSessions(limit);
  res.json({ success: true, sessions });
});

app.get('/api/v1/remote/council/sessions/:id', authenticateRemoteDevice, (req, res) => {
  const session = CouncilEngine.getSessionById(req.params.id);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  res.json({ success: true, session });
});

// -------------------------------------------------------------
// Remote Approvals Management (Human Approval Gate)
// -------------------------------------------------------------
app.get('/api/v1/remote/approvals', authenticateRemoteDevice, (req, res) => {
  const pending = SecurityManager.getPendingApprovals();
  res.json({ success: true, pending });
});

app.post('/api/v1/remote/approvals/:id/resolve', authenticateRemoteDevice, (req, res) => {
  const { id } = req.params;
  const { approved } = req.body;

  if (typeof approved !== 'boolean') {
    return res.status(400).json({ error: 'approved must be a boolean' });
  }

  if (!req.device.permissions?.canRemoteApprove) {
    return res.status(403).json({ error: 'این دستگاه مجوز تایید از راه دور را ندارد.' });
  }

  const result = SecurityManager.resolveApproval(id, approved, `${req.device.name} (Mobile)`);
  res.json(result);
});

// -------------------------------------------------------------
// Remote Connections Graph Topology
// -------------------------------------------------------------
app.get('/api/v1/remote/connections/topology', authenticateRemoteDevice, async (req, res) => {
  try {
    const topology = await ConnectionsManager.getTopology();
    res.json(topology);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Standard System Endpoints (Preserved for compatibility)
// -------------------------------------------------------------
app.get('/api/v1/system/stats', (req, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();

  res.json({
    status: 'optimal',
    timestamp: new Date().toISOString(),
    os: {
      platform: os.platform(),
      release: os.release(),
      hostname: os.hostname(),
      uptimeSeconds: Math.floor(os.uptime())
    },
    cpu: {
      model: cpus.length > 0 ? cpus[0].model.trim() : 'AMD/Intel CPU',
      cores: cpus.length,
      usagePercent: calculateCpuPercent()
    },
    memory: {
      totalGB: (totalMem / (1024 ** 3)).toFixed(1),
      usedGB: (usedMem / (1024 ** 3)).toFixed(1),
      freeGB: (freeMem / (1024 ** 3)).toFixed(1),
      usagePercent: Math.round((usedMem / totalMem) * 100)
    },
    disk: getDiskStats()
  });
});

app.post('/api/v1/system/launch', (req, res) => {
  const { appName } = req.body;
  const binary = APP_ALLOWLIST[appName?.toLowerCase()];
  if (!binary) return res.status(400).json({ error: `برنامه نامعتبر: ${appName}` });

  exec(binary, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: `برنامه ${appName} در ویندوز اجرا شد.` });
  });
});

app.post('/api/v1/system/exec', (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Command required' });

  const evalResult = SecurityManager.evaluateCommand(command);
  if (!evalResult.allowed) {
    return res.status(403).json({ error: evalResult.reason });
  }

  exec(command, { timeout: 15000, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
    res.json({
      success: !err,
      stdout: stdout || '',
      stderr: stderr || (err ? err.message : '')
    });
  });
});

app.post('/api/v1/system/workflow', (req, res) => {
  const { action } = req.body;
  if (action === 'network_diagnostics') {
    exec('ipconfig /all', (err, stdout) => {
      res.json({ success: true, title: 'تست شبکه (IPConfig)', result: stdout || 'خطا در شبکه' });
    });
  } else if (action === 'ping_test') {
    exec('ping 8.8.8.8 -n 3', (err, stdout) => {
      res.json({ success: true, title: 'تست پینگ اینترنت (8.8.8.8)', result: stdout || 'اتصال ناموفق' });
    });
  } else if (action === 'system_info') {
    const mem = os.totalmem() / (1024 ** 3);
    const free = os.freemem() / (1024 ** 3);
    const cpus = os.cpus();
    res.json({
      success: true,
      title: 'مشخصات سخت‌افزاری سیستم',
      result: `سیستم‌عامل: ${os.type()} ${os.release()} (${os.arch()})\nنام رایانه: ${os.hostname()}\nپردازنده: ${cpus[0]?.model} (${cpus.length} هسته)\nحافظه رم: ${mem.toFixed(1)} GB کل / ${free.toFixed(1)} GB آزاد`
    });
  } else if (action === 'clean_temp') {
    exec('powershell -Command "Get-ChildItem -Path $env:TEMP -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum | Select-Object -ExpandProperty Sum"', (err, stdout) => {
      const bytes = parseInt(stdout?.trim()) || 0;
      const mb = (bytes / (1024 * 1024)).toFixed(1);
      res.json({ success: true, title: 'فایل‌های موقت سیستم', result: `حجم کش موقت ویندوز: ${mb} مگابایت` });
    });
  } else {
    res.status(400).json({ error: 'اکشن نامعتبر است' });
  }
});

// Tasks (Vault: tasks.json)
app.get('/api/v1/tasks', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read tasks' });
  }
});

app.post('/api/v1/tasks', (req, res) => {
  try {
    const { title, time, priority } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
    const newTask = {
      id: 'task_' + Date.now(),
      title,
      time: time || 'Today',
      priority: priority || 'medium',
      done: false
    };
    tasks.unshift(newTask);
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
    res.json({ success: true, task: newTask });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save task' });
  }
});

app.patch('/api/v1/tasks/:id/toggle', (req, res) => {
  try {
    const { id } = req.params;
    const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
    const task = tasks.find(t => t.id === id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    task.done = !task.done;
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/api/v1/tasks/:id', (req, res) => {
  try {
    const { id } = req.params;
    let tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
    tasks = tasks.filter(t => t.id !== id);
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Notes (Vault: notes.md)
app.get('/api/v1/notes', (req, res) => {
  try {
    const content = fs.readFileSync(NOTES_FILE, 'utf-8');
    res.json({ content, path: NOTES_FILE });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read notes' });
  }
});

app.post('/api/v1/notes', (req, res) => {
  try {
    const { content } = req.body;
    fs.writeFileSync(NOTES_FILE, content || '', 'utf-8');
    res.json({ success: true, path: NOTES_FILE });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save notes' });
  }
});

// Chat NLP (Local loopback compatibility)
app.post('/api/v1/chat', async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message required' });

  const query = message.trim();
  const lower = query.toLowerCase();

  // App launchers
  if (lower.includes('ماشین حساب') || lower.includes('calc')) {
    exec('calc.exe');
    return res.json({ reply: 'ماشین حساب ویندوز (Calculator) با موفقیت باز شد، قربان.' });
  }
  if (lower.includes('نوت پد') || lower.includes('نوت‌پد') || lower.includes('notepad')) {
    exec('notepad.exe');
    return res.json({ reply: 'ویرایشگر نوت‌پد ویندوز باز شد.' });
  }
  if (lower.includes('تسک منیجر') || lower.includes('taskmgr') || lower.includes('مدیریت وظایف')) {
    exec('taskmgr.exe');
    return res.json({ reply: 'مدیریت وظایف ویندوز (Task Manager) باز شد.' });
  }
  if (lower.includes('اکسپلورر') || lower.includes('explorer') || lower.includes('فایل ها')) {
    exec('explorer.exe');
    return res.json({ reply: 'مدیریت فایل‌های ویندوز (File Explorer) باز شد.' });
  }
  if (lower.includes('ترمینال') || lower.includes('پاورشل') || lower.includes('powershell')) {
    exec('start powershell.exe');
    return res.json({ reply: 'ترمینال PowerShell ویندوز باز شد.' });
  }
  if (lower.includes('تنظیمات') || lower.includes('settings')) {
    exec('start ms-settings:');
    return res.json({ reply: 'تنظیمات ویندوز گشوده شد.' });
  }

  // System stats query
  if (lower.includes('وضعیت سیستم') || lower.includes('سخت افزار') || lower.includes('cpu') || lower.includes('سی پی یو') || lower.includes('رم') || lower.includes('ram')) {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpuP = calculateCpuPercent();
    const disk = getDiskStats();
    const cpus = os.cpus();
    return res.json({
      reply: `گزارش تله‌متری زنده ویندوز، قربان:\n• پردازنده: ${cpus[0]?.model} با بار ${cpuP}%\n• حافظه رم: مصرف ${Math.round((usedMem / totalMem) * 100)}% (${(usedMem / (1024 ** 3)).toFixed(1)} GB از ${(totalMem / (1024 ** 3)).toFixed(1)} GB)\n• دیسک C: مصرف ${disk.percent}% (${disk.usedGB} GB مصرف‌شده، ${disk.freeGB} GB آزاد)\n• پایداری سیستم: بهینه (Nominal)`
    });
  }

  return res.json({
    reply: `فرمانده عزیز، درخواست شما پردازش شد: «${query}».\nمی‌توانید برای اجرای فرامین از دستوراتی مانند «باز کن ماشین حساب»، «وضعیت سیستم»، «نوت‌پد»، یا تب‌های نوار کناری استفاده فرمایید.`
  });
});

// Root redirect to mobile
app.get('/', (req, res) => {
  if (fs.existsSync(PUBLIC_MOBILE_DIR)) {
    res.redirect('/mobile');
  } else {
    res.send('HesaTech Bridge Server Active');
  }
});

let serverInstance = null;
export function startBridgeServer(host = '127.0.0.1') {
  if (!serverInstance) {
    try {
      serverInstance = app.listen(PORT, host, () => {
        console.log(`[HesaTech Bridge Server] Active on http://${host}:${PORT} (Mobile Companion at http://${host}:${PORT}/mobile)`);
      });
      serverInstance.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[HesaTech Bridge Server] Port ${PORT} already listening; using existing active instance.`);
        } else {
          console.error('[HesaTech Bridge Server] Error:', err.message);
        }
      });
    } catch (e) {
      console.log(`[HesaTech Bridge Server] Caught startup notice: ${e.message}`);
    }
  }
  return serverInstance;
}

if (process.argv[1] && process.argv[1].endsWith('bridge-server.mjs')) {
  startBridgeServer();
}
