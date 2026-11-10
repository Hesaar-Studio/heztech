import type {
  AdapterResult,
  AgentDomain,
  AgentOutput,
  AgentTask,
  AgentTool,
  Conversation,
  ConversationMessage,
  ModelInfo,
  StreamChunk,
  SystemHealth,
  ConnectionItem,
  Mission,
  AttachmentMeta,
} from '@/types';

/**
 * Thin backend adapter contract.
 * Antigravity / Electron preload must implement this and inject it via window or props.
 * When unavailable, UI shows Not Connected / Unavailable / Not Configured.
 */

export interface ChatAdapter {
  listConversations(): Promise<AdapterResult<Conversation[]>>;
  getMessages(conversationId: string): Promise<AdapterResult<ConversationMessage[]>>;
  createConversation(title?: string): Promise<AdapterResult<Conversation>>;
  /**
   * Stream a user message. Must NOT invent replies.
   * Caller cancels via AbortSignal.
   */
  sendMessage(
    conversationId: string,
    content: string,
    options?: {
      modelId?: string;
      agentId?: string;
      attachments?: AttachmentMeta[];
      signal?: AbortSignal;
    }
  ): AsyncIterable<StreamChunk>;
  cancelStream(conversationId: string): Promise<void>;
  listModels(): Promise<AdapterResult<ModelInfo[]>>;
  getSelectedModel(): Promise<AdapterResult<ModelInfo | null>>;
  setSelectedModel(modelId: string): Promise<AdapterResult<void>>;
}

export interface AgentAdapter {
  getDomains(): Promise<AdapterResult<AgentDomain[]>>;
  getTasks(domainId: string): Promise<AdapterResult<AgentTask[]>>;
  getTools(domainId: string): Promise<AdapterResult<AgentTool[]>>;
  getOutputs(domainId: string): Promise<AdapterResult<AgentOutput[]>>;
  /** Optional: open conversation scoped to agent */
  openAgentChat?(domainId: string): Promise<AdapterResult<{ conversationId: string }>>;
}

export interface SystemAdapter {
  getHealth(): Promise<AdapterResult<SystemHealth>>;
  getConnections(): Promise<AdapterResult<ConnectionItem[]>>;
}

export interface MissionAdapter {
  listMissions(): Promise<AdapterResult<Mission[]>>;
}

export interface HezTechAdapters {
  chat: ChatAdapter | null;
  agents: AgentAdapter | null;
  system: SystemAdapter | null;
  missions: MissionAdapter | null;
}

declare global {
  interface Window {
    /** Injected by Electron preload / Antigravity bridge */
    __HEZTECH_ADAPTERS__?: Partial<HezTechAdapters>;
    heztech?: any;
    hesatech?: any;
    electronAPI?: any;
    jarvis?: any;
  }
}
