/** Core domain types for HezTech frontend */

export type Locale = 'en' | 'fa';
export type Direction = 'ltr' | 'rtl';

export type AgentDomainId =
  | 'research'
  | 'strategy'
  | 'operations'
  | 'analytics'
  | 'risk'
  | 'knowledge';

export type AgentStatus = 'idle' | 'busy' | 'offline' | 'unknown' | 'not_configured';

export interface AgentDomain {
  id: AgentDomainId;
  nameEn: string;
  nameFa: string;
  descriptionEn: string;
  descriptionFa: string;
  icon: string;
  status: AgentStatus;
  /** Sub-roles (architecture view only; conceptual) */
  subRoles?: { id: string; nameEn: string; nameFa: string }[];
}

export interface AgentTask {
  id: string;
  title: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | string;
  createdAt: string;
  icon?: string;
}

export interface AgentTool {
  id: string;
  name: string;
  description?: string;
  icon?: string;
}

export interface AgentOutput {
  id: string;
  title: string;
  createdAt: string;
  timeAgo?: string;
  icon?: string;
}

export interface ArchitectureSubAgent {
  id: string;
  name: string;
  role: string;
  icon?: string;
}

export interface ArchitectureAgent {
  id: string;
  name: string;
  role: string;
  icon: string;
  subAgents: ArchitectureSubAgent[];
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: string;
  model?: string;
  attachments?: AttachmentMeta[];
  toolCalls?: ToolCallMeta[];
  isStreaming?: boolean;
  error?: string;
}

export interface AttachmentMeta {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
}

export interface ToolCallMeta {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'done' | 'error';
  summary?: string;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  model?: string;
}

export interface ModelInfo {
  verified?: boolean;
  active?: boolean;
  id: string;
  name: string;
  provider?: string;
}

export interface SystemHealth {
  status: 'connected' | 'degraded' | 'disconnected' | 'unknown';
  message?: string;
  lastCheckedAt?: string;
}

export interface ConnectionItem {
  id: string;
  name: string;
  type: string;
  status: 'connected' | 'disconnected' | 'error' | 'not_configured';
  content?: string;
  snippet?: string;
}

export interface Mission {
  id: string;
  title: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'failed';
  progress?: number;
}

/** Adapter result envelope — never fabricate success data */
export type AdapterResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: 'NOT_CONNECTED' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'CANCELLED' | 'UNKNOWN' };

export type StreamChunk =
  | { type: 'token'; content: string }
  | { type: 'tool'; tool: ToolCallMeta }
  | { type: 'done'; messageId: string; model?: string; provider?: string; latencyMs?: number }
  | { type: 'error'; error: string };
