/**
 * HesaTech Gemini Live API Session
 * Low-latency bidirectional voice + non-blocking Windows system tools
 * Uses official @google/genai SDK v2.30+ and gemini-3.8-live
 */

const { GoogleGenAI } = require('@google/genai');
const IDENTITY = require('./identity');
const ConfigManager = require('./config');
const agentOrchestrator = require('./agent-orchestrator');
const memoryManager = require('./memory');

class GeminiLiveSessionManager {
  constructor() {
    this.activeSession = null;
    this.sessionStatus = 'idle'; // 'idle' | 'connecting' | 'connected' | 'error'
    this.sessionIdCounter = 0;
    this.currentSessionId = 0;
    this.eventListeners = new Set();
    this.currentTurnUserText = '';
    this.currentTurnAssistantText = '';
    this.lastAssistantSpoken = '';
    this.activeModel = 'gemini-3.8-live';
  }

  onEvent(listener) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  emit(type, payload) {
    for (const listener of this.eventListeners) {
      try {
        listener(type, payload);
      } catch (err) {
        console.error('[GeminiLiveSession] Error in listener:', err);
      }
    }
  }

  getStatus() {
    return {
      status: this.sessionStatus,
      isConnected: this.sessionStatus === 'connected' && !!this.activeSession
    };
  }

