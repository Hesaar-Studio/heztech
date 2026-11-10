import type { AgentDomain, AgentTask, AgentTool, AgentOutput, ArchitectureAgent } from '@/types';

/** Static domain definitions shared by Operations & Architecture views. */
export const DEFAULT_DOMAINS: AgentDomain[] = [
  {
    id: 'research',
    nameEn: 'Research',
    nameFa: 'پژوهش',
    descriptionEn: 'Discover & analyze',
    descriptionFa: 'کشف و تحلیل',
    icon: 'search',
    status: 'idle',
    subRoles: [
      { id: 'discovery', nameEn: 'Evidence Discovery', nameFa: 'کشف شواهد' },
      { id: 'synthesis', nameEn: 'Literature Synthesis', nameFa: 'ترکیب مقالات' },
    ],
  },
  {
    id: 'strategy',
    nameEn: 'Strategy',
    nameFa: 'استراتژی',
    descriptionEn: 'Plan & align',
    descriptionFa: 'برنامه‌ریزی و هم‌راستایی',
    icon: 'chess',
    status: 'idle',
    subRoles: [
      { id: 'planning', nameEn: 'Strategic Planning', nameFa: 'برنامه‌ریزی راهبردی' },
      { id: 'alignment', nameEn: 'Task Alignment', nameFa: 'هم‌راستایی وظایف' },
    ],
  },
  {
    id: 'operations',
    nameEn: 'Operations',
    nameFa: 'عملیات',
    descriptionEn: 'Execute & coordinate',
    descriptionFa: 'اجرا و هماهنگی',
    icon: 'settings',
    status: 'idle',
    subRoles: [
      { id: 'execution', nameEn: 'Action Execution', nameFa: 'اجرای اقدام' },
      { id: 'coordination', nameEn: 'Pipeline Coordination', nameFa: 'هماهنگی پایپ‌لاین' },
    ],
  },
  {
    id: 'analytics',
    nameEn: 'Analytics',
    nameFa: 'تحلیل',
    descriptionEn: 'Measure & infer',
    descriptionFa: 'اندازه‌گیری و استنتاج',
    icon: 'chart',
    status: 'idle',
    subRoles: [
      { id: 'metrics', nameEn: 'Performance Metrics', nameFa: 'متریک‌های عملکرد' },
      { id: 'inference', nameEn: 'Statistical Inference', nameFa: 'استنتاج آماری' },
    ],
  },
  {
    id: 'risk',
    nameEn: 'Risk',
    nameFa: 'ریسک',
    descriptionEn: 'Assess & mitigate',
    descriptionFa: 'ارزیابی و کاهش',
    icon: 'shield',
    status: 'idle',
    subRoles: [
      { id: 'assessment', nameEn: 'Risk Assessment', nameFa: 'ارزیابی ریسک' },
      { id: 'mitigation', nameEn: 'Safety Mitigation', nameFa: 'کاهش مخاطرات' },
    ],
  },
  {
    id: 'knowledge',
    nameEn: 'Knowledge',
    nameFa: 'دانش',
    descriptionEn: 'Store & retrieve',
    descriptionFa: 'ذخیره و بازیابی',
    icon: 'book',
    status: 'idle',
    subRoles: [
      { id: 'storage', nameEn: 'Vault Storage', nameFa: 'ذخیره‌سازی والت' },
      { id: 'retrieval', nameEn: 'Semantic Retrieval', nameFa: 'بازیابی معنایی' },
    ],
  },
];

