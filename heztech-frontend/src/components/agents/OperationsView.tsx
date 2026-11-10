import { useMemo } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { AgentDomain, AgentDomainId } from '@/types';
import type { LabelKey } from '@/i18n/labels';
import './OperationsView.css';

interface OperationsViewProps {
  labels: LabelKey;
  domains: AgentDomain[];
  selectedId: AgentDomainId | null;
  onSelect: (id: AgentDomainId) => void;
  locale: 'en' | 'fa';
}

/**
 * OperationsView replicates the exact Grok Reference Layout (Image 2: media_1792568910810_3cdc2ae4.jpg):
 * - Central Master Agent with Crown, glowing concentric rings, and title/subtitle
 * - 6 Pointy-Topped Hexagon Nodes flanking symmetrically (3 left, 3 right):
 *     Top-Left: Research | Top-Right: Analytics (highlighted cyan glow when selected)
 *     Mid-Left: Strategy | Mid-Right: Risk
 *     Bottom-Left: Operations | Bottom-Right: Knowledge
 * - Glowing PCB circuit lines connecting Master Agent to each Hexagon Node
 */
export function OperationsView({
  labels,
  domains,
  selectedId,
  onSelect,
  locale,
}: OperationsViewProps) {
  // Symmetrical coordinate map matching Grok reference (percentage of container)
  const nodePositions: Record<AgentDomainId, { x: number; y: number; svgX: number; svgY: number }> = useMemo(() => ({
    research:   { x: 23, y: 20, svgX: 230, svgY: 140 },
    strategy:   { x: 14, y: 50, svgX: 140, svgY: 350 },
    operations: { x: 23, y: 80, svgX: 230, svgY: 560 },
    analytics:  { x: 77, y: 20, svgX: 770, svgY: 140 },
    risk:       { x: 86, y: 50, svgX: 860, svgY: 350 },
    knowledge:  { x: 77, y: 80, svgX: 770, svgY: 560 },
  }), []);

  return (
    <div className="ht-ops-view" role="region" aria-label="Agent Operations Command Center">
      {/* Background SVG circuit lines connecting Master to all 6 hexagons */}
      <svg
        className="ht-ops-view__circuit-svg"
        viewBox="0 0 1000 700"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="ht-line-glow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0284c7" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.4" />
          </linearGradient>
          <filter id="ht-cyan-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {domains.map((d) => {
          const pos = nodePositions[d.id];
          if (!pos) return null;
          const isSelected = selectedId === d.id;

          return (
            <g key={`circuit-${d.id}`}>
              {/* Outer soft glow line when selected */}
              {isSelected && (
                <line
                  x1="500"
                  y1="350"
                  x2={pos.svgX}
                  y2={pos.svgY}
                  stroke="#38bdf8"
                  strokeWidth="6"
                  strokeOpacity="0.35"
                  filter="url(#ht-cyan-glow)"
                />
              )}
              {/* Core circuit line */}
              <line
                x1="500"
                y1="350"
                x2={pos.svgX}
                y2={pos.svgY}
                className={`ht-ops-view__line ${isSelected ? 'ht-ops-view__line--selected' : ''}`}
              />
              {/* Circuit connection port circle at node attachment */}
              <circle
                cx={pos.svgX}
                cy={pos.svgY}
                r={isSelected ? 4.5 : 3}
                className={`ht-ops-view__port ${isSelected ? 'ht-ops-view__port--selected' : ''}`}
              />
            </g>
          );
        })}

        {/* Center hub decorative rings */}
        <circle cx="500" cy="350" r="105" className="ht-ops-view__hub-outer-ring" />
        <circle cx="500" cy="350" r="92" className="ht-ops-view__hub-dashed-ring" />
      </svg>

      {/* Central Master Agent Orb */}
      <div className="ht-ops-view__master">
        <div className="ht-ops-view__master-core">
          <div className="ht-ops-view__master-crown">
            <Icon name="crown" size={30} strokeWidth={2} />
          </div>
          <h2 className="ht-ops-view__master-title">{labels.agents.masterAgent}</h2>
          <p className="ht-ops-view__master-sub">{labels.agents.orchestrator}</p>
        </div>
      </div>

      {/* 6 Pointy-Topped Hexagon Nodes */}
      {domains.map((d) => {
        const pos = nodePositions[d.id];
        if (!pos) return null;
        const isSelected = selectedId === d.id;
        const domainKey = d.id as keyof typeof labels.domains;
        const name = labels.domains[domainKey]?.name || (locale === 'fa' ? d.nameFa : d.nameEn);
        const desc = labels.domains[domainKey]?.desc || (locale === 'fa' ? d.descriptionFa : d.descriptionEn);

        return (
          <button
            key={d.id}
            type="button"
            className={`ht-hex-node ${isSelected ? 'ht-hex-node--selected' : ''}`}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            onClick={() => onSelect(d.id)}
            aria-pressed={isSelected}
            aria-label={`${name} Agent: ${desc}`}
          >
            {/* SVG Pointy-Topped Vector Hexagon */}
            <svg
              className="ht-hex-node__shape"
              viewBox="0 0 162 176"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polygon
                points="81,4 157,45 157,131 81,172 5,131 5,45"
                className="ht-hex-node__polygon"
              />
            </svg>

            {/* Inner Content */}
            <div className="ht-hex-node__body">
              <span className="ht-hex-node__icon">
                <Icon name={d.icon} size={26} strokeWidth={1.8} />
              </span>
              <span className="ht-hex-node__name">{name}</span>
              <span className="ht-hex-node__desc">{desc}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