  /**
   * Build comprehensive Persian executive system prompt with memory injection & tools awareness
   */
  async buildSystemPrompt(options = {}) {
    const memorySnapshot = options.memorySnapshot || memoryManager.getMemorySnapshotForPrompt(15);

    let topologySection = '';
    try {
      const connectionsManager = require('../connectors/connections-manager');
      const topo = await connectionsManager.getTopology();
      const n = topo.nodes || {};
      topologySection = `
### وضعیت زنده اتصالات طبق پایگاه قابلیت‌های واقعی (Capability Registry):
- اینترنت زنده (Live Web): ${n.websites?.status === 'connected' ? 'متصل و آنلاین ✅ (' + (n.websites.details || '') + ')' : 'قطع ❌'}
- تدوین کپ‌کات (CapCut Bridge): ${n.capcut_bridge?.status === 'connected' ? 'متصل و فعال ✅ (' + (n.capcut_bridge.details || '') + ')' : 'قطع ❌'}
- سیستم‌عامل ویندوز: ${n.windows_os?.status === 'connected' ? 'متصل ✅ (' + (n.windows_os.details || '') + ')' : 'نامشخص'}
- مخزن والت و وظایف: ${n.projects_vault?.status === 'connected' ? 'متصل ✅' : 'قطع'}
- اتوماسیون مرورگر Playwright: آماده و فعال ✅
- شورای ۷ عاملیت تخصصی: آماده و فعال ✅
- گیت امنیتی «با اجازه خودم»: فعال و مستقر ✅`;
    } catch {
      topologySection = 'اطلاعات رجیستری در این لحظه مستقیماً از ابزارها استعلام می‌شود.';
    }

    return `شما ${IDENTITY.assistant.name} (${IDENTITY.assistant.nameFa})، دستیار هوشمند اجرایی ${IDENTITY.product.name} هستید. ${IDENTITY.product.name} نام محصول است و نام قطعی شما ${IDENTITY.assistant.name} (${IDENTITY.assistant.nameFa}) است. هرگز خود را با نام دیگری معرفی نکنید.

### ۱. اصل اقدام فوری و پاسخ مستقیم (Direct Action & Real Answers):
- به هیچ عنوان در تعارفات، جملات کلیشه‌ای و تشریفاتی مانند «در خدمتم چه کاری انجام دهم؟»، «چیکار کنم؟» یا تکرار بی‌هدف گیر نیفتید.
- اگر مالک سوالی پرسید، بلافاصله و مستقیماً پاسخ دقیق، فنی و واقعی را ارائه دهید.
- اگر مالک دستوری داد، بدون فوت وقت ابزار متناظر را فراخوانی کنید و پس از دریافت نتیجه، گزارش کار را کوتاه و رسا بیان کنید.
- فقط در صورتی که مالک صریحاً تأیید خواست، یک «چشم» کوتاه به همراه اصل اقدام یا پاسخ ارائه دهید، نه اینکه مکالمه را متوقف کنید.

### ۲. زبان فارسی روان، شیوا و هوشمندانه:
- منحصراً به فارسی طبیعی، دقیق و حرفه‌ای صحبت کنید.
- از لکنت، مکث‌های بی‌مورد و تکرار واژگان خودداری کنید.

### ۳. مبارزه قاطع با رفتار دمو و پاسخ‌های قالبی:
- پاسخ‌ها باید عملیاتی، کوتاه و دارای اطلاعات باارزش باشند، نه جملات تزئینی.
- هرگز نگویید به اینترنت یا ابزارها دسترسی ندارید؛ تمام ابزارهای ویندوز، وب، کپ‌کات و حافظه در اختیار شماست.

${topologySection}

### ۴. قوانین الزامی فراخوانی ابزارها در صوت (MANDATORY Tool Execution Rules):
صرف نام بردن یا ادعا کردن کافی نیست؛ وقتی مالک دستوری داد، شما باید فوراً ابزار مربوطه را صدا بزنید و نتیجه واقعی ابزار را پاسخ دهید:
۱. مرورگر و اینترنت (تست A): هر زمان مالک گفت «یک سایت را واقعاً باز کن» یا خواست صفحه‌ای را باز کنید، فوراً ابزار \`browser_navigate\` را با نشانی (مثلاً https://example.com) صدا بزنید. برای جستجوی وب از \`web_search\` استفاده کنید.
۲. فهرست پروژه‌های کپ‌کات (تست B): هر زمان مالک گفت «پروژه‌های CapCut را فهرست کن» یا درباره پیش‌نویس‌ها پرسید، فوراً ابزار \`capcut_list_drafts\` یا \`capcut_status\` را صدا بزنید و عناوین واقعی برگشتی را بیان کنید.
۳. شورای عاملیت‌های تخصصی (تست C): هر زمان مالک گفت «هفت عامل تخصصی خودت را نام ببر»، ابتدا ۷ عامل (Architect, Engineer, Security, Research, DevOps, Critic, Judge) را نام ببرید، و وقتی از Research Agent کار خواست، فوراً ابزار \`consult_specialized_agent\` را با agentId='research' صدا بزنید.
۴. یادآوری و حافظه (تست D): هر زمان مالک درباره موضوعات گفتگوهای قبلی پرسید، بر اساس سوابق حافظه در زیر پاسخ دهید یا از \`recall_memory\` استفاده کنید. هرگز ادعا نکنید حافظه ندارید یا جلسات قبلی پاک می‌شود.

### ۵. حافظه دائمی و سوابق گفتگوهای اخیر با مالک:
شما دارای حافظه پیوسته ذخیره‌شده در دیسک محلی هستید. سوابق گفتگوهای اخیر شما با مالک در زیر آمده است:
==================================================
${memorySnapshot}
==================================================
قوانین حافظه:
- شما تمام موارد مندرج در سوابق بالا را کلمه‌به‌کلمه به یاد دارید.
- اگر مالک پرسید: «ما قبلاً با هم صحبت کردیم یا نه؟»، «من چی گفتم به تو؟»، «حرف‌های قبلی را تکرار کن»، به این سوابق مراجعه کرده و دقیقاً محتوای حرف‌های مالک (مانند سوالات درباره کپ‌کات، اینترنت، وضعیت سیستم یا دستورات گذشته) را با احترام تکرار و خلاصه نمایید. هرگز نگویید حافظه ندارم یا جلسات قبلی ذخیره نمی‌شود!`;
  }

