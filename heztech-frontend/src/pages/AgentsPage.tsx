import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OperationsView } from '@/components/agents/OperationsView';
import { ArchitectureView } from '@/components/agents/ArchitectureView';
import { AgentInspector } from '@/components/agents/AgentInspector';
import { CouncilDeliberationModal } from '@/components/council/CouncilDeliberationModal';
import { Icon } from '@/components/ui/Icon';
import { useLocale } from '@/hooks/useLocale';
import { useAdapters } from '@/hooks/useAdapters';
import { DEFAULT_DOMAINS } from '@/data/agents';
import type { AgentDomain, AgentDomainId, AgentOutput, AgentTask, AgentTool } from '@/types';
import './AgentsPage.css';

type ViewMode = 'operations' | 'architecture';

/**
 * AgentsPage replicates the Grok Command Center header and controls:
 * - Header: Agent Command Center | ● Monitor, orchestrate, and govern your AI agent ecosystem
 * - Segmented Switcher: [ Operations | Architecture ]
 * - Header Actions: Moon (theme), Bell (notifications), User (profile)
 * - Canvas: OperationsView or ArchitectureView
 * - Right Inspector: AgentInspector (open by default, inspecting Analytics)
 * - 'Ask this agent' routing to /assistant with full real context
 */
export function AgentsPage() {
  const { labels, locale } = useLocale();
  const navigate = useNavigate();
  const { agents } = useAdapters();
  const [view, setView] = useState<ViewMode>('operations');
  const [domains, setDomains] = useState<AgentDomain[]>(DEFAULT_DOMAINS);
  // Default selected agent is 'analytics' matching reference Image 2
  const [selectedId, setSelectedId] = useState<AgentDomainId | null>('analytics');
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [councilOpen, setCouncilOpen] = useState(false);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [outputs, setOutputs] = useState<AgentOutput[]>([]);
  const connected = !!agents;
  const [panel, setPanel] = useState<{title:string;text:string} | null>(null);
  async function showNotifications() {
    try {
      const api = window.heztech || window.hesatech;
      const res = await api.getApprovals();
      if (!res.success) throw new Error(res.error || 'Approvals unavailable');
      setPanel({title: labels.notifications, text: res.approvals?.length ? res.approvals.map((a:any) => a.type + ' — ' + (a.riskLevel || a.status || '')).join('\n') : locale === 'fa' ? 'درخواستی در انتظار تأیید نیست.' : 'No pending approval requests.'});
    } catch(e) { setPanel({title: labels.notifications, text: String(e)}); }
  }
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('heztech-theme', next);
  }

  // Load domain list from real bridge adapter if available
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!agents) {
        setDomains(DEFAULT_DOMAINS);
        return;
      }
      try {
        const res = await agents.getDomains();
        if (cancelled) return;
        if (res.ok && res.data && res.data.length > 0) {
          setDomains(res.data);
        } else {
          setDomains(DEFAULT_DOMAINS);
        }
      } catch {
        if (!cancelled) setDomains(DEFAULT_DOMAINS);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [agents]);

  // Load tasks, tools, outputs for selected domain
  useEffect(() => {
    if (!selectedId) {
      setTasks([]);
      setTools([]);
      setOutputs([]);
      return;
    }

    const fallback = { tasks: [], tools: [], outputs: [] };

    if (!agents) {
      setTasks(fallback.tasks);
      setTools(fallback.tools);
      setOutputs(fallback.outputs);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [t, to, o] = await Promise.all([
          agents.getTasks(selectedId),
          agents.getTools(selectedId),
          agents.getOutputs(selectedId),
        ]);
        if (cancelled) return;

        setTasks(t.ok && t.data && t.data.length > 0 ? t.data : fallback.tasks);
        setTools(to.ok && to.data && to.data.length > 0 ? to.data : fallback.tools);
        setOutputs(o.ok && o.data && o.data.length > 0 ? o.data : fallback.outputs);
      } catch {
        if (!cancelled) {
          setTasks(fallback.tasks);
          setTools(fallback.tools);
          setOutputs(fallback.outputs);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, agents]);

  function handleSelect(id: AgentDomainId) {
    setSelectedId(id);
    setInspectorOpen(true);
  }

  function handleAskAgent() {
    const activeDomain = domains.find((d) => d.id === selectedId) || domains[0];
    const agentName = locale === 'fa' ? activeDomain.nameFa : activeDomain.nameEn;
    const promptDraft =
      locale === 'fa'
        ? `سلام عامل ${agentName}، لطفاً آخرین داده‌ها و تحلیل‌های عملیاتی را بررسی و گزارش ارائه دهید.`
        : `Hello ${agentName} Agent, please analyze our latest operational telemetry and provide an executive summary.`;

    navigate('/assistant', {
      state: {
        agentId: activeDomain.id,
        agentName: `${activeDomain.nameEn} · OpenClaw main`,
        draft: promptDraft,
      },
    });
  }

  const selected = domains.find((d) => d.id === selectedId) || null;

  return (
    <div className="ht-agents-page">
      {/* Top Header matching Grok Image 2 */}
      <header className="ht-agents-header">
        <div className="ht-agents-header__title-box">
          <h1 className="ht-agents-header__title">
            {locale === 'fa' ? 'مرکز فرمان عامل‌ها' : 'Agent Command Center'}
          </h1>
          <p className="ht-agents-header__subtitle">
            <span className="ht-agents-header__dot">●</span>
            {locale === 'fa'
              ? 'پایش، هماهنگی و حاکمیت اکوسیستم هوش مصنوعی'
              : 'Monitor, orchestrate, and govern your AI agent ecosystem'}
          </p>
        </div>

        {/* View Switcher: [ Operations | Architecture ] */}
        <div className="ht-agents-switcher" role="tablist" aria-label="Agent View Switcher">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'operations'}
            className={`ht-agents-switcher__btn ${
              view === 'operations' ? 'ht-agents-switcher__btn--active' : ''
            }`}
            onClick={() => {
              setView('operations');
              setInspectorOpen(true);
            }}
          >
            {labels.agents.operations}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'architecture'}
            className={`ht-agents-switcher__btn ${
              view === 'architecture' ? 'ht-agents-switcher__btn--active' : ''
            }`}
            onClick={() => {
              setView('architecture');
              setInspectorOpen(false);
            }}
          >
            {labels.agents.architecture}
          </button>
        </div>

        {/* Header Right Icons matching Image 2 (Moon, Bell, User) */}
        <div className="ht-agents-header__actions">
          <button
            type="button"
            className="ht-agents-header__btn"
            style={{
              width: 'auto',
              padding: '0 0.85rem',
              display: 'flex',
              gap: '0.4rem',
              color: 'var(--ht-accent-bright)',
              borderColor: 'rgba(59, 130, 246, 0.4)',
              background: 'rgba(59, 130, 246, 0.1)',
              fontWeight: 600,
              fontSize: 'var(--ht-text-xs)'
            }}
            onClick={() => setCouncilOpen(true)}
            title={locale === 'fa' ? 'برگزاری جلسه شورای هفت‌نفره' : 'Convene 7-Agent Council'}
          >
            <Icon name="shield" size={15} />
            <span>{locale === 'fa' ? 'بررسی هفت‌دیدگاهی' : 'Seven perspectives'}</span>
          </button>

          <button
            type="button"
            className="ht-agents-header__btn"
            aria-label="Theme mode" onClick={toggleTheme}
            title={locale === 'fa' ? 'تغییر تم روشن/تیره' : 'Toggle light/dark theme'}
          >
            <Icon name="moon" size={17} />
          </button>
          <button
            type="button"
            className="ht-agents-header__btn"
            aria-label={labels.notifications} onClick={showNotifications}
            title={labels.notifications}
          >
            <Icon name="bell" size={17} />
            
          </button>
          <button
            type="button"
            className="ht-agents-header__user-avatar"
            aria-label="Executive Profile" onClick={() => navigate('/settings')}
            title="Executive User"
          >
            <Icon name="user" size={16} />
          </button>
        </div>
      </header>

      {panel && <section className="ht-workspace-panel" role="dialog" aria-label={panel.title}><h2>{panel.title}</h2><p style={{whiteSpace:'pre-wrap'}}>{panel.text}</p><button type="button" onClick={() => setPanel(null)}>{labels.common.close}</button></section>}
      {/* Main Body */}
      <div className="ht-agents-body">
        <div className="ht-agents-canvas-area">
          {view === 'operations' ? (
            <OperationsView
              labels={labels}
              domains={domains}
              selectedId={selectedId}
              onSelect={handleSelect}
              locale={locale}
            />
          ) : (
            <ArchitectureView
              labels={labels}
              selectedId={selectedId}
              onSelect={handleSelect}
              locale={locale}
            />
          )}
        </div>

        {/* Right Inspector Drawer */}
        {inspectorOpen && (
          <AgentInspector
            labels={labels}
            domain={selected}
            tasks={tasks}
            tools={tools}
            outputs={outputs}
            connected={connected}
            onClose={() => setInspectorOpen(false)}
            onAsk={handleAskAgent}
            onMore={() => setPanel({title: locale === 'fa' ? 'مشخصات نقش' : 'Role details', text: (locale === 'fa' ? selected?.descriptionFa : selected?.descriptionEn) + '\n' + (locale === 'fa' ? 'این دیدگاه تخصصی از طریق عامل اصلی اجرا می‌شود.' : 'This specialist perspective runs through the main agent.')})}
            onTool={(tool) => navigate('/assistant', {state:{agentId:selectedId,agentName:selected?.nameEn,draft: (locale === 'fa' ? 'برای استفاده از ابزار ' : 'Help me use the tool ') + tool.name + ': '}})}
            onViewOutputs={() => setPanel({title:labels.agents.recentOutputs,text: outputs.length ? outputs.map(o=>o.title+' — '+new Date(o.createdAt).toLocaleString()).join('\n') : labels.empty.noOutputs})}
            locale={locale}
          />
        )}
      </div>

      <CouncilDeliberationModal
        isOpen={councilOpen}
        onClose={() => setCouncilOpen(false)}
      />
    </div>
  );
}
