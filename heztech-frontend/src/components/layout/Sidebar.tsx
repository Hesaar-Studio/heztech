import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import type { LabelKey } from '@/i18n/labels';
import './Sidebar.css';

export interface NavItem {
  path: string;
  icon: string;
  labelKey: keyof LabelKey['nav'];
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', icon: 'home', labelKey: 'home' },
  { path: '/assistant', icon: 'assistant', labelKey: 'assistant' },
  { path: '/agents', icon: 'agents', labelKey: 'agents' },
  { path: '/web-research', icon: 'web', labelKey: 'webResearch' },
  { path: '/social-satellite', icon: 'social', labelKey: 'socialSatellite' },
  { path: '/marketing', icon: 'marketing', labelKey: 'marketing' },
  { path: '/media-studio', icon: 'media', labelKey: 'mediaStudio' },
  { path: '/missions', icon: 'missions', labelKey: 'missions' },
  { path: '/knowledge', icon: 'knowledge', labelKey: 'knowledge' },
  { path: '/connections', icon: 'connections', labelKey: 'connections' },
  { path: '/settings', icon: 'settings', labelKey: 'settings' },
];

interface SidebarProps {
  labels: LabelKey;
  collapsed: boolean;
  onToggle: () => void;
  systemStatusLabel: string;
  systemConnected: boolean;
}

export function Sidebar({ labels, collapsed, onToggle, systemStatusLabel, systemConnected }: SidebarProps) {
  return (
    <aside
      className={clsx('ht-sidebar', collapsed && 'ht-sidebar--collapsed')}
      aria-label="Main navigation"
    >
      <div className="ht-sidebar__brand">
        <div className="ht-sidebar__logo" aria-hidden>
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <path
              d="M16 2L28 9V23L16 30L4 23V9L16 2Z"
              stroke="url(#g)"
              strokeWidth="1.5"
              fill="rgba(59,130,246,0.15)"
            />
            <path d="M16 10L22 13.5V20.5L16 24L10 20.5V13.5L16 10Z" fill="#3b82f6" opacity="0.9" />
            <defs>
              <linearGradient id="g" x1="4" y1="2" x2="28" y2="30">
                <stop stopColor="#60a5fa" />
                <stop offset="1" stopColor="#2563eb" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        {!collapsed && (
          <div className="ht-sidebar__brand-text">
            <span className="ht-sidebar__title">{labels.appName}</span>
            <span className="ht-sidebar__sub">{labels.appSubtitle}</span>
          </div>
        )}
      </div>

      <nav className="ht-sidebar__nav">
        {NAV_ITEMS.filter(item => !['webResearch','socialSatellite','marketing','mediaStudio'].includes(item.labelKey)).map(item => (
          <NavLink key={item.path} to={item.path} end={item.path === '/'} className={({isActive})=>clsx('ht-sidebar__link',isActive&&'ht-sidebar__link--active')} title={labels.nav[item.labelKey]}>
            <Icon name={item.icon} size={20}/>{!collapsed&&<span>{labels.nav[item.labelKey]}</span>}
          </NavLink>
        ))}
        <details className="ht-sidebar__tools">
          <summary className="ht-sidebar__link">{document.documentElement.lang === 'fa' ? 'ابزارها' : 'Tools'}</summary>
          {NAV_ITEMS.filter(item => ['webResearch','socialSatellite','marketing','mediaStudio'].includes(item.labelKey)).map(item => (
            <NavLink key={item.path} to={item.path} className={({isActive})=>clsx('ht-sidebar__link',isActive&&'ht-sidebar__link--active')} title={labels.nav[item.labelKey]}>
              <Icon name={item.icon} size={20}/>{!collapsed&&<span>{labels.nav[item.labelKey]}</span>}
            </NavLink>
          ))}
        </details>
      </nav>

      <div className="ht-sidebar__footer">
        <div
          className={clsx('ht-sidebar__status', systemConnected && 'ht-sidebar__status--ok')}
          title={systemStatusLabel}
        >
          <span className="ht-sidebar__status-dot" aria-hidden />
          {!collapsed && (
            <span className="ht-sidebar__status-text">
              {labels.systemStatus}
              <small>{systemStatusLabel}</small>
            </span>
          )}
        </div>
        <button
          type="button"
          className="ht-sidebar__collapse"
          onClick={onToggle}
          aria-label={collapsed ? labels.common.expand : labels.common.collapse}
        >
          <Icon name={collapsed ? 'panelOpen' : 'panelClose'} size={18} />
          {!collapsed && <span>{labels.common.collapse}</span>}
        </button>
      </div>
    </aside>
  );
}