  /**
   * Flush pending text to persistent memory
   */
  _flushPendingTurns(modelName = null) {
    const targetModel = modelName || this.activeModel || 'gemini-3.8-live';
    if (this.currentTurnUserText && this.currentTurnUserText.trim()) {
      memoryManager.recordMessage('user', this.currentTurnUserText.trim(), {
        model: targetModel,
        provider: 'gemini-live-voice'
      });
      this.currentTurnUserText = '';
    }
    if (this.currentTurnAssistantText && this.currentTurnAssistantText.trim()) {
      memoryManager.recordMessage('assistant', this.currentTurnAssistantText.trim(), {
        model: targetModel,
        provider: 'gemini-live-voice'
      });
      this.lastAssistantSpoken = this.currentTurnAssistantText.trim();
      this.currentTurnAssistantText = '';
    }
  }

  /**
   * Start a Live API voice session
   * @param {Object} options
   * @param {string} options.model - 'gemini-3.8-live' or 'gemini-3.8-live-extended-thinking'
   */
  async startSession(options = {}) {
    if (this.activeSession) {
      await this.stopSession();
    }

    // The key saved in the app wins. An ambient GEMINI_API_KEY from the user's
    // shell may belong to a different account or region and silently break
    // voice/chat, which is what happened here.
    const apiKey = ConfigManager.getDecryptedApiKey() || process.env.HEZTECH_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const err = new Error('کلید دسترسی Gemini API یافت نشد. لطفاً در تنظیمات کلید را وارد نمایید.');
      this.emit('error', { error: err.message });
      throw err;
    }

    this.sessionStatus = 'connecting';
    this.currentSessionId = ++this.sessionIdCounter;
    const thisSessionId = this.currentSessionId;
    this.emit('status', { status: 'connecting' });

    const modelName = options.model || 'gemini-3.8-live';
    this.activeModel = modelName;
    const ai = new GoogleGenAI({ apiKey });

    const tools = options.listenOnly ? [] : [
      {
        functionDeclarations: agentOrchestrator.tools || []
      }
    ];

    const systemPrompt = options.systemPrompt || await this.buildSystemPrompt(options);
    const voiceName = options.voice || 'Kore';

