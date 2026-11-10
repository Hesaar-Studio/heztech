import { useCallback, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { ARCHITECTURE_AGENTS } from '@/data/agents';
import type { AgentDomainId, ArchitectureAgent } from '@/types';
import type { LabelKey } from '@/i18n/labels';
import './ArchitectureView.css';

interface ArchitectureViewProps {
  labels: LabelKey;
  selectedId: AgentDomainId | null;
  onSelect: (id: AgentDomainId) => void;
  locale: 'en' | 'fa';
}

/**
 * ArchitectureView faithfully replicates Grok Reference Image 1 (media_1792568910810_21933a99.jpg):
 * - Top Center: Master Agent with glowing neural orb and "Orchestrator & Coordinator"
 * - Left 3 Primary Cards: Reasoning Agent, Knowledge Agent, Execution Agent
 *     Each with 2 Sub-Agent Hex Capsules (Logic/Planning, Retrieval/Memory, Task/Automation)
 * - Right 3 Primary Cards: Communication Agent, Analysis Agent, Security Agent
 *     Each with 2 Sub-Agent Hex Capsules (Dialogue/Channel, Analytics/Evaluation, Guardrail/Compliance)
 * - PCB-style circuit paths connecting Master Agent to Primaries and Primaries to Sub-Agents
 */
export function ArchitectureView({
  labels,
  selectedId,
  onSelect,
  locale,
}: ArchitectureViewProps) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [subView, setSubView] = useState<'architecture' | 'system'>('architecture');
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(1.6, Math.max(0.65, s - e.deltaY * 0.001)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.ht-arch-card, .ht-arch-sub-capsule, button')) return;
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPan({
      x: dragRef.current.px + (e.clientX - dragRef.current.x),
      y: dragRef.current.py + (e.clientY - dragRef.current.y),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const fit = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  const leftPrimaries = ARCHITECTURE_AGENTS.slice(0, 3);
  const rightPrimaries = ARCHITECTURE_AGENTS.slice(3, 6);

  return (
    <div className="ht-arch-root" role="region" aria-label="System Architecture View">
      {/* Sub-view switcher & Zoom Toolbar matching Image 1 */}
      <div className="ht-arch-topbar">
        <div className="ht-arch-subtabs">
          <button
            type="button"
            className={`ht-arch-subtab ${subView === 'architecture' ? 'ht-arch-subtab--active' : ''}`}
            onClick={() => setSubView('architecture')}
          >
            <Icon name="layers" size={15} />
            <span>{locale === 'fa' ? 'نمای معماری' : 'Architecture View'}</span>
          </button>
          <button
            type="button"
            className={`ht-arch-subtab ${subView === 'system' ? 'ht-arch-subtab--active' : ''}`}
            onClick={() => setSubView('system')}
          >
            <Icon name="grid" size={15} />
            <span>{locale === 'fa' ? 'نمای سیستم' : 'System View'}</span>
          </button>
        </div>

        <div className="ht-arch-zoom">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setScale((s) => Math.min(1.6, s + 0.1))}
            aria-label={labels.agents.zoomIn}
          >
            <Icon name="zoomIn" size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setScale((s) => Math.max(0.65, s - 0.1))}
            aria-label={labels.agents.zoomOut}
          >
            <Icon name="zoomOut" size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={fit}
            aria-label={labels.agents.fitView}
          >
            <Icon name="fit" size={16} />
          </Button>
        </div>
      </div>

      {/* Main Canvas with pan & zoom */}
      <div
        className="ht-arch-canvas-wrap"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div
          className="ht-arch-canvas"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          }}
        >
          {/* Top Master Agent Node matching Reference Image 1 */}
          <div className="ht-arch-master-node">
            <span className="ht-arch-master-tag">MASTER AGENT</span>
            <span className="ht-arch-master-sub">Orchestrator & Coordinator</span>

            {/* Glowing concentric neural circular orb */}
            <div className="ht-arch-neural-orb">
              <div className="ht-arch-orb-pulse" />
              <div className="ht-arch-orb-inner">
                <Icon name="brain" size={38} className="ht-arch-orb-icon" strokeWidth={1.8} />
              </div>
            </div>
          </div>

          {/* PCB Circuit SVG Traces connecting Master to Left and Right Columns */}
          <svg
            className="ht-arch-pcb-svg"
            viewBox="0 0 1100 860"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* Master Agent bus splitting left and right */}
            {/* Left bus & spine */}
            <path
              d="M 500 135 L 290 135 L 290 680"
              className="ht-arch-pcb-line"
            />
            {/* Left horizontal spurs to cards */}
            <path d="M 290 250 L 315 250" className="ht-arch-pcb-line" />
            <path d="M 290 465 L 315 465" className="ht-arch-pcb-line" />
            <path d="M 290 680 L 315 680" className="ht-arch-pcb-line" />

            {/* Right bus & spine */}
            <path
              d="M 600 135 L 810 135 L 810 680"
              className="ht-arch-pcb-line"
            />
            {/* Right horizontal spurs to cards */}
            <path d="M 810 250 L 785 250" className="ht-arch-pcb-line" />
            <path d="M 810 465 L 785 465" className="ht-arch-pcb-line" />
            <path d="M 810 680 L 785 680" className="ht-arch-pcb-line" />

            {/* Junction & terminal dots */}
            <circle cx="500" cy="135" r="3.5" className="ht-arch-pcb-dot" />
            <circle cx="600" cy="135" r="3.5" className="ht-arch-pcb-dot" />
            <circle cx="290" cy="135" r="3.5" className="ht-arch-pcb-dot" />
            <circle cx="810" cy="135" r="3.5" className="ht-arch-pcb-dot" />
            <circle cx="315" cy="250" r="3" className="ht-arch-pcb-dot" />
            <circle cx="315" cy="465" r="3" className="ht-arch-pcb-dot" />
            <circle cx="315" cy="680" r="3" className="ht-arch-pcb-dot" />
            <circle cx="785" cy="250" r="3" className="ht-arch-pcb-dot" />
            <circle cx="785" cy="465" r="3" className="ht-arch-pcb-dot" />
            <circle cx="785" cy="680" r="3" className="ht-arch-pcb-dot" />
          </svg>

          {/* Symmetrical Two-Column Layout (Left: 3 Primary, Right: 3 Primary) */}
          <div className="ht-arch-columns-grid">
            {/* Left Column */}
            <div className="ht-arch-column ht-arch-column--left">
              {leftPrimaries.map((agent) => (
                <PrimaryAgentCard
                  key={agent.id}
                  agent={agent}
                  isSelected={selectedId === agent.id}
                  onSelect={() => onSelect(agent.id as AgentDomainId)}
                  locale={locale}
                />
              ))}
            </div>

            {/* Right Column */}
            <div className="ht-arch-column ht-arch-column--right">
              {rightPrimaries.map((agent) => (
                <PrimaryAgentCard
                  key={agent.id}
                  agent={agent}
                  isSelected={selectedId === agent.id}
                  onSelect={() => onSelect(agent.id as AgentDomainId)}
                  locale={locale}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Individual Primary Card + 2 Sub-Agent Hex Capsules */
function PrimaryAgentCard({
  agent,
  isSelected,
  onSelect,
}: {
  agent: ArchitectureAgent;
  isSelected: boolean;
  onSelect: () => void;
  locale: 'en' | 'fa';
}) {
  return (
    <div className={`ht-arch-group ${isSelected ? 'ht-arch-group--selected' : ''}`}>
      {/* Primary Agent Card */}
      <div
        className={`ht-arch-card ${isSelected ? 'ht-arch-card--selected' : ''}`}
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onSelect();
        }}
      >
        {/* Hexagon badge icon */}
        <div className="ht-arch-card__hex-badge">
          <svg className="ht-arch-card__hex-svg" viewBox="0 0 44 48">
            <polygon
              points="22,2 41,13 41,35 22,46 3,35 3,13"
              className="ht-arch-card__hex-poly"
            />
          </svg>
          <span className="ht-arch-card__hex-icon">
            <Icon name={agent.icon} size={20} strokeWidth={1.8} />
          </span>
        </div>

        {/* Title and role */}
        <div className="ht-arch-card__body">
          <h3 className="ht-arch-card__name">{agent.name}</h3>
          <p className="ht-arch-card__role">{agent.role}</p>
        </div>
      </div>

      {/* Circuit lines branching from Primary to its 2 Sub-Agents */}
      <div className="ht-arch-sub-branch">
        <svg className="ht-arch-sub-svg" viewBox="0 0 320 32" preserveAspectRatio="none">
          {/* Vertical stem from parent */}
          <line x1="160" y1="0" x2="160" y2="16" className="ht-arch-sub-line" />
          {/* Horizontal crossbar */}
          <line x1="80" y1="16" x2="240" y2="16" className="ht-arch-sub-line" />
          {/* Down stems to sub-agents */}
          <line x1="80" y1="16" x2="80" y2="32" className="ht-arch-sub-line" />
          <line x1="240" y1="16" x2="240" y2="32" className="ht-arch-sub-line" />
          {/* Port dots */}
          <circle cx="160" cy="16" r="2.5" className="ht-arch-pcb-dot" />
          <circle cx="80" cy="32" r="2.5" className="ht-arch-pcb-dot" />
          <circle cx="240" cy="32" r="2.5" className="ht-arch-pcb-dot" />
        </svg>

        {/* 2 Sub-Agent Hex Capsules matching Image 1 */}
        <div className="ht-arch-sub-capsules">
          {agent.subAgents.map((sub) => (
            <div key={sub.id} className="ht-arch-sub-capsule">
              <span className="ht-arch-sub-capsule__dot" />
              <span className="ht-arch-sub-capsule__name">{sub.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
