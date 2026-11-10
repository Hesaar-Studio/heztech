/**
 * Google Antigravity & Codex Transactional Task Bridge
 * Supported integration via atomic file-based task exchange and MCP registry.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BRIDGE_ROOT = path.join(process.env.HEZTECH_DATA_DIR || 'C:\\Users\\Green\\openclaw\\vault', 'antigravity-bridge');
const MISSIONS_INBOX = path.join(BRIDGE_ROOT, 'inbox');
const RESULTS_OUTBOX = path.join(BRIDGE_ROOT, 'outbox');

// Ensure bridge directories exist
[BRIDGE_ROOT, MISSIONS_INBOX, RESULTS_OUTBOX].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

class AntigravityBridge {
  constructor() {
    this.inbox = MISSIONS_INBOX;
    this.outbox = RESULTS_OUTBOX;
  }

  /**
   * Submit an autonomous task package for Google Antigravity or Codex.
   */
  async submitTask({ title, prompt, tools = [], target = 'antigravity' }) {
    const taskId = 'ag_task_' + crypto.randomBytes(6).toString('hex');
    const taskPayload = {
      id: taskId,
      target, // 'antigravity' or 'codex'
      title,
      prompt,
      requestedTools: tools,
      submittedAt: new Date().toISOString(),
      status: 'pending'
    };

    const taskFile = path.join(this.inbox, `${taskId}.json`);
    const tempFile = taskFile + '.tmp';

    // Atomic write
    fs.writeFileSync(tempFile, JSON.stringify(taskPayload, null, 2), 'utf-8');
    fs.renameSync(tempFile, taskFile);

    return {
      success: true,
      taskId,
      filePath: taskFile,
      message: `تسک با شناسه ${taskId} در صف ارتباطی Antigravity ثبت شد.`
    };
  }

  /**
   * Check status of submitted tasks.
   */
  getPendingTasks() {
    try {
      const files = fs.readdirSync(this.inbox).filter(f => f.endsWith('.json'));
      return files.map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(this.inbox, f), 'utf-8'));
        } catch (e) {
          return { id: f, error: 'Unreadable' };
        }
      });
    } catch (e) {
      return [];
    }
  }

  /**
   * Retrieve any completed task results.
   */
  getCompletedResults() {
    try {
      const files = fs.readdirSync(this.outbox).filter(f => f.endsWith('.json'));
      return files.map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(this.outbox, f), 'utf-8'));
        } catch (e) {
          return { id: f, error: 'Unreadable' };
        }
      });
    } catch (e) {
      return [];
    }
  }
}

module.exports = new AntigravityBridge();