/** Detailed default tasks, tools, and outputs per domain matching Grok references */
export const DOMAIN_DETAILS: Record<string, {
  tasks: AgentTask[];
  tools: AgentTool[];
  outputs: AgentOutput[];
}> = {
  analytics: {
    tasks: [
      { id: 'task-a1', title: 'Analyze campaign performance', status: 'In Progress', createdAt: '2026-10-21T01:00:00Z' },
      { id: 'task-a2', title: 'Identify growth opportunities', status: 'In Progress', createdAt: '2026-10-21T01:15:00Z' },
      { id: 'task-a3', title: 'Generate insights report', status: 'Queued', createdAt: '2026-10-21T01:30:00Z' },
    ],
    tools: [
      { id: 'tool-a1', name: 'Data Analyzer', description: 'Deep quantitative telemetry and KPI processing' },
      { id: 'tool-a2', name: 'SQL Query Runner', description: 'Direct analytical queries on structured data stores' },
      { id: 'tool-a3', name: 'Chart Generator', description: 'Automated visualization of trends and distributions' },
      { id: 'tool-a4', name: 'Statistical Toolkit', description: 'Hypothesis testing, variance and regression analysis' },
      { id: 'tool-a5', name: 'Trend Detector', description: 'Early signal detection and anomaly forecasting' },
    ],
    outputs: [
      { id: 'out-a1', title: 'Performance Insights Report', timeAgo: 'Generated just now', createdAt: '2026-10-21T01:45:00Z' },
      { id: 'out-a2', title: 'Audience Behavior Analysis', timeAgo: 'Generated 2h ago', createdAt: '2026-10-21T00:00:00Z' },
      { id: 'out-a3', title: 'Channel Effectiveness Summary', timeAgo: 'Generated 5h ago', createdAt: '2026-10-20T21:00:00Z' },
    ],
  },
  research: {
    tasks: [
      { id: 'task-r1', title: 'Synthesize frontier AI benchmark papers', status: 'In Progress', createdAt: '2026-10-21T01:00:00Z' },
      { id: 'task-r2', title: 'Extract multi-agent architectural paradigms', status: 'In Progress', createdAt: '2026-10-21T01:10:00Z' },
      { id: 'task-r3', title: 'Verify factual claims against ArXiv', status: 'Queued', createdAt: '2026-10-21T01:25:00Z' },
    ],
    tools: [
      { id: 'tool-r1', name: 'Scientific Paper Fetcher', description: 'ArXiv, PubMed and OpenAlex citation retriever' },
      { id: 'tool-r2', name: 'Web Synthesis Engine', description: 'Broad web crawling and content distillation' },
      { id: 'tool-r3', name: 'Evidence Cross-Referencer', description: 'Checks consensus across independent sources' },
      { id: 'tool-r4', name: 'Claim Verification Gate', description: 'Detects hallucinations and unsupported claims' },
    ],
    outputs: [
      { id: 'out-r1', title: 'Frontier Agent Systems Literature Review', timeAgo: 'Generated 1h ago', createdAt: '2026-10-21T00:30:00Z' },
      { id: 'out-r2', title: 'Empirical Accuracy Evaluation', timeAgo: 'Generated 3h ago', createdAt: '2026-10-20T22:30:00Z' },
    ],
  },
  strategy: {
    tasks: [
      { id: 'task-s1', title: 'Align autonomous mission goals with user intent', status: 'In Progress', createdAt: '2026-10-21T01:00:00Z' },
      { id: 'task-s2', title: 'Deliberate architectural choices in Council', status: 'In Progress', createdAt: '2026-10-21T01:20:00Z' },
      { id: 'task-s3', title: 'Evaluate priority queue tradeoff matrix', status: 'Queued', createdAt: '2026-10-21T01:40:00Z' },
    ],
    tools: [
      { id: 'tool-s1', name: 'Council Arbiter', description: 'Multi-persona debate coordinator and consensus voter' },
      { id: 'tool-s2', name: 'Objective Prioritizer', description: 'Weighted scoring of competing deliverables' },
      { id: 'tool-s3', name: 'Rubric Evaluation Suite', description: 'Formal rubric assessment for agent decisions' },
    ],
    outputs: [
      { id: 'out-s1', title: 'Council Consensus Decision #42', timeAgo: 'Generated 40m ago', createdAt: '2026-10-21T01:10:00Z' },
      { id: 'out-s2', title: 'Q4 High-Level Strategic Roadmap', timeAgo: 'Generated 4h ago', createdAt: '2026-10-20T21:40:00Z' },
    ],
  },
  operations: {
    tasks: [
      { id: 'task-o1', title: 'Manage active Windows subprocesses', status: 'In Progress', createdAt: '2026-10-21T01:00:00Z' },
      { id: 'task-o2', title: 'Audit Electron IPC heartbeat health', status: 'In Progress', createdAt: '2026-10-21T01:15:00Z' },
      { id: 'task-o3', title: 'Coordinate build pack & asset distribution', status: 'Queued', createdAt: '2026-10-21T01:35:00Z' },
    ],
    tools: [
      { id: 'tool-o1', name: 'Process Manager', description: 'Inspects and controls background OS workers' },
      { id: 'tool-o2', name: 'Electron IPC Monitor', description: 'Real-time telemetry on main-renderer bridge' },
      { id: 'tool-o3', name: 'Task Queue Scheduler', description: 'Handles async task dispatch and backpressure' },
      { id: 'tool-o4', name: 'Build & Release Pipeline', description: 'Packages unpacked application artifacts' },
    ],
    outputs: [
      { id: 'out-o1', title: 'System Operations & IPC Health Log', timeAgo: 'Generated 5m ago', createdAt: '2026-10-21T01:45:00Z' },
      { id: 'out-o2', title: 'Packaging Diagnostics Manifest', timeAgo: 'Generated 1h ago', createdAt: '2026-10-21T00:45:00Z' },
    ],
  },
  risk: {
    tasks: [
      { id: 'task-k1', title: 'Zero-trust credential leak scan', status: 'In Progress', createdAt: '2026-10-21T01:00:00Z' },
      { id: 'task-k2', title: 'Enforce user approval on file writes', status: 'In Progress', createdAt: '2026-10-21T01:20:00Z' },
      { id: 'task-k3', title: 'Audit model hallucination rate', status: 'Queued', createdAt: '2026-10-21T01:30:00Z' },
    ],
    tools: [
      { id: 'tool-k1', name: 'Zero-Trust Gatekeeper', description: 'Blocks unauthorized disk or network operations' },
      { id: 'tool-k2', name: 'Credential Sanitizer', description: 'Prevents token or API key exposure in logs' },
      { id: 'tool-k3', name: 'Audit Trail Verifier', description: 'Cryptographic log verification and anomaly detection' },
    ],
    outputs: [
      { id: 'out-k1', title: 'Security & Integrity Audit Log', timeAgo: 'Generated 15m ago', createdAt: '2026-10-21T01:35:00Z' },
      { id: 'out-k2', title: 'Vulnerability Pre-Flight Report', timeAgo: 'Generated 3h ago', createdAt: '2026-10-20T22:35:00Z' },
    ],
  },
  knowledge: {
    tasks: [
      { id: 'task-kn1', title: 'Index Obsidian Vault Markdown notes', status: 'In Progress', createdAt: '2026-10-21T01:00:00Z' },
      { id: 'task-kn2', title: 'Build semantic embeddings for quick recall', status: 'In Progress', createdAt: '2026-10-21T01:10:00Z' },
      { id: 'task-kn3', title: 'Sync conversational memory graph', status: 'Queued', createdAt: '2026-10-21T01:25:00Z' },
    ],
    tools: [
      { id: 'tool-kn1', name: 'Obsidian Vault Connector', description: 'Reads and manages markdown knowledge notes' },
      { id: 'tool-kn2', name: 'Semantic Vector Store', description: 'Calculates high-dimensional vector embeddings' },
      { id: 'tool-kn3', name: 'Graph Memory Retriever', description: 'Traverses relational entity links in long-term memory' },
    ],
    outputs: [
      { id: 'out-kn1', title: 'Vault Entity Knowledge Graph', timeAgo: 'Generated 20m ago', createdAt: '2026-10-21T01:30:00Z' },
      { id: 'out-kn2', title: 'Long-Term Memory Snapshot', timeAgo: 'Generated 2h ago', createdAt: '2026-10-20T23:30:00Z' },
    ],
  },
};

