/**
 * JARVIS Long-Term Memory & Knowledge Base
 * Provides isolated project memory, indexed knowledge search, and Vault storage.
 */

const fs = require('fs');
const path = require('path');

const VAULT_DIR = path.resolve(process.env.HEZTECH_DATA_DIR || 'C:\\Users\\Green\\openclaw\\vault');
const KNOWLEDGE_FILE = path.join(VAULT_DIR, 'knowledge.json');
const TASKS_FILE = path.join(VAULT_DIR, 'tasks.json');
const NOTES_FILE = path.join(VAULT_DIR, 'notes.md');
const CONVERSATIONS_FILE = path.join(VAULT_DIR, 'conversations.json');

class MemoryManager {
  constructor() {
    this.ensureFiles();
  }

  ensureFiles() {
    if (!fs.existsSync(VAULT_DIR)) {
      fs.mkdirSync(VAULT_DIR, { recursive: true });
    }
    if (!fs.existsSync(KNOWLEDGE_FILE)) {
      const initialKnowledge = [
        {
          id: 'kn_1',
          scope: 'GLOBAL',
          title: 'معماری و دایرکتوری Hesaart Studio',
          content: 'پروژه مستقل مدیریت چندعاملی در C:\\Users\\Green\\openclaw\\jarvis-command-center با پایگاه داده Vault در C:\\Users\\Green\\openclaw\\vault',
          tags: ['architecture', 'hesaart', 'system'],
          createdAt: new Date().toISOString()
        }
      ];
      fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(initialKnowledge, null, 2), 'utf-8');
    }
  }

  getKnowledge(scope = null) {
    try {
      if (fs.existsSync(KNOWLEDGE_FILE)) {
        const list = JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, 'utf-8')) || [];
        if (!scope || scope === 'ALL') return list;
        return list.filter(k => k.scope === 'GLOBAL' || k.scope === scope);
      }
    } catch (e) {
      console.error('[Memory] Error reading knowledge:', e.message);
    }
    return [];
  }

  searchKnowledge(query, scope = null) {
    const list = this.getKnowledge(scope);
    if (!query) return list;
    const lower = query.toLowerCase();
    return list.filter(k => 
      k.title.toLowerCase().includes(lower) || 
      k.content.toLowerCase().includes(lower) ||
      (k.tags && k.tags.some(t => t.toLowerCase().includes(lower)))
    );
  }

  addKnowledge({ title, content, scope = 'GLOBAL', tags = [] }) {
    try {
      const list = this.getKnowledge('ALL');
      const item = {
        id: 'kn_' + Date.now(),
        scope,
        title: title || 'یادداشت دانش بدون عنوان',
        content: content || '',
        tags: Array.isArray(tags) ? tags : [tags],
        createdAt: new Date().toISOString()
      };
      list.unshift(item);
      fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(list, null, 2), 'utf-8');
      return { success: true, item };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  deleteKnowledge(id) {
    try {
      let list = this.getKnowledge('ALL');
      list = list.filter(k => k.id !== id);
      fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(list, null, 2), 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Vault Notes
  getNotes() {
    try {
      if (!fs.existsSync(NOTES_FILE)) return '# یادداشت‌های اجرایی استودیو حصارت\n';
      return fs.readFileSync(NOTES_FILE, 'utf-8');
    } catch (e) {
      return '';
    }
  }

  saveNotes(content) {
    try {
      fs.writeFileSync(NOTES_FILE, content || '', 'utf-8');
      return { success: true, path: NOTES_FILE };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Vault Tasks
  getTasks() {
    try {
      if (!fs.existsSync(TASKS_FILE)) return [];
      return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8')) || [];
    } catch (e) {
      return [];
    }
  }

  saveTasks(tasks) {
    try {
      fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // --- Conversational Memory & Chat History ---
  getConversations() {
    try {
      if (!fs.existsSync(CONVERSATIONS_FILE)) return [];
      return JSON.parse(fs.readFileSync(CONVERSATIONS_FILE, 'utf-8')) || [];
    } catch (e) {
      console.error('[MemoryManager] Error reading conversations:', e.message);
      return [];
    }
  }

  saveConversations(convs) {
    try {
      fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(convs, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('[MemoryManager] Error saving conversations:', e.message);
      return false;
    }
  }

  recordMessage(role, content, meta = {}) {
    if (!content || !String(content).trim()) return null;
    try {
      let convs = this.getConversations();
      if (!convs || !convs.length) {
        convs = [{
          id: 'conv_default',
          title: 'جلسه گفتگوی هزتک',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: []
        }];
      }
      const targetId = meta.conversationId || (convs[0] ? convs[0].id : 'conv_default');
      let active = convs.find(c => c.id === targetId);
      if (!active) {
        active = convs[0] || {
          id: targetId,
          title: String(content).slice(0, 80),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: []
        };
        if (!convs.includes(active)) convs.unshift(active);
      }

      const msg = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        role: role === 'model' ? 'assistant' : role,
        content: String(content).trim(),
        timestamp: new Date().toISOString(),
        model: meta.model || 'gemini-3.8-live',
        provider: meta.provider || 'gemini-live-voice',
        ...meta
      };

      if (!active.messages) active.messages = [];
      active.messages.push(msg);
      if (active.messages.length > 200) active.messages.shift();
      active.updatedAt = new Date().toISOString();
      this.saveConversations(convs);
      return msg;
    } catch (err) {
      console.error('[MemoryManager] recordMessage error:', err.message);
      return null;
    }
  }

  getRecentHistory(limit = 15) {
    try {
      const convs = this.getConversations();
      if (!convs || !convs.length) return [];
      
      // Look at the most recently updated conversation first
      const active = convs[0];
      const msgs = (active && active.messages) ? active.messages : [];
      return msgs.slice(-limit);
    } catch (err) {
      console.error('[MemoryManager] getRecentHistory error:', err.message);
      return [];
    }
  }

  searchConversations(query, limit = 10) {
    if (!query) return [];
    const qLower = String(query).toLowerCase();
    const convs = this.getConversations();
    const matches = [];

    for (const conv of convs) {
      if (!conv.messages) continue;
      for (const msg of conv.messages) {
        if (msg.content && msg.content.toLowerCase().includes(qLower)) {
          matches.push({
            conversationId: conv.id,
            conversationTitle: conv.title,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp
          });
          if (matches.length >= limit) return matches;
        }
      }
    }
    return matches;
  }

  getMemorySnapshotForPrompt(limit = 15) {
    const history = this.getRecentHistory(limit);
    if (!history.length) {
      return 'هیچ تاریخچه پیام قبلی در حافظه ثبت نشده است. این اولین دور گفتگو با مالک است.';
    }

    const lines = [];
    lines.push('### سوابق گفتگوهای اخیر با مالک سیستم (پایگاه داده گفتگوهای محلی):');
    history.forEach((m, idx) => {
      const speaker = m.role === 'user' ? 'مالک سیستم (کاربر)' : 'دستیار (هستک)';
      const text = String(m.content).trim().replace(/\s+/g, ' ');
      lines.push(`[${idx + 1}] ${speaker}: «${text}»`);
    });

    // Also include quick vault notes preview if present
    const notes = this.getNotes().trim();
    if (notes && notes.length > 10) {
      lines.push('\n### یادداشت‌های جاری والت:');
      lines.push(notes.slice(0, 300) + (notes.length > 300 ? '...' : ''));
    }

    return lines.join('\n');
  }
}

module.exports = new MemoryManager();
