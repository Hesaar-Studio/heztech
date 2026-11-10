/**
 * HezTech CapCut Bridge Connector
 * Connects HezTech to its project-local CapCut Bridge Kit contract.
 * Inspects local drafts, executes timeline bridge actions, and handles AI Voice/Audio tools.
 */

const fs = require('fs');
const path = require('path');
const { exec, execFile, spawn } = require('child_process');
const { GoogleGenAI } = require('@google/genai');
const ConfigManager = require('../core/config');

const CANDIDATE_BRIDGE_DIRS = [
  process.env.HEZTECH_CAPCUT_BRIDGE_DIR,
  path.join(require('os').homedir(), 'openclaw', 'capcut-bridge-kit'),
  path.join(require('os').homedir(), 'openclaw', '.audit', 'capcut-bridge-kit')
].filter(Boolean);

const BRIDGE_KIT_DIR = path.resolve(
  CANDIDATE_BRIDGE_DIRS.find(dir => fs.existsSync(dir)) || CANDIDATE_BRIDGE_DIRS[0]
);
const BRIDGE_CLI = path.join(BRIDGE_KIT_DIR, 'capcut-bridge-win.py');
const LOCAL_APPDATA = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Green', 'AppData', 'Local');
const CAPCUT_DRAFTS_DIR = path.join(LOCAL_APPDATA, 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');

class CapCutBridgeConnector {
  constructor() {
    this.bridgePath = BRIDGE_KIT_DIR;
    this.draftsDir = CAPCUT_DRAFTS_DIR;
  }

  async getCapabilities() {
    if (!fs.existsSync(path.join(this.bridgePath, 'ai_contract', 'dispatcher.py'))) {
      return { success: false, error: 'قرارداد ابزارهای CapCut در مسیر کیت یافت نشد.' };
    }
    const code = 'import json,sys; from ai_contract.dispatcher import ContractDispatcher; request=json.load(sys.stdin); print(json.dumps(ContractDispatcher().dispatch(request).to_dict(),ensure_ascii=False))';
    return new Promise(resolve => {
      const child = execFile(process.env.HEZTECH_PYTHON || 'python', ['-B', '-X', 'utf8', '-c', code], {
        cwd: this.bridgePath, windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
      }, (error, stdout) => {
        if (error) return resolve({ success: false, error: `Bridge contract probe failed: ${error.code || 'process_error'}` });
        try { resolve(JSON.parse(stdout)); }
        catch { resolve({ success: false, error: 'Bridge returned an invalid contract response' }); }
      });
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify({ operation: 'get_capabilities', parameters: {}, request_id: 'heztech-capabilities' }));
    });
  }

  /**
   * Check connection status of CapCut Bridge Kit & CapCut Desktop
   */
  async getStatus() {
    const bridgeInstalled = fs.existsSync(BRIDGE_KIT_DIR) && fs.existsSync(BRIDGE_CLI);
    const capabilities = bridgeInstalled ? await this.getCapabilities() : null;
    const bridgeConnected = capabilities?.success === true;
    const draftsDirExists = fs.existsSync(CAPCUT_DRAFTS_DIR);
    
    // Check if CapCut.exe is running
    const capcutRunning = await new Promise((resolve) => {
      exec('tasklist /FI "IMAGENAME eq CapCut.exe" /NH', { timeout: 5000, windowsHide: true }, (err, stdout) => {
        if (err || !stdout) return resolve(false);
        resolve(stdout.toLowerCase().includes('capcut.exe'));
      });
    });

    let draftCount = 0;
    if (draftsDirExists) {
      try {
        const items = fs.readdirSync(CAPCUT_DRAFTS_DIR).filter(f => !f.startsWith('.') && f !== 'root_meta_info.json');
        draftCount = items.length;
      } catch (_) {}
    }

    return {
      success: true,
      bridgeInstalled,
      bridgeConnected,
      capabilities: capabilities?.data?.tools || [],
      bridgeError: capabilities?.error || null,
      bridgePath: BRIDGE_KIT_DIR,
      bridgeCli: BRIDGE_CLI,
      capcutRunning,
      draftsDir: CAPCUT_DRAFTS_DIR,
      draftsDirExists,
      draftCount,
      status: bridgeConnected ? 'bridge_ready' : (bridgeInstalled ? 'bridge_error' : 'missing_bridge'),
      statusText: bridgeConnected
        ? 'قرارداد ابزارهای پل پاسخ می‌دهد؛ اعمال ویرایش زنده در CapCut هنوز تأیید نشده است.'
        : (bridgeInstalled ? 'کیت موجود است ولی قرارداد ابزارها پاسخ معتبر نداد.' : 'پوشه CapCut Bridge یافت نشد')
    };
  }

  /**
   * List all real CapCut drafts on disk with parsed metadata
   */
  async listDrafts() {
    if (!fs.existsSync(CAPCUT_DRAFTS_DIR)) {
      return { success: false, error: 'پوشه پروژه‌های CapCut یافت نشد: ' + CAPCUT_DRAFTS_DIR, drafts: [] };
    }

    try {
      const items = fs.readdirSync(CAPCUT_DRAFTS_DIR)
        .filter(f => !f.startsWith('.') && f !== 'root_meta_info.json');

      const drafts = [];

      for (const itemName of items) {
        const projectDir = path.join(CAPCUT_DRAFTS_DIR, itemName);
        let stat = null;
        try {
          stat = fs.statSync(projectDir);
          if (!stat.isDirectory()) continue;
        } catch (_) {
          continue;
        }

        const draftInfo = {
          name: itemName,
          path: projectDir,
          lastModified: stat.mtime.toISOString(),
          durationSeconds: 0,
          formattedDuration: '00:00',
          trackCount: 0,
          videoCount: 0,
          textCount: 0,
          audioCount: 0,
          hasCover: false
        };

        // Try reading draft_content.json for detailed timeline metrics
        const contentPath = path.join(projectDir, 'draft_content.json');
        if (fs.existsSync(contentPath)) {
          try {
            const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
            if (content.duration) {
              draftInfo.durationSeconds = Math.round(content.duration / 1000000);
              const mins = Math.floor(draftInfo.durationSeconds / 60);
              const secs = draftInfo.durationSeconds % 60;
              draftInfo.formattedDuration = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            }
            if (content.tracks) {
              draftInfo.trackCount = content.tracks.length;
            }
            if (content.materials) {
              draftInfo.videoCount = content.materials.videos?.length || 0;
              draftInfo.textCount = content.materials.texts?.length || 0;
              draftInfo.audioCount = content.materials.audios?.length || 0;
            }
          } catch (_) {}
        }

        // Cover check
        const coverPath = path.join(projectDir, 'draft_cover.jpg');
        if (fs.existsSync(coverPath)) {
          draftInfo.hasCover = true;
          draftInfo.coverPath = coverPath;
        }

        drafts.push(draftInfo);
      }

      // Sort by newest modified
      drafts.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

      return {
        success: true,
        count: drafts.length,
        drafts
      };
    } catch (err) {
      return { success: false, error: 'خطا در خواندن پروژه‌ها: ' + err.message, drafts: [] };
    }
  }

  /**
   * Inspect a specific draft's internal timeline and materials
   */
  async inspectDraft(draftName) {
    if (!draftName) return { success: false, error: 'نام پروژه مشخص نشده است.' };
    const projectDir = path.join(CAPCUT_DRAFTS_DIR, draftName);
    if (!fs.existsSync(projectDir)) {
      return { success: false, error: `پروژه «${draftName}» یافت نشد.` };
    }

    const contentPath = path.join(projectDir, 'draft_content.json');
    if (!fs.existsSync(contentPath)) {
      return { success: false, error: 'فایل draft_content.json در این پروژه وجود ندارد.' };
    }

    try {
      const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
      const durationSeconds = Math.round((content.duration || 0) / 1000000);
      const mins = Math.floor(durationSeconds / 60);
      const secs = durationSeconds % 60;

      // Extract texts
      const textSnippets = [];
      if (content.materials?.texts) {
        for (const t of content.materials.texts.slice(0, 30)) {
          try {
            const parsed = JSON.parse(t.content || '{}');
            if (parsed.text) textSnippets.push(parsed.text);
          } catch (_) {
            if (t.content) textSnippets.push(String(t.content).slice(0, 40));
          }
        }
      }

      // Extract track summary
      const tracksSummary = (content.tracks || []).map((t, idx) => ({
        index: idx,
        type: t.type,
        segmentsCount: t.segments?.length || 0
      }));

      return {
        success: true,
        name: draftName,
        path: projectDir,
        durationSeconds,
        formattedDuration: `${mins}:${secs < 10 ? '0' : ''}${secs}`,
        fps: content.fps || 30,
        tracks: tracksSummary,
        materialsSummary: {
          videos: content.materials?.videos?.length || 0,
          texts: content.materials?.texts?.length || 0,
          audios: content.materials?.audios?.length || 0,
          effects: content.materials?.effects?.length || 0
        },
        sampleTexts: textSnippets.slice(0, 15)
      };
    } catch (err) {
      return { success: false, error: 'خطا در تحلیل پروژه: ' + err.message };
    }
  }

  /**
   * Add text/subtitle to an existing CapCut draft via Bridge CLI
   */
  async addTextToDraft({ draftName, text, atSeconds = 1.0, durationSeconds = 3.0 }) {
    if (!fs.existsSync(BRIDGE_CLI)) {
      return { success: false, error: 'اسکریپت پل ارتباطی در مسیر تنظیم‌شده یافت نشد.' };
    }

    if (typeof draftName !== 'string' || !draftName || /[\\/:]/.test(draftName) || typeof text !== 'string' || !text.trim() || text.length > 2000 || !Number.isFinite(Number(atSeconds)) || Number(atSeconds) < 0 || !Number.isFinite(Number(durationSeconds)) || Number(durationSeconds) <= 0) {
      return { success: false, error: 'نام پروژه، متن یا زمان‌بندی نامعتبر است.' };
    }

    return new Promise((resolve) => {
      const args = ['-X', 'utf8', BRIDGE_CLI, 'add-text', draftName, text, '--at', String(Number(atSeconds)), '--dur', String(Number(durationSeconds))];
      execFile(process.env.HEZTECH_PYTHON || 'python', args, { cwd: BRIDGE_KIT_DIR, windowsHide: true, timeout: 15000 }, (err, stdout, stderr) => {
        if (err) {
          return resolve({ success: false, error: stderr || err.message, stdout });
        }
        resolve({
          success: true,
          message: `متن با موفقیت توسط Bridge به پروژه «${draftName}» افزوده شد.`,
          stdout
        });
      });
    });
  }

  /**
   * Launch CapCut Desktop application
   */
  async launchCapCut() {
    return new Promise((resolve) => {
      const candidatePaths = [
        path.join(LOCAL_APPDATA, 'CapCut', 'Apps', 'CapCut.exe'),
        path.join(LOCAL_APPDATA, 'CapCut', 'Apps', '9.7.0.4137', 'CapCut.exe'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'CapCut', 'CapCut.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'CapCut', 'CapCut.exe')
      ];

      // Dynamically discover versioned subdirectories inside CapCut\Apps
      const appsDir = path.join(LOCAL_APPDATA, 'CapCut', 'Apps');
      if (fs.existsSync(appsDir)) {
        try {
          const subdirs = fs.readdirSync(appsDir).filter(f => fs.existsSync(path.join(appsDir, f, 'CapCut.exe')));
          for (const s of subdirs) {
            candidatePaths.unshift(path.join(appsDir, s, 'CapCut.exe'));
          }
        } catch (e) {}
      }

      const targetExe = candidatePaths.find(p => fs.existsSync(p));

      if (targetExe) {
        try {
          const child = spawn(targetExe, [], {
            detached: true,
            stdio: 'ignore'
          });
          child.unref();
          return resolve({ success: true, message: `نرم‌افزار CapCut Desktop با موفقیت اجرا شد (${path.basename(targetExe)}).` });
        } catch (spawnErr) {
          return resolve({ success: false, error: `خطا در اجرای CapCut: ${spawnErr.message}` });
        }
      }

      return resolve({ success: false, error: 'فایل اجرایی CapCut.exe در سیستم یافت نشد.' });
    });
  }

  /**
   * AI Speech-to-Text (STT): Transcribes Persian or English voice to text using Gemini Multimodal
   */
  async transcribeAudio({ base64Audio, mimeType = 'audio/webm' }) {
    if (!base64Audio) return { success: false, error: 'داده صوتی برای تبدیل به متن دریافت نشد.' };
    const apiKey = ConfigManager.getDecryptedApiKey() || process.env.GEMINI_API_KEY;
    if (!apiKey) return { success: false, error: 'کلید Gemini API یافت نشد.' };

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Audio
                }
              },
              {
                text: 'لطفاً این قطعه صوتی را با دقت تمام به متن فارسی روان، صحیح و با املای دقیق پیاده‌سازی و تایپ کن (Speech to Text Transcription). فقط متن گفته‌شده را بنویس بدون هیچ مقدمه یا توضیح اضافی.'
              }
            ]
          }
        ]
      });

      const transcript = response.text ? response.text.trim() : '';
      return {
        success: true,
        transcript,
        model: 'gemini-2.5-flash'
      };
    } catch (err) {
      return { success: false, error: 'خطا در تبدیل صدا به متن: ' + err.message };
    }
  }

  /**
   * AI Text-to-Speech (TTS): Generates spoken voice using Gemini Live or ElevenLabs / Web Speech
   */
  async generateSpeech({ text, voice = 'Kore' }) {
    if (!text) return { success: false, error: 'متن برای تبدیل به صدا مشخص نشده است.' };
    return {
      success: true,
      text,
      voice,
      method: 'browser_speech_synthesis',
      message: 'آماده برای پخش در کلاینت'
    };
  }
}

module.exports = new CapCutBridgeConnector();
