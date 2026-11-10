import { describe, it, expect, vi } from 'vitest';
import { createElectronBridgeAdapters, type HesatechPreloadApi } from '../src/adapters/electron-bridge';

describe('Electron Bridge Adapter Suite', () => {
  const createMockApi = (overrides: Partial<HesatechPreloadApi> = {}): HesatechPreloadApi => ({
    getSystemStats: vi.fn().mockResolvedValue({
      cpu: { usagePercent: 14 },
      memory: { usagePercent: 42 },
      os: { platform: 'win32' },
    }),
    getConnectionsTopology: vi.fn().mockResolvedValue({
      nodes: {
        ai_models: { id: 'ai_models', name: 'Gemini 3.8 Flash', status: 'connected', provider: 'Google Cloud' },
        windows_os: { id: 'windows_os', name: 'Windows Subsystem', status: 'connected', provider: 'win32' },
      },
    }),
    getAvailableModels: vi.fn().mockResolvedValue({
      success: true,
      models: [
        { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', provider: 'Google GenAI' },
        { id: 'local-offline-brain', name: 'Local Brain', provider: 'Offline' },
      ],
    }),
    listConversations: vi.fn().mockResolvedValue({ success: true, conversations: [{ id: 'conv_default', title: 'Session', updatedAt: '2026-01-01', messageCount: 2 }] }),
    createConversation: vi.fn().mockResolvedValue({ success: true, conversation: { id: 'new', title: 'New', updatedAt: '2026-01-01', messageCount: 0 } }),
    getChatHistory: vi.fn().mockResolvedValue({
      success: true,
      messages: [
        { id: 'm1', role: 'user', content: 'سلام' },
        { id: 'm2', role: 'assistant', content: 'درود! در خدمتم.' },
      ],
    }),
    sendMessage: vi.fn().mockResolvedValue({
      success: true,
      reply: 'من هسته پردازشی HesaTech هستم.',
      messageId: 'msg_test_123',
      provider: 'gemini-agent',
      toolsExecuted: ['system_telemetry'],
    }),
    cancelTask: vi.fn().mockResolvedValue({ success: true }),
    getCouncilRoles: vi.fn().mockResolvedValue({
      success: true,
      roles: {
        research: { title: 'سرپرست پژوهش', titleEn: 'Research Lead', isLive: true, focus: 'شواهد و مقالات' },
        security: { title: 'افسر امنیت', titleEn: 'Security Officer', isLive: true, focus: 'حفاظت امنیتی' },
        devops: { title: 'عملیات', titleEn: 'DevOps Lead', isLive: false, focus: 'پکیجینگ' },
        architect: { title: 'معمار', titleEn: 'Chief Architect', isLive: true, focus: 'ساختار سیستم' },
        engineer: { title: 'مهندس', titleEn: 'Principal Engineer', isLive: true, focus: 'کد و IPC' },
        judge: { title: 'داور', titleEn: 'Arbiter', isLive: true, focus: 'داوری' },
        critic: { title: 'منتقد', titleEn: 'Critic', isLive: true, focus: 'تیم قرمز' },
      },
    }),
    getTasks: vi.fn().mockResolvedValue([
      { id: 't1', title: 'بررسی پایداری سیستم', done: true, time: 'Today' },
    ]),
    getAvailableTools: vi.fn().mockResolvedValue({
      success: true,
      tools: [
        { id: 'search_web', name: 'جستجوی وب', nameEn: 'Web Search', riskLevel: 'LOW' },
      ],
    }),
    getCouncilSessions: vi.fn().mockResolvedValue({
      success: true,
      sessions: [
        { id: 'cs_1', title: 'جلسه ارزیابی ریسک', startTime: new Date().toISOString() },
      ],
    }),
    getMissions: vi.fn().mockResolvedValue({
      success: true,
      missions: [
        { id: 'm_1', title: 'پایش سلامت زیرساخت', status: 'completed', progress: 100 },
      ],
    }),
    onAgentToolCall: vi.fn((_cb) => {
      // Simulate immediate or no tool call
      return () => {};
    }),
    ...overrides,
  });

  it('initializes all 4 adapters properly', () => {
    const api = createMockApi();
    const adapters = createElectronBridgeAdapters(api);
    expect(adapters.chat).not.toBeNull();
    expect(adapters.agents).not.toBeNull();
    expect(adapters.system).not.toBeNull();
    expect(adapters.missions).not.toBeNull();
  });

  it('chat adapter lists models and handles selection', async () => {
    const api = createMockApi();
    const adapters = createElectronBridgeAdapters(api);
    const models = await adapters.chat!.listModels();
    expect(models.ok).toBe(true);
    if (models.ok) {
      expect(models.data.length).toBe(2);
      expect(models.data[0].id).toBe('gemini-3.8-flash');
    }

    const sel = await adapters.chat!.getSelectedModel();
    expect(sel.ok).toBe(true);

    const setRes = await adapters.chat!.setSelectedModel('local-offline-brain');
    expect(setRes.ok).toBe(true);
  });

  it('chat adapter lists conversations and loads history', async () => {
    const api = createMockApi();
    const adapters = createElectronBridgeAdapters(api);
    const convs = await adapters.chat!.listConversations();
    expect(convs.ok).toBe(true);
    if (convs.ok) {
      expect(convs.data[0].messageCount).toBe(2);
    }

    const msgs = await adapters.chat!.getMessages('conv_default');
    expect(msgs.ok).toBe(true);
    if (msgs.ok) {
      expect(msgs.data.length).toBe(2);
      expect(msgs.data[0].content).toBe('سلام');
      expect(msgs.data[1].role).toBe('assistant');
    }
  });

  it('chat adapter sends message and streams chunks with tool events', async () => {
    const api = createMockApi();
    const adapters = createElectronBridgeAdapters(api);

    const chunks = [];
    for await (const chunk of adapters.chat!.sendMessage('conv_default', 'اسمت چیه؟')) {
      chunks.push(chunk);
    }

    expect(api.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      requestId: expect.any(String),
      conversationId: 'conv_default',
    }));

    // Verify token streaming and done completion
    const tokenChunks = chunks.filter((c) => c.type === 'token');
    const doneChunk = chunks.find((c) => c.type === 'done');
    const toolChunks = chunks.filter((c) => c.type === 'tool');

    expect(tokenChunks.length).toBeGreaterThan(0);
    expect(doneChunk).toBeDefined();
    expect(toolChunks.length).toBeGreaterThanOrEqual(1);
    expect(toolChunks[0].type).toBe('tool');
  });

  it('agent adapter maps Council roles into 6 domains truthfully', async () => {
    const api = createMockApi();
    const adapters = createElectronBridgeAdapters(api);

    const domains = await adapters.agents!.getDomains();
    expect(domains.ok).toBe(true);
    if (domains.ok) {
      expect(domains.data.length).toBe(6);
      const research = domains.data.find((d) => d.id === 'research');
      const operations = domains.data.find((d) => d.id === 'operations');
      expect(research?.status).toBe('idle'); // isLive was true
      expect(operations?.status).toBe('offline'); // isLive was false
    }

    const tasks = await adapters.agents!.getTasks('research');
    expect(tasks.ok).toBe(true);

    const tools = await adapters.agents!.getTools('research');
    expect(tools.ok).toBe(true);
    if (tools.ok) {
      expect(tools.data[0].id).toBe('search_web');
    }
  });

  it('system and missions adapters return healthy telemetry and missions', async () => {
    const api = createMockApi();
    const adapters = createElectronBridgeAdapters(api);

    const health = await adapters.system!.getHealth();
    expect(health.ok).toBe(true);
    if (health.ok) {
      expect(health.data.status).toBe('connected');
      expect(health.data.message).toContain('CPU: 14%');
    }

    const conns = await adapters.system!.getConnections();
    expect(conns.ok).toBe(true);
    if (conns.ok) {
      expect(conns.data.length).toBe(2);
      expect(conns.data[0].id).toBe('ai_models');
    }

    const missions = await adapters.missions!.listMissions();
    expect(missions.ok).toBe(true);
    if (missions.ok) {
      expect(missions.data[0].title).toBe('پایش سلامت زیرساخت');
      expect(missions.data[0].progress).toBe(100);
    }
  });
});