/**
 * 6 Primary Architecture Agents + 12 Sub-Agents matching Grok Reference Image 1
 * (media_1792568910810_21933a99.jpg)
 */
export const ARCHITECTURE_AGENTS: ArchitectureAgent[] = [
  {
    id: 'reasoning',
    name: 'Reasoning Agent',
    role: 'Strategic thinking & planning',
    icon: 'brain',
    subAgents: [
      { id: 'logic-sub', name: 'Logic Sub-Agent', role: 'Deductive reasoning & inference' },
      { id: 'planning-sub', name: 'Planning Sub-Agent', role: 'Multi-step goal decomposition' },
    ],
  },
  {
    id: 'knowledge',
    name: 'Knowledge Agent',
    role: 'Information management',
    icon: 'book',
    subAgents: [
      { id: 'retrieval-sub', name: 'Retrieval Sub-Agent', role: 'Hybrid vector & keyword search' },
      { id: 'memory-sub', name: 'Memory Sub-Agent', role: 'Contextual memory retention' },
    ],
  },
  {
    id: 'execution',
    name: 'Execution Agent',
    role: 'Action & workflow',
    icon: 'settings',
    subAgents: [
      { id: 'task-sub', name: 'Task Sub-Agent', role: 'Atomic action execution' },
      { id: 'automation-sub', name: 'Automation Sub-Agent', role: 'Workflow orchestration loops' },
    ],
  },
  {
    id: 'communication',
    name: 'Communication Agent',
    role: 'Interaction & delivery',
    icon: 'assistant',
    subAgents: [
      { id: 'dialogue-sub', name: 'Dialogue Sub-Agent', role: 'Natural language synthesis' },
      { id: 'channel-sub', name: 'Channel Sub-Agent', role: 'Cross-platform protocol dispatch' },
    ],
  },
  {
    id: 'analysis',
    name: 'Analysis Agent',
    role: 'Data & evaluation',
    icon: 'chart',
    subAgents: [
      { id: 'analytics-sub', name: 'Analytics Sub-Agent', role: 'Statistical metrics & computation' },
      { id: 'evaluation-sub', name: 'Evaluation Sub-Agent', role: 'Quality & benchmark scoring' },
    ],
  },
  {
    id: 'security',
    name: 'Security Agent',
    role: 'Protection & compliance',
    icon: 'shieldCheck',
    subAgents: [
      { id: 'guardrail-sub', name: 'Guardrail Sub-Agent', role: 'Safety filters & alignment' },
      { id: 'compliance-sub', name: 'Compliance Sub-Agent', role: 'Regulatory & audit policy' },
    ],
  },
];
