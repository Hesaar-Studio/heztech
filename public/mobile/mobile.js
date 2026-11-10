/**
 * HesaTech Mobile Companion — Client Application Logic
 * Manages device pairing, Bearer auth, live state synchronization,
 * conversational chat, seven-agent council missions, and remote approvals.
 */

(function () {
  'use strict';
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  // API Base URL (auto-detect current host or fallback to loopback)
  const API_BASE = window.location.protocol === 'file:' ? 'http://127.0.0.1:18790' : window.location.origin;

  // Local Storage Keys
  const STORAGE_TOKEN = 'hesatech_mobile_token';
  const STORAGE_DEV_ID = 'hesatech_mobile_device_id';
  const STORAGE_DEV_NAME = 'hesatech_mobile_device_name';
  const STORAGE_LANG = 'hesatech_mobile_lang';

  // App State
  let authToken = localStorage.getItem(STORAGE_TOKEN) || null;
  let deviceId = localStorage.getItem(STORAGE_DEV_ID) || null;
  let deviceName = localStorage.getItem(STORAGE_DEV_NAME) || 'Android Device';
  let currentLang = localStorage.getItem(STORAGE_LANG) || 'fa';
  let syncInterval = null;
  let activeCouncilMode = 'DEEP';

  // DOM Elements
  const appShell = document.getElementById('app-shell');
  const connDot = document.getElementById('conn-dot');
  const connText = document.getElementById('conn-text');
  const devicePairedLabel = document.getElementById('device-paired-label');
  const btnPairModal = document.getElementById('btn-pair-modal');
  const btnLangToggle = document.getElementById('btn-lang-toggle');
  const pairingModal = document.getElementById('pairing-modal');
  const pairCodeInput = document.getElementById('pair-code-input');
  const pairDeviceNameInput = document.getElementById('pair-devicename-input');
  const btnSubmitPair = document.getElementById('btn-submit-pair');
  const btnClosePair = document.getElementById('btn-close-pair');
  const approvalBadge = document.getElementById('approval-badge');

  // Views & Tabs
  const views = document.querySelectorAll('.app-view');
  const navTabs = document.querySelectorAll('.nav-tab');

  // Chat Elements
  const chatMessagesContainer = document.getElementById('chat-messages-container');
  const chatInput = document.getElementById('chat-input');
  const btnSendChat = document.getElementById('btn-send-chat');
  const quickChips = document.querySelectorAll('.chip-btn');

  // Council Elements
  const councilTitle = document.getElementById('council-title');
  const councilDesc = document.getElementById('council-desc');
  const modePills = document.querySelectorAll('.mode-pill');
  const btnLaunchCouncil = document.getElementById('btn-launch-council');
  const councilResultsContainer = document.getElementById('council-results-container');

  // Approvals Elements
  const approvalsListContainer = document.getElementById('approvals-list-container');

  // Telemetry Elements
  const valCpu = document.getElementById('val-cpu');
  const valRam = document.getElementById('val-ram');
  const subRam = document.getElementById('sub-ram');
  const valDisk = document.getElementById('val-disk');
  const subDisk = document.getElementById('sub-disk');
  const valUptime = document.getElementById('val-uptime');
  const subHostname = document.getElementById('sub-hostname');

  // Tasks Elements
  const newTaskInput = document.getElementById('new-task-input');
  const btnAddTask = document.getElementById('btn-add-task');
  const tasksListContainer = document.getElementById('tasks-list-container');
  const vaultNotesDisplay = document.getElementById('vault-notes-display');

  // -----------------------------------------------------------
  // Register Service Worker
  // -----------------------------------------------------------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/mobile/sw.js').catch((err) => {
      console.warn('[SW] Registration failed:', err);
    });
  }

  // -----------------------------------------------------------
  // Navigation & View Switching
  // -----------------------------------------------------------
  function switchView(targetViewId) {
    navTabs.forEach((t) => {
      if (t.getAttribute('data-view') === targetViewId) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });

    views.forEach((v) => {
      if (v.id === targetViewId) {
        v.classList.add('active');
      } else {
        v.classList.remove('active');
      }
    });

    if (targetViewId === 'view-chat') {
      scrollToBottom();
    } else if (targetViewId === 'view-orb') {
      runMobOrbLoop();
    }
  }
  window.switchView = switchView;

  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetViewId = tab.getAttribute('data-view');
      switchView(targetViewId);
    });
  });

  // -----------------------------------------------------------
  // Pairing & Authentication
  // -----------------------------------------------------------
  function updateDeviceUI() {
    if (authToken) {
      devicePairedLabel.textContent = `${deviceName} (${currentLang === 'fa' ? 'متصل' : 'Paired'})`;
      devicePairedLabel.style.color = 'var(--accent-cyan)';
    } else {
      devicePairedLabel.textContent = currentLang === 'fa' ? 'جفت‌نشده (نیاز به کد)' : 'Unpaired';
      devicePairedLabel.style.color = 'var(--accent-rose)';
    }
  }

  btnPairModal.addEventListener('click', () => {
    pairingModal.classList.add('active');
    pairDeviceNameInput.value = deviceName;
    pairCodeInput.focus();
  });

  btnClosePair.addEventListener('click', () => {
    pairingModal.classList.remove('active');
  });

  btnSubmitPair.addEventListener('click', async () => {
    const code = pairCodeInput.value.trim();
    const customName = pairDeviceNameInput.value.trim() || 'Android Device';

    if (!code || code.length !== 6) {
      alert(currentLang === 'fa' ? 'لطفاً کد ۶ رقمی معتبر وارد کنید.' : 'Please enter a valid 6-digit code.');
      return;
    }

    btnSubmitPair.disabled = true;
    btnSubmitPair.textContent = currentLang === 'fa' ? 'در حال تایید...' : 'Pairing...';

    try {
      const res = await fetch(`${API_BASE}/api/v1/remote/pairing/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          deviceName: customName,
          platform: 'android-pwa'
        })
      });

      const data = await res.json();
      if (data.success) {
        authToken = data.token;
        deviceId = data.deviceId;
        deviceName = data.deviceName;

        localStorage.setItem(STORAGE_TOKEN, authToken);
        localStorage.setItem(STORAGE_DEV_ID, deviceId);
        localStorage.setItem(STORAGE_DEV_NAME, deviceName);

        updateDeviceUI();
        pairingModal.classList.remove('active');
        fetchInitialChatHistory();
        syncState();
      } else {
        alert(currentLang === 'fa' ? (data.error || 'خطا در جفت‌سازی') : (data.errorEn || 'Pairing error'));
      }
    } catch (err) {
      alert(currentLang === 'fa' ? 'خطا در برقراری ارتباط با سرور' : 'Connection error');
    } finally {
      btnSubmitPair.disabled = false;
      btnSubmitPair.textContent = currentLang === 'fa' ? 'اتصال و دریافت مجوز' : 'Pair Device';
    }
  });

  // -----------------------------------------------------------
  // API Fetch Helper (With Bearer Auth)
  // -----------------------------------------------------------
  async function apiFetch(endpoint, options = {}) {
    const headers = options.headers || {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    headers['Content-Type'] = 'application/json';

    return fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });
  }

  // -----------------------------------------------------------
  // State Synchronization Poller
  // -----------------------------------------------------------
  async function syncState() {
    if (!authToken) {
      connDot.className = 'status-dot offline';
      connText.textContent = currentLang === 'fa' ? 'جفت‌نشده' : 'Unpaired';
      return;
    }

    const t0 = performance.now();
    try {
      const res = await apiFetch('/api/v1/sync/state');
      if (res.status === 401) {
        connDot.className = 'status-dot offline';
        connText.textContent = currentLang === 'fa' ? 'منقضی شده' : 'Expired';
        return;
      }

      const data = await res.json();
      const latency = Math.round(performance.now() - t0);

      if (data.success) {
        connDot.className = 'status-dot';
        connText.textContent = `${latency}ms`;

        // Update Telemetry
        if (data.system) {
          valCpu.textContent = `${data.system.cpu?.usagePercent || 0}%`;
          subHostname.textContent = data.system.hostname || 'Windows Host';

          const mem = data.system.memory;
          if (mem) {
            valRam.textContent = `${mem.usagePercent}%`;
            subRam.textContent = `${mem.usedGB} / ${mem.totalGB} GB`;
          }

          const disk = data.system.disk;
          if (disk) {
            valDisk.textContent = `${disk.percent}%`;
            subDisk.textContent = `${disk.freeGB} GB آزاد`;
          }

          const uptimeSec = data.system.uptimeSeconds || 0;
          const hours = Math.floor(uptimeSec / 3600);
          const mins = Math.floor((uptimeSec % 3600) / 60);
          valUptime.textContent = `${hours}h ${mins}m`;
        }

        // Update Approvals
        renderApprovals(data.pendingApprovals || []);

        // Update Tasks
        renderTasks(data.tasks || []);

        // Update Notes
        if (data.notes) {
          vaultNotesDisplay.textContent = data.notes;
        }

        // Update Topology Nodes
        if (data.topology && data.topology.nodes) {
          const geminiNode = data.topology.nodes.find(n => n.id === 'node_gemini');
          if (geminiNode) {
            const el = document.getElementById('node-gemini');
            if (el) {
              el.className = `verdict-tag ${geminiNode.status === 'connected' ? 'approved' : 'conditional'}`;
              el.textContent = geminiNode.status === 'connected' ? 'متصل' : 'آفلاین';
            }
          }
        }
      }
    } catch (err) {
      connDot.className = 'status-dot offline';
      connText.textContent = currentLang === 'fa' ? 'قطع ارتباط' : 'Offline';
    }
  }

  // -----------------------------------------------------------
  // Chat History & Messaging
  // -----------------------------------------------------------
  async function fetchInitialChatHistory() {
    if (!authToken) return;
    try {
      const res = await apiFetch('/api/v1/remote/chat/history');
      const data = await res.json();
      if (data.success && Array.isArray(data.messages) && data.messages.length > 0) {
        chatMessagesContainer.innerHTML = '';
        data.messages.forEach(appendMessageBubble);
        scrollToBottom();
      }
    } catch (e) {}
  }

  function appendMessageBubble(msg) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${msg.role === 'user' ? 'user' : 'assistant'}`;

    const textSpan = document.createElement('div');
    textSpan.textContent = msg.content;
    bubble.appendChild(textSpan);

    const meta = document.createElement('div');
    meta.className = 'chat-bubble-meta';
    const roleTitle = msg.role === 'user' ? (msg.device || 'همراه موبایل') : 'ARTA (اَرتا)';
    const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '';
    meta.innerHTML = `<span>${roleTitle}</span><span>${timeStr}</span>`;
    bubble.appendChild(meta);

    chatMessagesContainer.appendChild(bubble);
  }

  function scrollToBottom() {
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }

  async function sendChatMessage(query) {
    const text = (query || chatInput.value).trim();
    if (!text) return;

    if (!authToken) {
      pairingModal.classList.add('active');
      return;
    }

    // Append user message immediately
    appendMessageBubble({
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      device: deviceName
    });
    chatInput.value = '';
    scrollToBottom();

    btnSendChat.disabled = true;

    try {
      const res = await apiFetch('/api/v1/remote/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text, model: 'gemini-3.8-flash' })
      });
      const data = await res.json();
      if (data.success) {
        appendMessageBubble({
          role: 'assistant',
          content: data.reply,
          timestamp: data.timestamp || new Date().toISOString()
        });
        scrollToBottom();
      } else {
        appendMessageBubble({
          role: 'assistant',
          content: 'خطا در دریافت پاسخ: ' + (data.error || 'Server error'),
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      appendMessageBubble({
        role: 'assistant',
        content: 'عدم پاسخگویی سرور مرکزی هساتک.',
        timestamp: new Date().toISOString()
      });
    } finally {
      btnSendChat.disabled = false;
    }
  }

  btnSendChat.addEventListener('click', () => sendChatMessage());
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });

  quickChips.forEach((btn) => {
    btn.addEventListener('click', () => {
      const query = btn.getAttribute('data-query');
      if (query) sendChatMessage(query);
    });
  });

  // -----------------------------------------------------------
  // Council Mode Deliberation
  // -----------------------------------------------------------
  modePills.forEach((pill) => {
    pill.addEventListener('click', () => {
      modePills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      activeCouncilMode = pill.getAttribute('data-mode') || 'DEEP';
    });
  });

  btnLaunchCouncil.addEventListener('click', async () => {
    const title = councilTitle.value.trim();
    const desc = councilDesc.value.trim();

    if (!title) {
      alert(currentLang === 'fa' ? 'لطفاً عنوان ماموریت را وارد کنید.' : 'Mission title required.');
      return;
    }

    if (!authToken) {
      pairingModal.classList.add('active');
      return;
    }

    btnLaunchCouncil.disabled = true;
    btnLaunchCouncil.innerHTML = `<span class="status-dot connecting"></span> ${currentLang === 'fa' ? 'شورا در حال بررسی چندعاملی...' : 'Deliberating...'}`;
    councilResultsContainer.innerHTML = '';

    try {
      const res = await apiFetch('/api/v1/remote/council/deliberate', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: desc,
          mode: activeCouncilMode
        })
      });

      const data = await res.json();
      if (data.success && data.session) {
        renderCouncilSession(data.session);
      } else {
        councilResultsContainer.innerHTML = `<div class="council-card" style="border-color:var(--accent-rose);"><p style="color:var(--accent-rose);">${data.error || 'خطا در بررسی شورا'}</p></div>`;
      }
    } catch (err) {
      councilResultsContainer.innerHTML = `<div class="council-card" style="border-color:var(--accent-rose);"><p style="color:var(--accent-rose);">خطا در ارتباط با موتور شورا</p></div>`;
    } finally {
      btnLaunchCouncil.disabled = false;
      btnLaunchCouncil.innerHTML = `<svg style="width:16px;height:16px;fill:currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> ${currentLang === 'fa' ? 'ارسال ماموریت و آغاز شور شورا' : 'Launch Deliberation'}`;
    }
  });

  function renderCouncilSession(session) {
    let html = '';

    // Final Verdict Hero
    if (session.finalVerdict) {
      const v = session.finalVerdict;
      const verdictClass = v.verdict === 'APPROVED' ? 'approved' : (v.verdict === 'REVISION_REQUIRED' ? 'conditional' : 'rejected');
      const verdictTitle = v.verdict === 'APPROVED' ? 'تایید و ابلاغ اجرای ماموریت' : (v.verdict === 'REVISION_REQUIRED' ? 'تایید مشروط با الزامات امنیتی' : 'رد صلاحیت ماموریت');

      html += `
        <div class="council-card" style="border-color: var(--accent-purple); background: linear-gradient(135deg, rgba(168,85,247,0.15), rgba(7,11,20,0.8));">
          <div class="council-card-header">
            <span class="agent-title" style="color:#fff;">حکم نهایی قاضی ارشد شورا (Judge)</span>
            <span class="verdict-tag ${verdictClass}">${escapeHtml(v.verdict)}</span>
          </div>
          <p style="font-size:12px; font-weight:700; color:var(--accent-cyan); margin-bottom:6px;">${verdictTitle}</p>
          <p style="font-size:12px; color:var(--text-main); margin-bottom:10px;">${escapeHtml(v.recommendation)}</p>
          <div style="font-size:11px; color:var(--text-muted); display:flex; gap:10px; flex-wrap:wrap;">
            <span>ضریب اطمینان: <b>${v.overallScore ?? 0}%</b></span>
            <span>امتیاز امکان‌سنجی: <b>${v.rubricScores?.operationalFeasibility ?? 0}</b></span>
            <span>امتیاز امنیت: <b>${v.rubricScores?.securityAndPrivacy ?? 0}</b></span>
          </div>
        </div>
      `;
    }

    // Round 1 Assessments
    if (session.rounds && session.rounds.length > 0) {
      const r1 = session.rounds[0];
      html += `<h4 style="font-size:13px; margin: 12px 0 6px; color:var(--accent-cyan);">دیدگاه مستقل اعضای شورا (دور اول)</h4>`;
      (r1.assessments || []).forEach((item) => {
        const vClass = 'conditional';
        html += `
          <div class="council-card">
            <div class="council-card-header">
              <span class="agent-title">${escapeHtml(item.title || item.agent)}</span>
              <span class="verdict-tag ${vClass}">${escapeHtml(item.model)} (${escapeHtml(item.confidenceScore ?? 0)}%)</span>
            </div>
            <p style="font-size:12px; color:var(--text-main); line-height:1.4;">${escapeHtml(item.analysis)}</p>
          </div>
        `;
      });
    }

    councilResultsContainer.innerHTML = html;
  }

  // -----------------------------------------------------------
  // Approvals Gate Management
  // -----------------------------------------------------------
  function renderApprovals(approvals) {
    if (approvals.length > 0) {
      approvalBadge.style.display = 'block';
      approvalBadge.textContent = approvals.length;
    } else {
      approvalBadge.style.display = 'none';
    }

    if (approvals.length === 0) {
      approvalsListContainer.innerHTML = `
        <div class="council-card" style="text-align:center; padding:24px 16px;">
          <p style="font-size:13px; color:var(--text-muted);">
            ✅ هیچ عملیات معلق نیازمند تاییدی وجود ندارد.
          </p>
        </div>
      `;
      return;
    }

    let html = '';
    approvals.forEach((appr) => {
      html += `
        <div class="approval-item high-risk" id="approval-item-${appr.id}">
          <div class="approval-header">
            <span style="font-weight:700; font-size:13px; color:#fff;">${escapeHtml(appr.type)}</span>
            <span class="risk-badge">${escapeHtml(appr.riskLevel || 'HIGH RISK')}</span>
          </div>
          <pre style="font-size:11px; color:var(--text-muted); background:var(--bg-secondary); padding:8px; border-radius:6px; overflow-x:auto;">${escapeHtml(typeof appr.details === 'object' ? JSON.stringify(appr.details, null, 2) : appr.details)}</pre>
          <div class="approval-actions">
            <button class="btn-approve" onclick="window.resolveApproval('${appr.id}', true)">تایید و اجرا در ویندوز</button>
            <button class="btn-reject" onclick="window.resolveApproval('${appr.id}', false)">رد و لغو عملیات</button>
          </div>
        </div>
      `;
    });
    approvalsListContainer.innerHTML = html;
  }

  window.resolveApproval = async function (id, approved) {
    if (!authToken) return;
    try {
      const res = await apiFetch(`/api/v1/remote/approvals/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ approved })
      });
      const data = await res.json();
      if (data.success) {
        syncState();
      } else {
        alert(data.error || 'خطا در ثبت تایید');
      }
    } catch (e) {
      alert('خطا در ارتباط با سرور');
    }
  };

  // -----------------------------------------------------------
  // Tasks Management
  // -----------------------------------------------------------
  function renderTasks(tasks) {
    if (!tasks || tasks.length === 0) {
      tasksListContainer.innerHTML = `<p style="font-size:12px; color:var(--text-muted); text-align:center;">تسک فعالی ثبت نشده است.</p>`;
      return;
    }

    let html = '';
    tasks.forEach((t) => {
      html += `
        <div class="task-item ${t.done ? 'done' : ''}">
          <input type="checkbox" class="task-checkbox" ${t.done ? 'checked' : ''} onchange="window.toggleTask('${t.id}')">
          <span class="task-title">${escapeHtml(t.title)}</span>
          <span style="font-size:10px; color:var(--text-muted);">${escapeHtml(t.time)}</span>
        </div>
      `;
    });
    tasksListContainer.innerHTML = html;
  }

  window.toggleTask = async function (id) {
    if (!authToken) return;
    try {
      await apiFetch(`/api/v1/tasks/${id}/toggle`, { method: 'PATCH' });
      syncState();
    } catch (e) {}
  };

  btnAddTask.addEventListener('click', async () => {
    const title = newTaskInput.value.trim();
    if (!title) return;
    if (!authToken) {
      pairingModal.classList.add('active');
      return;
    }

    try {
      await apiFetch('/api/v1/tasks', {
        method: 'POST',
        body: JSON.stringify({ title, time: 'Today', priority: 'medium' })
      });
      newTaskInput.value = '';
      syncState();
    } catch (e) {}
  });

  // -----------------------------------------------------------
  // Language Toggle (FA / EN)
  // -----------------------------------------------------------
  btnLangToggle.addEventListener('click', () => {
    currentLang = currentLang === 'fa' ? 'en' : 'fa';
    localStorage.setItem(STORAGE_LANG, currentLang);
    applyLanguage();
  });

  function applyLanguage() {
    if (currentLang === 'en') {
      document.body.classList.add('ltr');
      document.documentElement.dir = 'ltr';
      btnLangToggle.textContent = 'FA';
      btnPairModal.textContent = 'Pairing';
      document.getElementById('lbl-active-model').textContent = 'Active Model:';
      document.getElementById('tab-label-chat').textContent = 'Chat';
      document.getElementById('tab-label-orb').textContent = 'Voice Orb';
      document.getElementById('tab-label-council').textContent = 'Council';
      document.getElementById('tab-label-approvals').textContent = 'Approvals';
      document.getElementById('tab-label-telemetry').textContent = 'Telemetry';
      document.getElementById('tab-label-vault').textContent = 'Vault';
      document.getElementById('chat-input').placeholder = 'Enter command or message...';
    } else {
      document.body.classList.remove('ltr');
      document.documentElement.dir = 'rtl';
      btnLangToggle.textContent = 'EN';
      btnPairModal.textContent = 'جفت‌سازی';
      document.getElementById('lbl-active-model').textContent = 'مدل فعال:';
      document.getElementById('tab-label-chat').textContent = 'گفتگو';
      document.getElementById('tab-label-orb').textContent = 'کره صوتی';
      document.getElementById('tab-label-council').textContent = 'شورا';
      document.getElementById('tab-label-approvals').textContent = 'تایید هویت';
      document.getElementById('tab-label-telemetry').textContent = 'تله‌متری';
      document.getElementById('tab-label-vault').textContent = 'والت';
      document.getElementById('chat-input').placeholder = 'دستور یا پرسش خود را بنویسید...';
    }
    updateDeviceUI();
  }

  // -----------------------------------------------------------
  // Mobile Holographic Voice Orb Companion Controller
  // -----------------------------------------------------------
  const mobOrbCanvas = document.getElementById('mob-orb-canvas');
  const mobOrbSphere = document.getElementById('mob-orb-sphere');
  const mobOrbDateLabel = document.getElementById('mob-orb-date-label');
  const mobOrbStatusLabel = document.getElementById('mob-orb-status-label');
  const mobOrbTranscript = document.getElementById('mob-orb-transcript');
  const mobBtnOrbEnd = document.getElementById('mob-btn-orb-end');
  const mobBtnOrbMode = document.getElementById('mob-btn-orb-mode');
  const mobBtnOrbMic = document.getElementById('mob-btn-orb-mic');
  const mobOrbVoiceSelect = document.getElementById('mob-orb-voice-select');

  if (mobOrbDateLabel) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }).toUpperCase();
    mobOrbDateLabel.textContent = `${dateStr} • COMMAND CENTER`;
  }

  let mobOrbParticles = [];
  function initMobParticles(w, h) {
    mobOrbParticles = [];
    for (let i = 0; i < 22; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * (w * 0.4);
      mobOrbParticles.push({
        x: w / 2 + Math.cos(angle) * dist,
        y: h / 2 + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 1 + Math.random() * 1.5,
        alpha: 0.3 + Math.random() * 0.6,
        pulseVal: Math.random() * Math.PI
      });
    }
  }

  let mobOrbEnergy = 0;
  let mobOrbAnimId = null;

  function runMobOrbLoop() {
    const viewOrb = document.getElementById('view-orb');
    if (!viewOrb || !viewOrb.classList.contains('active')) {
      mobOrbAnimId = null;
      return;
    }

    const canvas = mobOrbCanvas;
    const ctx = canvas ? canvas.getContext('2d') : null;
    const w = canvas ? canvas.width : 145;
    const h = canvas ? canvas.height : 145;

    if (mobOrbParticles.length === 0) initMobParticles(w, h);

    // Subtle idle pulsation
    mobOrbEnergy = 0.05 + Math.sin(Date.now() / 400) * 0.04;

    if (mobOrbSphere) {
      const scale = 1 + mobOrbEnergy * 0.25;
      mobOrbSphere.style.transform = `scale(${scale.toFixed(3)})`;
    }

    if (ctx) {
      ctx.clearRect(0, 0, w, h);
      mobOrbParticles.forEach(p => {
        p.pulseVal += 0.03;
        p.x += p.vx;
        p.y += p.vy;
        const dx = p.x - w / 2;
        const dy = p.y - h / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > w * 0.42) {
          p.x = w / 2 + (dx / dist) * (w * 0.42);
          p.y = h / 2 + (dy / dist) * (w * 0.42);
          p.vx = -p.vx;
          p.vy = -p.vy;
        }

        const a = Math.min(1, Math.max(0.1, p.alpha + Math.sin(p.pulseVal) * 0.3));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(165, 243, 252, ${a.toFixed(2)})`;
        ctx.fill();
      });
    }

    mobOrbAnimId = requestAnimationFrame(runMobOrbLoop);
  }

  if (mobBtnOrbEnd) {
    mobBtnOrbEnd.addEventListener('click', () => {
      switchView('view-chat');
    });
  }

  if (mobBtnOrbMode) {
    mobBtnOrbMode.addEventListener('click', () => {
      mobBtnOrbMode.classList.toggle('active-action');
      if (mobBtnOrbMode.classList.contains('active-action')) {
        mobBtnOrbMode.textContent = '🛡️ Listen-only';
      } else {
        mobBtnOrbMode.textContent = '⚡ Action Mode';
      }
    });
  }

  if (mobBtnOrbMic) {
    mobBtnOrbMic.addEventListener('click', () => {
      const isMuted = mobBtnOrbMic.textContent.includes('Muted');
      if (isMuted) {
        mobBtnOrbMic.textContent = '🎤 Mic Active';
        mobBtnOrbMic.style.color = '';
        if (mobOrbStatusLabel) mobOrbStatusLabel.textContent = currentLang === 'fa' ? 'آماده گفتگو... (صحبت کنید)' : 'Listening... (Speak now)';
      } else {
        mobBtnOrbMic.textContent = '🔇 Muted';
        mobBtnOrbMic.style.color = '#fca5a5';
        if (mobOrbStatusLabel) mobOrbStatusLabel.textContent = currentLang === 'fa' ? 'میکروفون بی‌صدا است' : 'Microphone muted';
      }
    });
  }

  // -----------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------
  applyLanguage();
  updateDeviceUI();

  if (!authToken) {
    // If not paired, open pairing modal automatically on first launch
    pairingModal.classList.add('active');
  } else {
    fetchInitialChatHistory();
  }

  // Initial Sync and Start Poller (every 3 seconds)
  syncState();
  syncInterval = setInterval(syncState, 3000);

})();
