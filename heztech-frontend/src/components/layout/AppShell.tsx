import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { VoiceOrbModal } from '@/components/voice/VoiceOrbModal';
import { useLocale } from '@/hooks/useLocale';
import { useAdapters } from '@/hooks/useAdapters';
import type { SystemHealth } from '@/types';
import './AppShell.css';

export function AppShell() {
  const { labels, locale, setLocale } = useLocale();
  const [collapsed, setCollapsed] = useState(false);
  const [isVoiceOrbOpen, setIsVoiceOrbOpen] = useState(false);
  const adapters = useAdapters();
  const [health, setHealth] = useState<SystemHealth>({ status: 'unknown' });

  useEffect(() => {
    const handleOpenVoice = () => setIsVoiceOrbOpen(true);
    window.addEventListener('heztech:open-voice-orb', handleOpenVoice);
    return () => window.removeEventListener('heztech:open-voice-orb', handleOpenVoice);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!adapters.system) {
        if (!cancelled) setHealth({ status: 'disconnected', message: labels.notConnected });
        return;
      }
      const res = await adapters.system.getHealth();
      if (cancelled) return;
      if (res.ok) setHealth(res.data);
      else setHealth({ status: 'disconnected', message: res.error });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [adapters.system, labels.notConnected]);

  useEffect(() => { document.documentElement.dataset.theme = localStorage.getItem('heztech-theme') || 'dark'; }, []);

  const systemConnected = health.status === 'connected';
  const statusLabel =
    health.message ||
    (health.status === 'connected'
      ? labels.common.online
      : health.status === 'disconnected'
        ? labels.notConnected
        : labels.unavailable);

  return (
    <div className="ht-shell">
      <Sidebar
        labels={labels}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        systemStatusLabel={statusLabel}
        systemConnected={systemConnected}
      />
      <div className="ht-shell__main">
        <header className="ht-shell__header">
          <div className="ht-shell__header-spacer" />
          <div className="ht-shell__header-actions">
            {/* Holographic Voice Orb Live Launcher matching reference image */}
            <button
              type="button"
              className="ht-live-orb-btn"
              onClick={() => setIsVoiceOrbOpen(true)}
              title={labels.voiceOrb.openVoice}
              aria-label={labels.voiceOrb.openVoice}
            >
              <span className="ht-live-orb-btn__dot" />
              <span>{labels.voiceOrb.live}</span>
              <span className="ht-live-orb-btn__mini-orb" />
            </button>

            <button
              type="button"
              className="ht-lang-toggle"
              onClick={() => setLocale(locale === 'en' ? 'fa' : 'en')}
              aria-label="Toggle language"
            >
              {locale === 'en' ? 'فا' : 'EN'}
            </button>
          </div>
        </header>
        <main className="ht-shell__content">
          <Outlet />
        </main>
      </div>

      {/* Holographic Voice Orb Fullscreen Companion Overlay */}
      <VoiceOrbModal
        isOpen={isVoiceOrbOpen}
        onClose={() => setIsVoiceOrbOpen(false)}
      />
    </div>
  );
}
