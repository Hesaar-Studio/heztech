const { contextBridge, ipcRenderer } = require('electron');

const jarvisAPI = {
  // 1. System & Telemetry
  getSystemStats: () => ipcRenderer.invoke('system:get-stats'),
  launchApp: (appName) => ipcRenderer.invoke('system:launch-app', appName),
  execCommand: (command) => ipcRenderer.invoke('system:exec-cmd', command),
  runWorkflow: (action) => ipcRenderer.invoke('system:workflow', action),

  // 2. Vault Storage (Notes & Tasks)
  getNotes: () => ipcRenderer.invoke('vault:get-notes'),
  saveNotes: (data) => ipcRenderer.invoke('vault:save-notes', data),
  getTasks: () => ipcRenderer.invoke('vault:get-tasks'),
  saveTasks: (tasks) => ipcRenderer.invoke('vault:save-tasks', tasks),
  addTask: (task) => ipcRenderer.invoke('vault:add-task', task),
  toggleTask: (id) => ipcRenderer.invoke('vault:toggle-task', id),
  deleteTask: (id) => ipcRenderer.invoke('vault:delete-task', id),

  // 3. AI Core & Natural Language Chat
  pickTextAttachment: () => ipcRenderer.invoke('dialog:pick-text-attachment'),
  cancelChat: (id) => ipcRenderer.invoke('chat:cancel', id),
  sendMessage: (payload) => ipcRenderer.invoke('chat:send-message', payload),
  onChatToken: (callback) => {
    const listener = (_event, chunk) => callback(chunk);
    ipcRenderer.on('chat:token', listener);
    return () => ipcRenderer.removeListener('chat:token', listener);
  },
  transcribeAudio: (audioBase64, mimeType) => ipcRenderer.invoke('voice:transcribe', { audioBase64, mimeType }),
  liveStart: (options) => ipcRenderer.invoke('live:start', options || {}),
  liveStop: () => ipcRenderer.invoke('live:stop'),
  liveStatus: () => ipcRenderer.invoke('live:status'),
  liveSendAudio: (data) => ipcRenderer.invoke('live:send-audio', { data }),
  liveSendAudioEnd: () => ipcRenderer.invoke('live:send-audio-end'),
  liveSendText: (text) => ipcRenderer.invoke('live:send-text', { text }),
  listConversations: () => ipcRenderer.invoke('chat:list-conversations'),
  createConversation: (title) => ipcRenderer.invoke('chat:create-conversation', title),
  getChatHistory: (conversationId) => ipcRenderer.invoke('chat:get-history', conversationId),
  clearChatHistory: (conversationId) => ipcRenderer.invoke('chat:clear-history', conversationId),
  getAvailableModels: () => ipcRenderer.invoke('chat:get-models'),
  testModelConnection: (modelId) => ipcRenderer.invoke('model:test-connection', modelId),
  getAvailableTools: () => ipcRenderer.invoke('tools:get-available'),
  invokeTool: (toolName, params, options) => ipcRenderer.invoke('tools:invoke', { toolName, params, options }),
  cancelTask: (taskId) => ipcRenderer.invoke('task:cancel', taskId),
  getConnectionsTopology: () => ipcRenderer.invoke('connections:get-topology'),
  openExternal: (url) => ipcRenderer.invoke('system:open-external', url),

  // Live Internet & Web Access Tools
  searchWeb: (query, limit) => ipcRenderer.invoke('web:search', { query, limit }),
  fetchWeb: (url, maxChars) => ipcRenderer.invoke('web:fetch', { url, maxChars }),
  browsePage: (url, maxChars) => ipcRenderer.invoke('web:browse', { url, maxChars }),
  checkConnectivity: () => ipcRenderer.invoke('web:check-connectivity'),

  // Microsoft Playwright MCP Browser Operations
  browserNavigate: (url, agentId) => ipcRenderer.invoke('browser:navigate', { url, agentId }),
  browserSnapshot: (agentId) => ipcRenderer.invoke('browser:snapshot', { agentId }),
  browserClick: (selector, agentId) => ipcRenderer.invoke('browser:click', { selector, agentId }),
  browserType: (selector, text, agentId) => ipcRenderer.invoke('browser:type', { selector, text, agentId }),
  browserScreenshot: (filename, agentId) => ipcRenderer.invoke('browser:screenshot', { filename, agentId }),
  browserConsole: (agentId) => ipcRenderer.invoke('browser:console', { agentId }),
  browserNetwork: (agentId) => ipcRenderer.invoke('browser:network', { agentId }),
  browserClose: (agentId) => ipcRenderer.invoke('browser:close', { agentId }),
  browserStatus: () => ipcRenderer.invoke('browser:status'),

  // 4. Marketing & n8n Offline Queue
  triggerWebhook: (data) => ipcRenderer.invoke('marketing:trigger-webhook', data),
  getN8nQueue: () => ipcRenderer.invoke('marketing:get-queue'),
  flushN8nQueue: () => ipcRenderer.invoke('marketing:flush-queue'),
  getTrends: () => ipcRenderer.invoke('marketing:get-trends'),
  getAnalytics: () => ipcRenderer.invoke('marketing:get-analytics'),

  // 5. Config & Secrets
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),

  // Model router surface (providers, modes, media processing)
  setModelMode: (mode) => ipcRenderer.invoke('chat:set-mode', mode),
  getModelProviders: () => ipcRenderer.invoke('models:status'),
  pickMediaFile: () => ipcRenderer.invoke('dialog:pick-media'),
  mediaProbe: (inputPath) => ipcRenderer.invoke('media:probe', inputPath),
  mediaTrim: (options) => ipcRenderer.invoke('media:trim', options),
  mediaExtractFrame: (options) => ipcRenderer.invoke('media:extract-frame', options),
  mediaRemoveSilence: (options) => ipcRenderer.invoke('media:remove-silence', options),
  mediaAddSubtitles: (options) => ipcRenderer.invoke('media:subtitles', options),
  mediaChangeAspect: (options) => ipcRenderer.invoke('media:aspect-ratio', options),
  mediaEnhanceAudio: (options) => ipcRenderer.invoke('media:enhance-audio', options),
  mediaMergeClips: (options) => ipcRenderer.invoke('media:merge-clips', options),
  mediaExportPreset: (options) => ipcRenderer.invoke('media:export-preset', options),
  mediaExportCapCut: (options) => ipcRenderer.invoke('media:export-capcut', options),
  mediaImportCapCut: (draftName) => ipcRenderer.invoke('media:import-capcut', draftName),
  mediaProjectSave: (project) => ipcRenderer.invoke('media:project-save', project),
  mediaProjectLoad: (id) => ipcRenderer.invoke('media:project-load', id),
  mediaProjectList: () => ipcRenderer.invoke('media:project-list'),
  getDurableSummary: () => ipcRenderer.invoke('durable:summary'),

  // Social Intelligence Suite
  socialGetAccountsStatus: () => ipcRenderer.invoke('social:intelligence:status'),
  socialConnectAccount: (platformId, accountData) => ipcRenderer.invoke('social:intelligence:connect', { platformId, accountData }),
  socialDisconnectAccount: (platformId) => ipcRenderer.invoke('social:intelligence:disconnect', { platformId }),
  socialDiscoverTrends: (options) => ipcRenderer.invoke('social:intelligence:trends', options),
  socialAnalyzeCompetitor: (options) => ipcRenderer.invoke('social:intelligence:competitor', options),
  socialAnalyzeHook: (hook) => ipcRenderer.invoke('social:intelligence:hook', { hook }),
  socialAnalyzeTranscript: (transcript) => ipcRenderer.invoke('social:intelligence:transcript', { transcript }),
  socialGetAnalytics: (options) => ipcRenderer.invoke('social:intelligence:analytics', options),
  socialPreparePublish: (options) => ipcRenderer.invoke('social:intelligence:prepare-publish', options),
  socialExecutePublish: (options) => ipcRenderer.invoke('social:intelligence:execute-publish', options),

  // Treg Agent Tool Catalog
  tregGetStatus: () => ipcRenderer.invoke('treg:status'),
  tregConfigure: (options) => ipcRenderer.invoke('treg:configure', options),
  tregDisconnect: () => ipcRenderer.invoke('treg:disconnect'),
  tregSearchCatalog: (options) => ipcRenderer.invoke('treg:search', options),
  tregCallTool: (options) => ipcRenderer.invoke('treg:call', options),

  // 6. Security & Approvals Gate
  getApprovals: () => ipcRenderer.invoke('security:get-approvals'),
  resolveApproval: (id, approved, user) => ipcRenderer.invoke('security:resolve-approval', { id, approved, user }),
  getMfaStatus: () => ipcRenderer.invoke('mfa:get-status'),
  beginMfaEnrollment: (confirmed) => ipcRenderer.invoke('mfa:begin-enrollment', confirmed),
  completeMfaEnrollment: (code) => ipcRenderer.invoke('mfa:complete-enrollment', code),
  beginStepUp: (approvalId) => ipcRenderer.invoke('security:begin-step-up', approvalId),
  verifyStepUp: (challenge, approvalId, code) => ipcRenderer.invoke('security:verify-step-up', { challenge, approvalId, code }),
  getAuditLog: (limit) => ipcRenderer.invoke('security:get-audit-log', limit),

  // External Services Integrations Hub («با اجازه خودم»)
  getIntegrationsStatus: () => ipcRenderer.invoke('integrations:get-status'),
  updateIntegrationConfig: (service, values) => ipcRenderer.invoke('integrations:update-config', { service, values }),
  listSocialProviders: () => ipcRenderer.invoke('social:providers:list'),
  authorizeSocialProvider: (providerId, input, confirmed) => ipcRenderer.invoke('social:provider:authorize', { providerId, input, confirmed }),
  verifySocialProvider: (providerId, input) => ipcRenderer.invoke('social:provider:verify', { providerId, input }),
  disconnectSocialProvider: (providerId, confirmed) => ipcRenderer.invoke('social:provider:disconnect', { providerId, confirmed }),
  getMetaMcpTools: () => ipcRenderer.invoke('meta-mcp:list-tools'),
  getMetaConnectionStatus: () => ipcRenderer.invoke('meta-mcp:status'),
  verifyMetaAccounts: () => ipcRenderer.invoke('meta-mcp:verify-accounts'),
  startMetaAuthorization: (appId, confirmed) => ipcRenderer.invoke('meta-mcp:authorize', { appId, confirmed }),
  disconnectMetaAccount: () => ipcRenderer.invoke('meta-mcp:disconnect'),

  deliberateCouncil: (data) => ipcRenderer.invoke('council:deliberate', data),
  getCouncilSessions: (limit) => ipcRenderer.invoke('council:get-sessions', limit),
  getCouncilSession: (id) => ipcRenderer.invoke('council:get-session', id),
  getCouncilRoles: () => ipcRenderer.invoke('council:get-roles'),
  consultAgent: (roleId, prompt) => ipcRenderer.invoke('council:consult-agent', { roleId, prompt }),

  // Live Internet & Social Intelligence
  searchWeb: (query, limit) => ipcRenderer.invoke('web:search', { query, limit }),
  fetchWebContent: (url) => ipcRenderer.invoke('web:fetch', { url }),
  getInstagramIntel: (data) => ipcRenderer.invoke('social:instagram-intel', data),
  executeInstagramSkill: (skill, params) => ipcRenderer.invoke('instagram:execute-skill', { skill, params }),
  getInstagramHooks: () => ipcRenderer.invoke('instagram:get-hooks'),

  // Window Controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),


  // 8. Mission Lifecycle & Queue
  createMission: (data) => ipcRenderer.invoke('mission:create', data),
  getMissions: (limit) => ipcRenderer.invoke('mission:get-all', limit),
  updateMissionStatus: (id, status, details) => ipcRenderer.invoke('mission:update-status', { id, status, details }),
  cancelMission: (id) => ipcRenderer.invoke('mission:cancel', id),
  retryMission: (id) => ipcRenderer.invoke('mission:retry', id),

  // 9. Long-Term Memory & Knowledge Base
  searchMemory: (query, scope) => ipcRenderer.invoke('memory:search', { query, scope }),
  addMemory: (data) => ipcRenderer.invoke('memory:add', data),
  deleteMemory: (id) => ipcRenderer.invoke('memory:delete', id),
  onLiveTranscription: (callback) => {
    const handler = (e, val) => callback(val);
    ipcRenderer.on('live:transcription', handler);
    return () => ipcRenderer.removeListener('live:transcription', handler);
  },
  onLiveAudioChunk: (callback) => {
    const handler = (e, val) => callback(val);
    ipcRenderer.on('live:audio-chunk', handler);
    return () => ipcRenderer.removeListener('live:audio-chunk', handler);
  },
  onLiveInterrupted: (callback) => {
    const handler = (e, val) => callback(val);
    ipcRenderer.on('live:interrupted', handler);
    return () => ipcRenderer.removeListener('live:interrupted', handler);
  },
  onLiveToolStatus: (callback) => {
    const handler = (e, val) => callback(val);
    ipcRenderer.on('live:tool-status', handler);
    return () => ipcRenderer.removeListener('live:tool-status', handler);
  },
  onLiveStatus: (callback) => {
    const handler = (e, val) => callback(val);
    ipcRenderer.on('live:status', handler);
    return () => ipcRenderer.removeListener('live:status', handler);
  },
  onLiveError: (callback) => {
    const handler = (e, val) => callback(val);
    ipcRenderer.on('live:error', handler);
    return () => ipcRenderer.removeListener('live:error', handler);
  },
  onAgentToolCall: (callback) => {
    const handler = (e, val) => callback(val);
    ipcRenderer.on('agent:tool-call', handler);
    return () => ipcRenderer.removeListener('agent:tool-call', handler);
  },

  // 16. CapCut Bridge & Media Studio
  capcutGetStatus: () => ipcRenderer.invoke('capcut:status'),
  capcutListDrafts: () => ipcRenderer.invoke('capcut:list-drafts'),
  capcutInspectDraft: (name) => ipcRenderer.invoke('capcut:inspect-draft', { name }),
  capcutAddText: (opts) => ipcRenderer.invoke('capcut:add-text', opts),
  capcutLaunch: () => ipcRenderer.invoke('capcut:launch'),
  mediaTranscribeVoice: (opts) => ipcRenderer.invoke('media:transcribe-voice', opts),
  mediaGenerateVoice: (opts) => ipcRenderer.invoke('media:generate-voice', opts),

  // 17. Clipboard & Safe File Save
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write-text', { text }),
  saveFile: (opts) => ipcRenderer.invoke('dialog:save-file', opts)
};

// Expose under heztech, hesatech, hesaart, standard jarvis namespace and electronAPI
contextBridge.exposeInMainWorld('heztech', jarvisAPI);
contextBridge.exposeInMainWorld('hesatech', jarvisAPI);
contextBridge.exposeInMainWorld('hesaart', jarvisAPI);
contextBridge.exposeInMainWorld('jarvis', jarvisAPI);
contextBridge.exposeInMainWorld('electronAPI', jarvisAPI);