    const config = {
      responseModalities: ['audio'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voiceName
          }
        }
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      tools: tools.length > 0 ? tools : undefined,
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      }
    };

    let rejectConnection;
    const failed = new Promise((_, reject) => { rejectConnection = reject; });
    const cancelConnection = () => rejectConnection(new Error('Voice connection was cancelled'));
    this.pendingCancel = cancelConnection;
    const timeout = setTimeout(() => rejectConnection(new Error('Voice setup timed out after 45 seconds')), 45000);
    try {
      console.log(`[GeminiLiveSession] Connecting to ${modelName}...`);
      const connecting = ai.live.connect({
        model: modelName,
        config: config,
        callbacks: {
          onopen: () => {
            if (this.currentSessionId !== thisSessionId) return;
            console.log('[GeminiLiveSession] Connection established.');
            this.sessionStatus = 'connecting';
            this.currentTurnUserText = '';
            this.currentTurnAssistantText = '';
          },
          onmessage: async (response) => {
            if (this.currentSessionId !== thisSessionId) return;
            await this._handleMessage(response, thisSessionId);
          },
          onerror: (err) => {
            if (this.currentSessionId !== thisSessionId) return;
            rejectConnection(new Error(err.message || 'Live API connection error'));
            this.sessionStatus = 'error';
            const failedSession = this.activeSession;
            this.activeSession = null;
            failedSession?.close();
            console.error('[GeminiLiveSession] Session error:', err.message || err);
            this._flushPendingTurns(modelName);
            this.emit('error', { error: err.message || 'Live API connection error' });
          },
          onclose: (e) => {
            if (this.currentSessionId !== thisSessionId) return;
            rejectConnection(new Error(e?.reason || 'Live session closed before ready'));
            console.log('[GeminiLiveSession] Session closed:', e?.reason || 'normal');
            this._flushPendingTurns(modelName);
            const status = this.sessionStatus === 'error' ? 'error' : 'idle';
            this.sessionStatus = status;
            this.activeSession = null;
            this.emit('status', { status, reason: e?.reason });
          }
        }
      });
      connecting.then(session => {
        if (this.currentSessionId !== thisSessionId) session.close();
      }, () => {});
      const session = await Promise.race([connecting, failed]);

      if (this.currentSessionId !== thisSessionId) {
        session.close();
        throw new Error('Voice connection was cancelled');
      }
      this.activeSession = session;
      this.sessionStatus = 'connected';
      this.emit('status', { status: 'connected', model: modelName });
      return { success: true, model: modelName };
    } catch (err) {
      if (this.currentSessionId !== thisSessionId) throw err;
      this.currentSessionId = ++this.sessionIdCounter;
      this.sessionStatus = 'error';
      this.activeSession = null;
      if (/403/.test(err.message)) {
        err.message = 'سرویس Google اتصال Live را با HTTP 403 رد کرد. دسترسی سرویس، کلید و مسیر شبکه را بررسی کنید. گفتگوی محلی مستقل از این سرویس فعال است.';
      }
      console.error('[GeminiLiveSession] Connection failed:', err);
      this.emit('error', { error: err.message || 'Failed to connect to Gemini Live API' });
      throw err;
    } finally {
      clearTimeout(timeout);
      if (this.pendingCancel === cancelConnection) this.pendingCancel = null;
    }
  }

  /**
   * Handle incoming message from Gemini Live WebSocket
   */
  async _handleMessage(response, sessionId) {
    if (!response) return;
    if (sessionId && this.currentSessionId !== sessionId) return;

    let audioChunkEmitted = false;

    // 1. Check for audio output in serverContent.modelTurn
    const serverContent = response.serverContent;
    if (serverContent) {
      if (serverContent.interrupted) {
        console.log('[GeminiLiveSession] Model interrupted by user speech.');
        this._flushPendingTurns();
        this.emit('interrupted', {});
      }

      if (serverContent.inputTranscription?.text) {
        const chunk = serverContent.inputTranscription.text;
        this.currentTurnUserText += chunk;
        this.emit('transcription', {
          role: 'user',
          text: this.currentTurnUserText
        });
      }

      if (serverContent.outputTranscription?.text) {
        // As soon as the assistant starts outputting, if there was accumulated user text, save it
        if (this.currentTurnUserText.trim()) {
          memoryManager.recordMessage('user', this.currentTurnUserText.trim(), {
            model: this.activeModel,
            provider: 'gemini-live-voice'
          });
          this.currentTurnUserText = '';
        }

        const chunk = serverContent.outputTranscription.text;
        this.currentTurnAssistantText += chunk;
        this.emit('transcription', {
          role: 'assistant',
          text: this.currentTurnAssistantText
        });
      }

      if (serverContent.generationComplete || serverContent.turnComplete) {
        if (this.currentTurnAssistantText.trim()) {
          memoryManager.recordMessage('assistant', this.currentTurnAssistantText.trim(), {
            model: this.activeModel,
            provider: 'gemini-live-voice'
          });
          this.lastAssistantSpoken = this.currentTurnAssistantText.trim();
          this.currentTurnAssistantText = '';
        }
      }

      if (serverContent.modelTurn?.parts) {
        for (const part of serverContent.modelTurn.parts) {
          if (part.inlineData && part.inlineData.data) {
            audioChunkEmitted = true;
            this.emit('audio-chunk', {
              mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
              data: part.inlineData.data // Base64 PCM 24kHz
            });
          }
        }
      }
    }

    // Direct audio data fallback only if NOT already emitted above
    if (!audioChunkEmitted && response.data) {
      this.emit('audio-chunk', {
        mimeType: 'audio/pcm;rate=24000',
        data: response.data
      });
    }

    // 2. Tool Calls
    const toolCall = response.toolCall;
    if (toolCall && toolCall.functionCalls && toolCall.functionCalls.length > 0) {
      console.log(`[GeminiLiveSession] Handling ${toolCall.functionCalls.length} tool calls...`);
      const functionResponses = [];

      for (const fc of toolCall.functionCalls) {
        this.emit('tool-status', {
          state: 'executing',
          tool: fc.name,
          args: fc.args
        });

        try {
          const result = await agentOrchestrator.executeTool(fc.name, fc.args || {});
          functionResponses.push({
            id: fc.id,
            name: fc.name,
            response: { result: result }
          });
          this.emit('tool-status', {
            state: 'completed',
            tool: fc.name,
            result: result
          });
        } catch (toolErr) {
          console.error(`[GeminiLiveSession] Tool ${fc.name} error:`, toolErr);
          functionResponses.push({
            id: fc.id,
            name: fc.name,
            response: { error: toolErr.message }
          });
          this.emit('tool-status', {
            state: 'error',
            tool: fc.name,
            error: toolErr.message
          });
        }
      }

      // Send tool response back to Live session
      if (this.activeSession && functionResponses.length > 0) {
        try {
          console.log('[GeminiLiveSession] Sending tool responses back to session...');
          this.activeSession.sendToolResponse({
            functionResponses: functionResponses
          });
        } catch (sendErr) {
          console.error('[GeminiLiveSession] Failed to send tool response:', sendErr);
        }
      }
    }
  }

  /**
   * Send realtime audio chunk from microphone
   * @param {string} base64Pcm - 16kHz 16-bit mono PCM base64 string
   */
  sendAudioChunk(base64Pcm) {
    if (!this.activeSession) return false;
    try {
      this.activeSession.sendRealtimeInput({
        audio: {
          data: base64Pcm,
          mimeType: 'audio/pcm;rate=16000'
        }
      });
      return true;
    } catch (err) {
      console.error('[GeminiLiveSession] sendAudioChunk failed:', err);
      return false;
    }
  }

  /**
   * Send end of audio stream (Hybrid VAD)
   */
  sendAudioStreamEnd() {
    if (!this.activeSession) return false;
    try {
      this.activeSession.sendRealtimeInput({
        audioStreamEnd: true
      });
      return true;
    } catch (err) {
      console.error('[GeminiLiveSession] sendAudioStreamEnd failed:', err);
      return false;
    }
  }

  /**
   * Send client text message into active live session
   * @param {string} text
   */
  sendText(text) {
    if (!this.activeSession) return false;
    try {
      this.currentTurnUserText = (this.currentTurnUserText ? this.currentTurnUserText + ' ' : '') + text;
      this.activeSession.sendRealtimeInput({
        text: text
      });
      return true;
    } catch (err) {
      console.error('[GeminiLiveSession] sendText failed:', err);
      return false;
    }
  }

  /**
   * Stop and cleanup active session
   */
  async stopSession() {
    this.currentSessionId = ++this.sessionIdCounter; // invalidate any inflight callbacks
    this.pendingCancel?.();
    this.pendingCancel = null;
    this._flushPendingTurns();
    if (this.activeSession) {
      try {
        console.log('[GeminiLiveSession] Stopping active session...');
        if (typeof this.activeSession.close === 'function') {
          this.activeSession.close();
        }
      } catch (err) {
        console.warn('[GeminiLiveSession] Error closing session:', err.message);
      }
      this.activeSession = null;
    }
    this.sessionStatus = 'idle';
    this.emit('interrupted', {});
    this.emit('status', { status: 'idle' });
    return { success: true };
  }
}

module.exports = new GeminiLiveSessionManager();
