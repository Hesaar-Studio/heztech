import { Icon } from '@/components/ui/Icon';
import type { AgentDomain, AgentOutput, AgentTask, AgentTool } from '@/types';
import type { LabelKey } from '@/i18n/labels';
import './AgentInspector.css';

interface AgentInspectorProps {
  labels: LabelKey;
  domain: AgentDomain | null;
  tasks: AgentTask[];
  tools: AgentTool[];
  outputs: AgentOutput[];
  connected: boolean;
  onClose: () => void;
  onAsk?: () => void;
  onMore?: () => void;
  onTool?: (tool: AgentTool) => void;
  onViewOutputs?: () => void;
  locale: 'en' | 'fa';
}

/**
 * AgentInspector faithfully replicates the right-hand inspection drawer
 * from Grok Reference Image 2 (media_1792568910810_3cdc2ae4.jpg):
 * - Hexagon badge icon with online status & 'Selected' tag
 * - Current Tasks (3) with status pills
 * - Tools (5) with right chevrons
 * - Recent Outputs with 'View all' link & time-ago metadata
 * - Vibrant 'Ask this agent' full-width action button
 */
export function AgentInspector({
  labels,
  domain,
  tasks,
  tools,
  outputs,
  connected,
  onClose,
  onAsk,
  onMore, onTool, onViewOutputs,
  locale,
}: AgentInspectorProps) {
  if (!domain) {
    return (
      <aside className="ht-inspector" aria-label="Agent inspector">
        <div className="ht-inspector__header">
          <h2 className="ht-inspector__title">{labels.agents.selectNode}</h2>
          <button
            type="button"
            className="ht-inspector__icon-btn"
            onClick={onClose}
            aria-label={labels.common.close}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="ht-inspector__empty-state">
          <p>{labels.agents.selectNode}</p>
        </div>
      </aside>
    );
  }

  const name = locale === 'fa' ? domain.nameFa : domain.nameEn;
  const fullName = locale === 'fa' ? `عامل ${name}` : `${name} Agent`;
  const isOnline = connected && domain.status !== 'offline';

  return (
    <aside className="ht-inspector" aria-label={`Inspector: ${fullName}`}>
      {/* Top Header matching Reference Image 2 */}
      <div className="ht-inspector__header">
        <div className="ht-inspector__header-left">
          {/* Hexagon icon badge */}
          <div className="ht-inspector__hex-badge">
            <svg className="ht-inspector__hex-svg" viewBox="0 0 44 48">
              <polygon
                points="22,2 41,13 41,35 22,46 3,35 3,13"
                className="ht-inspector__hex-poly"
              />
            </svg>
            <span className="ht-inspector__hex-icon">
              <Icon name={domain.icon} size={20} />
            </span>
          </div>

          {/* Title & Online Status */}
          <div className="ht-inspector__header-info">
            <h2 className="ht-inspector__title">{fullName}</h2>
            <div className="ht-inspector__status-row">
              <span
                className={`ht-inspector__status-dot ${
                  isOnline ? 'ht-inspector__status-dot--online' : 'ht-inspector__status-dot--offline'
                }`}
              />
              <span className="ht-inspector__status-text">
                {isOnline
                  ? locale === 'fa' ? 'وضعیت: آنلاین' : 'Status: Online'
                  : locale === 'fa' ? 'وضعیت: آفلاین' : 'Status: Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Right header controls: Selected tag, 3-dots, close button */}
        <div className="ht-inspector__header-right">
          <span className="ht-inspector__selected-pill">
            {locale === 'fa' ? 'انتخاب‌شده' : 'Selected'}
          </span>
          <button
            type="button"
            className="ht-inspector__icon-btn"
            aria-label="More options" onClick={onMore}
          >
            <Icon name="moreVertical" size={17} />
          </button>
          <button
            type="button"
            className="ht-inspector__icon-btn"
            onClick={onClose}
            aria-label={labels.common.close}
          >
            <Icon name="close" size={17} />
          </button>
        </div>
      </div>

      <div className="ht-inspector__scroll-content">
        {/* Current Tasks Section */}
        <section className="ht-inspector__section">
          <div className="ht-inspector__sec-header">
            <h3 className="ht-inspector__sec-title">
              {labels.agents.currentTasks}
              <span className="ht-inspector__sec-count">({tasks.length})</span>
            </h3>
          </div>

          {tasks.length === 0 ? (
            <p className="ht-inspector__empty-text">{labels.empty.noTasks}</p>
          ) : (
            <ul className="ht-inspector__task-list">
              {tasks.map((task) => {
                const isInProgress =
                  task.status.toLowerCase().includes('progress') ||
                  task.status.toLowerCase().includes('پیشرفت');
                return (
                  <li key={task.id} className="ht-inspector__task-item">
                    <span className="ht-inspector__task-title">{task.title}</span>
                    <span
                      className={`ht-inspector__task-badge ${
                        isInProgress
                          ? 'ht-inspector__task-badge--progress'
                          : 'ht-inspector__task-badge--queued'
                      }`}
                    >
                      {task.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Tools Section */}
        <section className="ht-inspector__section">
          <div className="ht-inspector__sec-header">
            <h3 className="ht-inspector__sec-title">
              {labels.agents.tools}
              <span className="ht-inspector__sec-count">({tools.length})</span>
            </h3>
          </div>

          {tools.length === 0 ? (
            <p className="ht-inspector__empty-text">{labels.empty.noTools}</p>
          ) : (
            <ul className="ht-inspector__tool-list">
              {tools.map((tool) => (
                <li key={tool.id}><button type="button" className="ht-inspector__tool-item" onClick={() => onTool?.(tool)} title={tool.description}>
                  <span className="ht-inspector__tool-name">{tool.name}</span>
                  <Icon name="chevronRight" size={16} className="ht-inspector__tool-chevron" />
                </button></li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent Outputs Section */}
        <section className="ht-inspector__section">
          <div className="ht-inspector__sec-header">
            <h3 className="ht-inspector__sec-title">{labels.agents.recentOutputs}</h3>
            <button type="button" className="ht-inspector__view-all-btn" onClick={onViewOutputs}>
              {labels.agents.viewAll || 'View all'}
            </button>
          </div>

          {outputs.length === 0 ? (
            <p className="ht-inspector__empty-text">{labels.empty.noOutputs}</p>
          ) : (
            <ul className="ht-inspector__output-list">
              {outputs.map((out) => (
                <li key={out.id} className="ht-inspector__output-item">
                  <div className="ht-inspector__output-icon">
                    <Icon name="fileText" size={18} />
                  </div>
                  <div className="ht-inspector__output-info">
                    <span className="ht-inspector__output-title">{out.title}</span>
                    <span className="ht-inspector__output-time">
                      {out.timeAgo || new Date(out.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Action Footer matching Image 2 */}
      <div className="ht-inspector__footer">
        <button
          type="button"
          className="ht-inspector__ask-btn"
          onClick={onAsk}
          aria-label={`${labels.agents.askAgent}: ${fullName}`}
        >
          <Icon name="assistant" size={18} strokeWidth={2} />
          <span>{labels.agents.askAgent}</span>
        </button>
      </div>
    </aside>
  );
}
