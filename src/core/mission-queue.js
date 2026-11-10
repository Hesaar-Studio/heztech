/**
 * JARVIS Mission Lifecycle & Orchestrator
 * Manages mission creation, priority queues, state transitions, logs, and cancellation.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VAULT_DIR = path.resolve(process.env.HEZTECH_DATA_DIR || 'C:\\Users\\Green\\openclaw\\vault');
const MISSIONS_FILE = path.join(VAULT_DIR, 'missions.json');

class MissionQueue {
  constructor() {
    this.missions = this.loadMissions();
    this.activeRunners = new Map(); // missionId -> AbortController
  }

  loadMissions() {
    try {
      if (fs.existsSync(MISSIONS_FILE)) {
        return JSON.parse(fs.readFileSync(MISSIONS_FILE, 'utf-8')) || [];
      }
    } catch (e) {
      console.error('[MissionQueue] Failed to load missions.json:', e.message);
    }
    return [];
  }

  saveMissions() {
    try {
      fs.writeFileSync(MISSIONS_FILE, JSON.stringify(this.missions, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('[MissionQueue] Failed to save missions.json:', e.message);
      return false;
    }
  }

  createMission({ title, description, priority = 'normal', mode = 'QUICK', targetProject = 'Hesaart Studio' }) {
    const id = 'msn_' + crypto.randomBytes(6).toString('hex');
    const mission = {
      id,
      title: title || 'بدون عنوان',
      description: description || '',
      priority, // low, normal, high, critical
      mode,     // QUICK, DEEP, CRITICAL
      targetProject,
      status: 'queued', // queued, in_council, awaiting_approval, executing, completed, failed, cancelled
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      logs: [
        { timestamp: new Date().toISOString(), level: 'INFO', message: `ماموریت در صف ثبت گردید (اولویت: ${priority})` }
      ],
      councilVerdict: null,
      result: null
    };

    this.missions.unshift(mission);
    this.saveMissions();
    return mission;
  }

  updateStatus(id, status, details = {}) {
    const m = this.missions.find(x => x.id === id);
    if (!m) return null;

    m.status = status;
    m.updatedAt = new Date().toISOString();

    if (details.progress !== undefined) m.progress = details.progress;
    if (details.result !== undefined) m.result = details.result;
    if (details.councilVerdict !== undefined) m.councilVerdict = details.councilVerdict;

    if (details.log) {
      m.logs.push({
        timestamp: new Date().toISOString(),
        level: details.logLevel || 'INFO',
        message: details.log
      });
    }

    this.saveMissions();
    return m;
  }

  cancelMission(id) {
    const m = this.missions.find(x => x.id === id);
    if (!m) return { success: false, error: 'ماموریت یافت نشد' };

    if (m.status === 'completed' || m.status === 'cancelled') {
      return { success: false, error: `ماموریت در وضعیت ${m.status} قابل لغو نیست` };
    }

    // Abort if running
    if (this.activeRunners.has(id)) {
      const controller = this.activeRunners.get(id);
      controller.abort();
      this.activeRunners.delete(id);
    }

    m.status = 'cancelled';
    m.updatedAt = new Date().toISOString();
    m.logs.push({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      message: 'ماموریت توسط کاربر یا مدیر لغو گردید.'
    });

    this.saveMissions();
    return { success: true, mission: m };
  }

  retryMission(id) {
    const m = this.missions.find(x => x.id === id);
    if (!m) return { success: false, error: 'ماموریت یافت نشد' };

    m.status = 'queued';
    m.progress = 0;
    m.updatedAt = new Date().toISOString();
    m.logs.push({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'ماموریت مجدداً در صف اجرا قرار گرفت.'
    });

    this.saveMissions();
    return { success: true, mission: m };
  }

  getMissions(limit = 30) {
    return this.missions.slice(0, limit);
  }

  getMissionById(id) {
    return this.missions.find(x => x.id === id) || null;
  }
}

module.exports = new MissionQueue();
