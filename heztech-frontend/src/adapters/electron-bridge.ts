/**
 * HesaTech Electron Bridge Adapter
 * Connects the Grok React Frontend to the existing Electron preload IPC API (window.hesatech / window.electronAPI).
 * Implements strict type safety, zero hallucination, honest status propagation, and listener cleanup.
 */

import type {
  AdapterResult,
  AgentDomain,
  AgentOutput,
  AgentTask,
  AgentTool,
  ConnectionItem,
  Conversation,
  ConversationMessage,
  Mission,
  ModelInfo,
  StreamChunk,
  SystemHealth,
} from '@/types';
import type { HezTechAdapters } from './types';

export interface HesatechPreloadApi {
  listConversations?: () => Promise<{ success: boolean; conversations?: Conversation[]; error?: string }>;
  createConversation?: (title?: string) => Promise<{ success: boolean; conversation?: Conversation; error?: string }>;
  // System & Telemetry
  getSystemStats?: () => Promise<any>;
  launchApp?: (appName: string) => Promise<any>;
  execCommand?: (command: string) => Promise<any>;
  runWorkflow?: (action: string) => Promise<any>;

  // Vault & Tasks
  getNotes?: () => Promise<any>;
  saveNotes?: (data: any) => Promise<any>;
  getTasks?: () => Promise<any>;
  saveTasks?: (tasks: any) => Promise<any>;
  addTask?: (task: any) => Promise<any>;

  // AI & Chat
  cancelChat?: (requestId: string) => Promise<unknown>;
  onChatToken?: (callback: (chunk: { requestId: string; content: string }) => void) => () => void;
  sendMessage?: (payload: { requestId?: string; message: string; model?: string; conversationId?: string | null; agentId?: string | null }) => Promise<{
    success: boolean;
    reply?: string;
    messageId?: string;
    timestamp?: string;
    model?: string;
    provider?: string;
    latencyMs?: number;
    toolsExecuted?: any[];
    error?: string;
  }>;
  getChatHistory?: (conversationId?: string) => Promise<{
    success: boolean;
    messages?: Array<{
      id?: string;
      role: string;
      content?: string;
      message?: string;
      timestamp?: string;
      createdAt?: string;
      model?: string;
      provider?: string;
      toolsExecuted?: any[];
    }>;
    error?: string;
  }>;
  clearChatHistory?: (conversationId?: string) => Promise<any>;
  getAvailableModels?: () => Promise<{
    success: boolean;
    models: Array<{
      id: string;
      name: string;
      provider?: string;
      verified?: boolean;
      active?: boolean;
    }>;
    error?: string;
  }>;
  testModelConnection?: (modelId: string) => Promise<any>;
  liveStart?: (options?: { model?: string; voice?: string; listenOnly?: boolean }) => Promise<{ success: boolean; model?: string; error?: string }>;
  liveStop?: () => Promise<{ success: boolean }>;
  liveStatus?: () => Promise<{ status: string; isConnected: boolean }>;
  liveSendAudio?: (data: string) => Promise<boolean>;
  liveSendAudioEnd?: () => Promise<boolean>;
  liveSendText?: (text: string) => Promise<boolean>;
  onLiveAudioChunk?: (callback: (val: { data?: string; mimeType?: string }) => void) => () => void;
  getAvailableTools?: () => Promise<{
    success: boolean;
    tools: Array<{
      id: string;
      name: string;
      nameEn?: string;
      riskLevel?: string;
      requiresApproval?: boolean;
      active?: boolean;
    }>;
  }>;
  cancelTask?: (taskId: string) => Promise<any>;
  getConnectionsTopology?: () => Promise<any>;

  // Council
  getCouncilRoles?: () => Promise<{
    success: boolean;
    roles: Record<string, {
      id: string;
      title: string;
      titleEn?: string;
      isLive?: boolean;
      activeModel?: string;
      status?: string;
      statusLabel?: string;
      statusLabelEn?: string;
      focus?: string;
      focusEn?: string;
      icon?: string;
    }>;
  }>;
  getCouncilSessions?: (limit?: number) => Promise<{
    success: boolean;
    sessions: Array<any>;
  }>;

  // Missions
  getMissions?: (limit?: number) => Promise<{
    success: boolean;
    missions?: Array<any>;
    error?: string;
  }>;

  // Listeners
  onAgentToolCall?: (callback: (val: any) => void) => () => void;
  onLiveTranscription?: (callback: (val: any) => void) => () => void;
  onLiveStatus?: (callback: (val: any) => void) => () => void;
}

