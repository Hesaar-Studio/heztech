import { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useLocale } from '@/hooks/useLocale';
import './CouncilDeliberationModal.css';

interface CouncilDeliberationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Assessment {
  roleId: string;
  roleTitle: string;
  score?: number;
  recommendation?: string;
  analysis?: string;
  pros?: string[];
  cons?: string[];
}

interface DeliberationSession {
  id: string;
  title: string;
  description: string;
  mode: string;
  status: string;
  startTime: string;
  rounds: Array<{
    roundNumber: number;
    phase: string;
    assessments: Assessment[];
  }>;
  crossExaminations?: Array<{
    criticName: string;
    rebuttal: string;
    vulnerabilitiesIdentified?: string[];
  }>;
  finalVerdict?: {
    judgeName: string;
    decision: string;
    consensusScore: number;
    summary: string;
    actionItems?: string[];
  };
}

export function CouncilDeliberationModal({ isOpen, onClose }: CouncilDeliberationModalProps) {
  const { locale } = useLocale();
  const fa = locale === 'fa';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'DEEP' | 'QUICK'>('DEEP');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<DeliberationSession | null>(null);
  const [pastSessions, setPastSessions] = useState<any[]>([]);

  const api = window.heztech || window.hesatech;

  // Load past sessions
  useEffect(() => {
    if (!isOpen) return;
    if (api?.getCouncilSessions) {
      api.getCouncilSessions(5).then((res: any) => {
        if (res && res.success && res.sessions) {
          setPastSessions(res.sessions);
        }
      }).catch(() => {});
    }
  }, [isOpen, api]);

  if (!isOpen) return null;

  async function handleStart() {
    if (!title.trim() || running) return;
    setRunning(true);
    setError(null);
    try {
      if (!api?.deliberateCouncil) {
        throw new Error(fa ? 'رابط شورا در دسترس نیست.' : 'Council API is unavailable.');
      }
      const res = await api.deliberateCouncil({
        title: title.trim(),
        description: description.trim(),
        mode,
      });

      if (!res || !res.success) {
        throw new Error(res?.error || (fa ? 'خطا در برگزاری جلسه شورا.' : 'Failed to deliberate.'));
      }

      setActiveSession(res.session);
      // Refresh past sessions
      if (api.getCouncilSessions) {
        const past = await api.getCouncilSessions(5);
        if (past?.success) setPastSessions(past.sessions);
      }
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="ht-council-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="ht-council-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ht-council-modal__header">
          <div className="ht-council-modal__header-left">
            <Icon name="shield" size={24} />
            <div>
              <h2 className="ht-council-modal__title">
                {fa ? 'شورای عالی عاملیت‌های تخصصی (۷ عضو)' : 'High Council Deliberation (7 Agents)'}
              </h2>
              <p className="ht-council-modal__subtitle">
                {fa
                  ? 'بررسی چندجانبه، ارزیابی مستقل اعضا، مناظره منتقد و صدور حکم نهایی داور'
                  : 'Independent multi-agent evaluation, adversarial critique, and binding judge verdict'}
              </p>
            </div>
          </div>
          <button type="button" className="ht-council-modal__close" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="ht-council-modal__body">
          {/* New Deliberation Form */}
          <div className="ht-council-form">
            <div className="ht-council-form__row">
              <div className="ht-council-form__field">
                <label className="ht-council-form__label">
                  {fa ? 'عنوان ماموریت یا تصمیم راهبردی' : 'Mission Title or Strategic Decision'}
                </label>
                <input
                  type="text"
                  className="ht-council-form__input"
                  placeholder={fa ? 'مثال: معماری ادیتور ویدیو و اتصال پایگاه داده' : 'e.g. Video Editor Architecture & Storage'}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={running}
                />
              </div>

              <div className="ht-council-form__field" style={{ maxWidth: '180px' }}>
                <label className="ht-council-form__label">
                  {fa ? 'عمق مذاکره شورا' : 'Deliberation Depth'}
                </label>
                <select
                  className="ht-council-form__select"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as any)}
                  disabled={running}
                >
                  <option value="DEEP">{fa ? 'عمیق (۷ عضو کامل)' : 'Deep (All 7 Agents)'}</option>
                  <option value="QUICK">{fa ? 'سریع (۳ عضو کلیدی)' : 'Quick (3 Core Agents)'}</option>
                </select>
              </div>
            </div>

            <div className="ht-council-form__field">
              <label className="ht-council-form__label">
                {fa ? 'شرح بستر، الزامات و محدودیت‌ها' : 'Context, Requirements & Constraints'}
              </label>
              <textarea
                rows={3}
                className="ht-council-form__textarea"
                placeholder={fa ? 'جزئیات، ریسک‌ها یا نیازهای فنی را اینجا شرح دهید...' : 'Describe technical context, risks, and goals...'}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={running}
              />
            </div>

            <button
              type="button"
              className="ht-council-form__btn"
              onClick={handleStart}
              disabled={running || !title.trim()}
            >
              <Icon name="zap" size={18} />
              {running
                ? (fa ? 'در حال مذاکره اعضای شورا...' : 'Deliberating across agents...')
                : (fa ? 'برگزاری جلسه و صدور حکم شورا' : 'Convene Council & Deliberate')}
            </button>
            {error && <p className="ht-disconnected" role="alert">{error}</p>}
          </div>

          {/* Active Deliberation Results */}
          {activeSession && (
            <div className="ht-council-deliberation">
              {/* Round 1: Independent Assessments */}
              {activeSession.rounds?.[0]?.assessments && (
                <div className="ht-council-phase">
                  <h3 className="ht-council-phase__title">
                    <Icon name="check" size={20} />
                    {fa ? 'مرحله ۱: بررسی دیدگاه‌های تخصصی عامل اصلی' : 'Round 1: Specialist perspectives through the main agent'}
                  </h3>
                  <div className="ht-council-grid">
                    {activeSession.rounds[0].assessments.map((a, idx) => (
                      <div key={idx} className="ht-council-card">
                        <div className="ht-council-card__header">
                          <span className="ht-council-card__name">{a.roleTitle || a.roleId}</span>
                          {a.score !== undefined && (
                            <span className="ht-council-card__score">{a.score}/100</span>
                          )}
                        </div>
                        <p className="ht-council-card__text">{a.analysis || a.recommendation || JSON.stringify(a)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Round 2: Adversarial Critique */}
              {activeSession.crossExaminations && activeSession.crossExaminations.length > 0 && (
                <div className="ht-council-phase">
                  <h3 className="ht-council-phase__title" style={{ color: 'var(--ht-warning)' }}>
                    <Icon name="alertTriangle" size={20} />
                    {fa ? 'مرحله ۲: مناظره و چالش‌های منتقد (Red Team Rebuttal)' : 'Round 2: Adversarial Critique'}
                  </h3>
                  {activeSession.crossExaminations.map((c, idx) => (
                    <div key={idx} className="ht-council-card" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                      <span className="ht-council-card__name" style={{ color: 'var(--ht-warning)' }}>
                        {c.criticName || (fa ? 'منتقد شورا' : 'Council Critic')}
                      </span>
                      <p className="ht-council-card__text">{c.rebuttal || JSON.stringify(c)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Round 3: Judge Verdict */}
              {activeSession.finalVerdict && (
                <div className="ht-council-verdict">
                  <div className="ht-council-verdict__header">
                    <h3 className="ht-council-verdict__title">
                      {fa ? 'مرحله ۳: حکم قطعی و تصمیم نهایی داور' : 'Round 3: Final Arbiter Verdict'}
                    </h3>
                    <span className="ht-council-verdict__decision">
                      {activeSession.finalVerdict.decision} ({activeSession.finalVerdict.consensusScore}/100)
                    </span>
                  </div>
                  <p className="ht-council-verdict__text">
                    {activeSession.finalVerdict.summary}
                  </p>
                  {activeSession.finalVerdict.actionItems && activeSession.finalVerdict.actionItems.length > 0 && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <strong style={{ fontSize: 'var(--ht-text-xs)', color: 'var(--ht-accent-bright)' }}>
                        {fa ? 'اقدامات اجرایی الزامی:' : 'Mandatory Action Items:'}
                      </strong>
                      <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0 }}>
                        {activeSession.finalVerdict.actionItems.map((item, idx) => (
                          <li key={idx} style={{ fontSize: 'var(--ht-text-xs)', color: 'var(--ht-text-primary)' }}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Past Deliberations */}
          {!activeSession && pastSessions.length > 0 && (
            <div className="ht-council-phase">
              <h3 className="ht-council-phase__title">
                <Icon name="history" size={20} />
                {fa ? 'جلسات و احکام پیشین شورا' : 'Past Council Deliberations'}
              </h3>
              <div className="ht-council-grid">
                {pastSessions.map((s, idx) => (
                  <div
                    key={s.id || idx}
                    className="ht-council-card"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setActiveSession(s)}
                  >
                    <div className="ht-council-card__header">
                      <span className="ht-council-card__name">{s.title}</span>
                      <span className="ht-badge">{s.mode}</span>
                    </div>
                    <p className="ht-council-card__text" style={{ maxHeight: '60px', overflow: 'hidden' }}>
                      {s.finalVerdict?.summary || s.description || (fa ? 'جلسه ثبت شده شورا' : 'Recorded session')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