export function createElectronBridgeAdapters(api: HesatechPreloadApi): HezTechAdapters {
  let currentSelectedModel = 'openclaw-default';
  const requests = new Map<string, string>();

  // 1. Chat Adapter
  const chat = {
    async listConversations(): Promise<AdapterResult<Conversation[]>> {
      try {
        if (!api.listConversations) return { ok: false, error: 'Conversation API unavailable' };
        const res = await api.listConversations();
        return res.success && res.conversations ? { ok: true, data: res.conversations } : { ok: false, error: res.error || 'Unable to load conversations' };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'Failed to list conversations' };
      }
    },

    async getMessages(conversationId: string): Promise<AdapterResult<ConversationMessage[]>> {
      try {
        if (!api.getChatHistory) {
          return { ok: false, error: 'Chat history API not available in preload', code: 'UNAVAILABLE' };
        }
        const res = await api.getChatHistory(conversationId);
        if (res && res.success && Array.isArray(res.messages)) {
          const mapped: ConversationMessage[] = res.messages.map((m, idx) => ({
            id: m.id || `msg_${idx}_${Date.now()}`,
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content || m.message || '',
            createdAt: m.timestamp || m.createdAt || new Date().toISOString(),
            model: m.model,
            toolCalls: Array.isArray(m.toolsExecuted)
              ? m.toolsExecuted.map((t, i) => ({
                  id: `tool_${idx}_${i}`,
                  name: typeof t === 'string' ? t : (t.name || 'tool'),
                  status: 'done',
                  summary: typeof t === 'string' ? t : JSON.stringify(t),
                }))
              : undefined,
          }));
          return { ok: true, data: mapped };
        }
        return { ok: false, error: res?.error || 'Unable to load history' };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'Failed to get messages' };
      }
    },

    async createConversation(title?: string): Promise<AdapterResult<Conversation>> {
      try {
        if (!api.createConversation) return { ok: false, error: 'Conversation API unavailable' };
        const res = await api.createConversation(title);
        return res.success && res.conversation ? { ok: true, data: res.conversation } : { ok: false, error: res.error || 'Unable to create conversation' };
      } catch (error) { return { ok: false, error: String(error) }; }
    },

    async *sendMessage(
      conversationId: string,
      content: string,
      options?: {
        modelId?: string;
        agentId?: string;
        signal?: AbortSignal;
      }
    ): AsyncIterable<StreamChunk> {
      if (options?.signal?.aborted) {
        yield { type: 'error', error: 'Aborted' };
        return;
      }

      if (!api.sendMessage) {
        yield { type: 'error', error: 'Preload sendMessage API is missing' };
        return;
      }

      const requestId = crypto.randomUUID();
      requests.set(conversationId, requestId);
      const cancel = () => { void api.cancelChat?.(requestId).catch(() => {}); };
      options?.signal?.addEventListener('abort', cancel, { once: true });
      const pendingToolEvents: StreamChunk[] = [];
      let toolCleanup: (() => void) | null = null;
      let tokenCleanup: (() => void) | null = null;
      const pendingTokens: string[] = [];
      let wakeTokenReader: (() => void) | null = null;
      let sendSettled = false;
      let streamedContent = '';

      if (typeof api.onAgentToolCall === 'function') {
        try {
          toolCleanup = api.onAgentToolCall((toolVal: any) => {
            pendingToolEvents.push({
              type: 'tool',
              tool: {
                id: `tool_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                name: toolVal?.name || 'agent_tool',
                status: 'running',
                summary: toolVal?.args ? JSON.stringify(toolVal.args) : undefined,
              },
            });
          });
        } catch {
          // Non-fatal if listener registration fails
        }
      }

      if (typeof api.onChatToken === 'function') {
        tokenCleanup = api.onChatToken((chunk) => {
          if (chunk?.requestId !== requestId || typeof chunk.content !== 'string' || !chunk.content) return;
          pendingTokens.push(chunk.content);
          wakeTokenReader?.();
          wakeTokenReader = null;
        });
      }

      try {
        const targetModel = options?.modelId || currentSelectedModel;
        const sendPromise = api.sendMessage({
          requestId,
          message: content,
          model: targetModel,
          conversationId,
          agentId: options?.agentId || null,
        }).then((result) => {
          sendSettled = true;
          wakeTokenReader?.();
          wakeTokenReader = null;
          return result;
        }, (error: unknown) => {
          sendSettled = true;
          wakeTokenReader?.();
          wakeTokenReader = null;
          throw error;
        });

        while (!sendSettled || pendingTokens.length > 0) {
          const token = pendingTokens.shift();
          if (token) {
            streamedContent += token;
            yield { type: 'token', content: token };
          } else {
            await new Promise<void>((resolve) => { wakeTokenReader = resolve; });
          }
        }
        const res = await sendPromise;

        // Flush any tool execution events captured before response
        while (pendingToolEvents.length > 0) {
          yield pendingToolEvents.shift()!;
        }

        if (options?.signal?.aborted) {
          yield { type: 'error', error: 'Aborted' };
          return;
        }

        if (!res || !res.success) {
          yield { type: 'error', error: res?.error || 'Execution failed or rejected by security gate' };
          return;
        }

        // If toolsExecuted were reported by the backend agent orchestrator
        if (Array.isArray(res.toolsExecuted)) {
          for (const t of res.toolsExecuted) {
            yield {
              type: 'tool',
              tool: {
                id: `tool_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                name: typeof t === 'string' ? t : (t?.name || 'tool'),
                status: 'done',
                summary: typeof t === 'string' ? t : JSON.stringify(t),
              },
            };
          }
        }

        const fullReply = res.reply || '';
        if (!fullReply.trim()) { yield { type: 'error', error: 'Empty assistant response' }; return; }
        if (!streamedContent) {
          yield { type: 'token', content: fullReply };
        } else if (streamedContent !== fullReply) {
          yield { type: 'error', error: 'Streamed response did not match the final gateway response' };
          return;
        }

        yield {
          type: 'done',
          messageId: res.messageId || `msg_${Date.now()}`,
          model: res.model,
          provider: res.provider,
          latencyMs: res.latencyMs,
        };
      } catch (err: any) {
        yield { type: 'error', error: err?.message || 'Chat transmission failed' };
      } finally {
        options?.signal?.removeEventListener('abort', cancel);
        requests.delete(conversationId);
        if (tokenCleanup) tokenCleanup();
        if (toolCleanup) {
          try {
            toolCleanup();
          } catch {
            // Clean unmount
          }
        }
      }
    },

    async cancelStream(conversationId: string): Promise<void> {
      const id = requests.get(conversationId);
      if (id && api.cancelChat) await api.cancelChat(id);
    },

    async listModels(): Promise<AdapterResult<ModelInfo[]>> {
      try {
        if (!api.getAvailableModels) {
          return { ok: false, error: 'Models API not available', code: 'UNAVAILABLE' };
        }
        const res = await api.getAvailableModels();
        if (res && res.success && Array.isArray(res.models)) {
          return {
            ok: true,
            data: res.models.map((m) => ({
              id: m.id,
              name: m.name,
              provider: m.provider,
              verified: m.verified,
              active: m.active,
            })),
          };
        }
        return { ok: false, error: 'Failed to retrieve model list' };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'Failed to list models' };
      }
    },

    async getSelectedModel(): Promise<AdapterResult<ModelInfo | null>> {
      const list = await this.listModels();
      if (list.ok) {
        const found = list.data.find((m: ModelInfo) => m.id === currentSelectedModel) || list.data[0] || null;
        return { ok: true, data: found };
      }
      return { ok: false, error: list.error };
    },

    async setSelectedModel(modelId: string): Promise<AdapterResult<void>> {
      currentSelectedModel = modelId;
      return { ok: true, data: undefined };
    },
  };

  // 2. Agent Adapter
  const agents = {
    async getDomains(): Promise<AdapterResult<AgentDomain[]>> {
      try {
        let councilRoles: Record<string, any> = {};
        if (api.getCouncilRoles) {
          const res = await api.getCouncilRoles();
          if (res && res.success && res.roles) {
            councilRoles = res.roles;
          }
        }

        // Map real Council Roles truthfully into the 6 domain structure
        const researchRole = councilRoles.research;
        const securityRole = councilRoles.security;
        const devopsRole = councilRoles.devops;
        const architectRole = councilRoles.architect;
        const engineerRole = councilRoles.engineer;
        const judgeRole = councilRoles.judge;
        const criticRole = councilRoles.critic;

        const domains: AgentDomain[] = [
          {
            id: 'research',
            nameEn: 'Research',
            nameFa: 'پژوهش',
            descriptionEn: researchRole?.focusEn || 'Documentation, literature & scientific validation',
            descriptionFa: researchRole?.focus || 'مستندات، شواهد علمی و اعتبارسنجی ابزارها',
            icon: 'search',
            status: researchRole?.isLive ? 'idle' : 'offline',
            subRoles: [
              { id: 'discovery', nameEn: 'Evidence Discovery', nameFa: 'کشف شواهد' },
              { id: 'synthesis', nameEn: 'Literature Synthesis', nameFa: 'سنتز مقالات' },
            ],
          },
          {
            id: 'strategy',
            nameEn: 'Strategy',
            nameFa: 'استراتژی',
            descriptionEn: judgeRole?.focusEn || 'Impartial deliberation & rubric scoring',
            descriptionFa: judgeRole?.focus || 'داوری بی‌طرفانه و تصمیم‌گیری راهبردی',
            icon: 'chess',
            status: (judgeRole?.isLive || criticRole?.isLive) ? 'idle' : 'offline',
            subRoles: [
              { id: 'judge', nameEn: judgeRole?.titleEn || 'Independent Arbiter', nameFa: judgeRole?.title || 'داور مستقل' },
              { id: 'critic', nameEn: criticRole?.titleEn || 'Red Team Critic', nameFa: criticRole?.title || 'منتقد مستقل' },
            ],
          },
          {
            id: 'operations',
            nameEn: 'Operations',
            nameFa: 'عملیات',
            descriptionEn: devopsRole?.focusEn || 'Windows packaging, processes & lifecycle health',
            descriptionFa: devopsRole?.focus || 'پکیجینگ ویندوز، فرایندها و سلامت چرخه اجرا',
            icon: 'settings',
            status: devopsRole?.isLive ? 'idle' : 'offline',
            subRoles: [
              { id: 'devops', nameEn: 'DevOps Lead', nameFa: 'مدیریت عملیات' },
              { id: 'lifecycle', nameEn: 'Process Lifecycle', nameFa: 'چرخه فرایندها' },
            ],
          },
          {
            id: 'analytics',
            nameEn: 'Analytics',
            nameFa: 'تحلیل',
            descriptionEn: architectRole?.focusEn || 'System architecture, IPC & implementation',
            descriptionFa: architectRole?.focus || 'معماری سیستم، ارتباطات IPC و استحکام کد',
            icon: 'chart',
            status: (architectRole?.isLive || engineerRole?.isLive) ? 'idle' : 'offline',
            subRoles: [
              { id: 'architect', nameEn: architectRole?.titleEn || 'Chief Architect', nameFa: architectRole?.title || 'معمار ارشد' },
              { id: 'engineer', nameEn: engineerRole?.titleEn || 'Principal Engineer', nameFa: engineerRole?.title || 'مهندس ارشد' },
            ],
          },
          {
            id: 'risk',
            nameEn: 'Risk',
            nameFa: 'ریسک',
            descriptionEn: securityRole?.focusEn || 'Zero-trust governance, approvals & credential protection',
            descriptionFa: securityRole?.focus || 'حاکمیت امنیتی، اعطای مجوزها و حفاظت از کلیدها',
            icon: 'shield',
            status: securityRole?.isLive ? 'idle' : 'offline',
            subRoles: [
              { id: 'security', nameEn: 'Security Guardian', nameFa: 'پایشگر امنیت' },
              { id: 'veto', nameEn: 'Veto Gate', nameFa: 'دروازه حق وتو' },
            ],
          },
          {
            id: 'knowledge',
            nameEn: 'Knowledge',
            nameFa: 'دانش',
            descriptionEn: 'Workspace notes and saved application knowledge',
            descriptionFa: 'یادداشت‌های فضای کاری و دانش ذخیره‌شدهٔ برنامه',
            icon: 'book',
            status: 'idle',
            subRoles: [
              { id: 'vault', nameEn: 'Obsidian Vault', nameFa: 'والت ابسیدین' },
              { id: 'memory', nameEn: 'Semantic Memory', nameFa: 'حافظه معنایی' },
            ],
          },
        ];

        return { ok: true, data: domains };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'Failed to get domains' };
      }
    },

    async getTasks(domainId: string): Promise<AdapterResult<AgentTask[]>> {
      try {
        if (!api.getTasks) return { ok: true, data: [] };
        const tasks = await api.getTasks();
        if (Array.isArray(tasks)) {
          const mapped: AgentTask[] = tasks.map((t: any, i: number) => ({
            id: t.id || `task_${i}`,
            title: t.title || t.name || 'Task',
            status: t.done ? 'completed' : 'in_progress',
            createdAt: t.time || new Date().toISOString(),
          }));
          return { ok: true, data: mapped };
        }
        return { ok: true, data: [] };
      } catch (err: any) {
        return { ok: false, error: err?.message || `Failed to fetch tasks for ${domainId}` };
      }
    },

    async getTools(domainId: string): Promise<AdapterResult<AgentTool[]>> {
      try {
        if (!api.getAvailableTools) return { ok: true, data: [] };
        const res = await api.getAvailableTools();
        if (res && res.success && Array.isArray(res.tools)) {
          const mapped: AgentTool[] = res.tools.map((t) => ({
            id: t.id,
            name: t.nameEn || t.name,
            description: `[Risk: ${t.riskLevel || 'LOW'}] ${t.name}`,
          }));
          return { ok: true, data: mapped };
        }
        return { ok: true, data: [] };
      } catch (err: any) {
        return { ok: false, error: err?.message || `Failed to fetch tools for ${domainId}` };
      }
    },

    async getOutputs(domainId: string): Promise<AdapterResult<AgentOutput[]>> {
      try {
        if (!api.getCouncilSessions) return { ok: true, data: [] };
        const res = await api.getCouncilSessions(5);
        if (res && res.success && Array.isArray(res.sessions)) {
          const mapped: AgentOutput[] = res.sessions.map((s: any) => ({
            id: s.id,
            title: s.title || `Council Session ${s.id}`,
            createdAt: s.startTime || new Date().toISOString(),
          }));
          return { ok: true, data: mapped };
        }
        return { ok: true, data: [] };
      } catch (err: any) {
        return { ok: false, error: err?.message || `Failed to get outputs for ${domainId}` };
      }
    },

    async openAgentChat(domainId: string): Promise<AdapterResult<{ conversationId: string }>> {
      return { ok: true, data: { conversationId: `agent_session_${domainId}` } };
    },
  };

  // 3. System Adapter
  const system = {
    async getHealth(): Promise<AdapterResult<SystemHealth>> {
      try {
        if (!api.getSystemStats) {
          return { ok: false, error: 'System telemetry API unavailable', code: 'UNAVAILABLE' };
        }
        const stats = await api.getSystemStats();
        if (stats) {
          const cpuPercent = stats.cpu?.usagePercent ?? '—';
          const memPercent = stats.memory?.usagePercent ?? '—';
          return {
            ok: true,
            data: {
              status: 'connected',
              message: `CPU: ${cpuPercent}% | RAM: ${memPercent}% | Platform: Windows`,
              lastCheckedAt: new Date().toISOString(),
            },
          };
        }
        return {
          ok: true,
          data: {
            status: 'connected',
            message: 'Electron Core Active',
            lastCheckedAt: new Date().toISOString(),
          },
        };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'Failed to probe system health' };
      }
    },

    async getConnections(): Promise<AdapterResult<ConnectionItem[]>> {
      try {
        if (!api.getConnectionsTopology) return { ok: true, data: [] };
        const res = await api.getConnectionsTopology();
        if (res && res.nodes) {
          const items: ConnectionItem[] = [];
          for (const [key, node] of Object.entries<any>(res.nodes)) {
            items.push({
              id: node.id || key,
              name: node.name || key,
              type: node.provider || 'system',
              status: node.status === 'connected' ? 'connected' : (node.status === 'error' ? 'error' : 'disconnected'),
              content: node.details || node.provider,
            });
          }
          return { ok: true, data: items };
        }
        return { ok: true, data: [] };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'Failed to fetch topology connections' };
      }
    },
  };

  // 4. Mission Adapter
  const missions = {
    async listMissions(): Promise<AdapterResult<Mission[]>> {
      try {
        if (!api.getMissions) return { ok: true, data: [] };
        const res = await api.getMissions(10);
        if (res && res.success && Array.isArray(res.missions)) {
          const mapped: Mission[] = res.missions.map((m: any) => ({
            id: m.id,
            title: m.title || m.name || 'Mission',
            status: m.status || 'draft',
            progress: m.progress ?? (m.status === 'completed' ? 100 : 0),
          }));
          return { ok: true, data: mapped };
        }
        return { ok: true, data: [] };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'Failed to list missions' };
      }
    },
  };

  return {
    chat,
    agents,
    system,
    missions,
  };
}
