import { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useLocale } from '@/hooks/useLocale';
import './SocialSatellitePage.css';

interface SocialProviderStatus {
  id: string;
  name: string;
  integrationStatus: 'implemented' | 'not-implemented';
  connectionStatus: 'connected' | 'not-connected' | 'not-configured';
  mode: string;
  capabilities: string[];
}

export function SocialSatellitePage() {
  const { locale } = useLocale();
  const fa = locale === 'fa';

  const [activeTab, setActiveTab] = useState<'reels' | 'approvals' | 'hooks' | 'accounts' | 'intelligence'>('reels');
  const [topic, setTopic] = useState('');
  const [skill, setSkill] = useState<'reels-script' | 'caption-linter' | 'viral-research'>('reels-script');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [intelPlatform, setIntelPlatform] = useState('instagram');
  const [intelTopic, setIntelTopic] = useState('');
  const [intelTrends, setIntelTrends] = useState<any>(null);
  const [intelCompetitor, setIntelCompetitor] = useState('');
  const [competitorData, setCompetitorData] = useState<any>(null);
  const [hookAuditText, setHookAuditText] = useState('');
  const [hookAuditResult, setHookAuditResult] = useState<any>(null);
  const [tregKey, setTregKey] = useState('');
  const [tregStatusInfo, setTregStatusInfo] = useState<any>(null);
  const [tregSearchQuery, setTregSearchQuery] = useState('');
  const [tregSearchResults, setTregSearchResults] = useState<any[]>([]);
  const [intelLoading, setIntelLoading] = useState(false);

  const [hooks, setHooks] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [metaAppId, setMetaAppId] = useState('');
  const [metaStatus, setMetaStatus] = useState<any>(null);
  const [metaAccounts, setMetaAccounts] = useState<any>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaMessage, setMetaMessage] = useState<string | null>(null);
  const [socialProviders, setSocialProviders] = useState<SocialProviderStatus[]>([]);
  const [socialProvidersError, setSocialProvidersError] = useState<string | null>(null);
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChannelId, setTelegramChannelId] = useState('');
  const [telegramConfirmed, setTelegramConfirmed] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState('');
  const [metaConfirmed, setMetaConfirmed] = useState(false);
  const [mfaStatus, setMfaStatus] = useState<boolean | null>(null);
  const [mfaEnrollment, setMfaEnrollment] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [approvalCodes, setApprovalCodes] = useState<Record<string, string>>({});

  const api = window.heztech || window.hesatech;

  async function refreshSocialProviders() {
    if (!api?.listSocialProviders) throw new Error(fa ? 'رابط فهرست سرویس‌ها در دسترس نیست.' : 'Social provider API is unavailable.');
    const res = await api.listSocialProviders();
    if (!res?.success || !Array.isArray(res.providers)) throw new Error(res?.error || 'Unable to refresh providers.');
    setSocialProviders(res.providers);
  }

  // Load hooks and approvals
  useEffect(() => {
    if (api?.getInstagramHooks) {
      api.getInstagramHooks().then((res: any) => {
        if (res && res.success && res.hooks) setHooks(res.hooks);
      }).catch(() => {});
    }

    if (api?.getApprovals) {
      api.getApprovals().then((res: any) => {
        if (res && res.success && res.approvals) setApprovals(res.approvals);
      }).catch(() => {});
    }

    if (api?.getMetaConnectionStatus) {
      api.getMetaConnectionStatus()
        .then((res: any) => {
          if (res?.success) setMetaStatus(res);
          else setMetaError(res?.error || (fa ? 'وضعیت اتصال Meta قابل دریافت نیست.' : 'Unable to load Meta connection status.'));
        })
        .catch((err: unknown) => setMetaError(err instanceof Error ? err.message : String(err)));
    }

    if (api?.listSocialProviders) {
      refreshSocialProviders()
        .catch((err: unknown) => setSocialProvidersError(err instanceof Error ? err.message : String(err)));
    } else {
      setSocialProvidersError(fa ? 'رابط اتصال‌دهنده‌های اجتماعی در دسترس نیست.' : 'Social provider IPC is unavailable.');
    }

    api?.getMfaStatus?.()
      .then((res: any) => setMfaStatus(Boolean(res?.enrolled)))
      .catch(() => setMfaStatus(false));
  }, [api]);

  async function refreshMetaStatus() {
    if (!api?.getMetaConnectionStatus) throw new Error(fa ? 'رابط Meta در دسترس نیست.' : 'Meta adapter is unavailable.');
    const res = await api.getMetaConnectionStatus();
    if (!res?.success) throw new Error(res?.error || (fa ? 'وضعیت اتصال Meta قابل دریافت نیست.' : 'Unable to load Meta connection status.'));
    setMetaStatus(res);
    return res;
  }

  const handleDiscoverTrends = async () => {
    if (!intelTopic) return;
    setIntelLoading(true);
    try {
      const res = await api?.socialDiscoverTrends?.({ platform: intelPlatform, topic: intelTopic });
      if (res?.success) setIntelTrends(res);
    } catch (_) {}
    setIntelLoading(false);
  };

  const handleAuditCompetitor = async () => {
    if (!intelCompetitor) return;
    setIntelLoading(true);
    try {
      const res = await api?.socialAnalyzeCompetitor?.({ platform: intelPlatform, handleOrUrl: intelCompetitor });
      if (res?.success) setCompetitorData(res);
    } catch (_) {}
    setIntelLoading(false);
  };

  const handleAuditHook = async () => {
    if (!hookAuditText) return;
    setIntelLoading(true);
    try {
      const res = await api?.socialAnalyzeHook?.(hookAuditText);
      if (res?.success) setHookAuditResult(res);
    } catch (_) {}
    setIntelLoading(false);
  };

  const handleLoadTregStatus = async () => {
    try {
      const s = await api?.tregGetStatus?.();
      setTregStatusInfo(s);
    } catch (_) {}
  };

  const handleConfigureTreg = async () => {
    if (!tregKey) return;
    setIntelLoading(true);
    try {
      await api?.tregConfigure?.({ apiKey: tregKey });
      setTregKey('');
      await handleLoadTregStatus();
    } catch (_) {}
    setIntelLoading(false);
  };

  const handleSearchTreg = async () => {
    if (!tregSearchQuery) return;
    setIntelLoading(true);
    try {
      const res = await api?.tregSearchCatalog?.({ query: tregSearchQuery });
      if (res?.success && Array.isArray(res.results)) setTregSearchResults(res.results);
    } catch (_) {}
    setIntelLoading(false);
  };

  async function handleMetaAuthorization() {
    if (metaLoading) return;
    setMetaLoading(true);
    setMetaError(null);
    setMetaMessage(null);
    setMetaAccounts(null);
    try {
      if (!api?.startMetaAuthorization) throw new Error(fa ? 'رابط مجوز Meta در دسترس نیست.' : 'Meta authorization is unavailable.');
      const res = await api.startMetaAuthorization(metaAppId.trim(), metaConfirmed);
      if (!res?.success) throw new Error(res?.error || (fa ? 'مجوز Meta کامل نشد.' : 'Meta authorization did not complete.'));
      setMetaConfirmed(false);
      await refreshMetaStatus();
      setMetaMessage(fa ? 'اتصال Meta برقرار شد. اکنون می‌توانید حساب‌ها را فقط‌خواندنی بررسی کنید.' : 'Meta connected. You can now verify accounts in read-only mode.');
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : String(err));
    } finally {
      setMetaLoading(false);
    }
  }

  async function handleVerifyMetaAccounts() {
    if (metaLoading) return;
    setMetaLoading(true);
    setMetaError(null);
    setMetaMessage(null);
    setMetaAccounts(null);
    try {
      if (!api?.verifyMetaAccounts) throw new Error(fa ? 'رابط بررسی حساب Meta در دسترس نیست.' : 'Meta account verification is unavailable.');
      const res = await api.verifyMetaAccounts();
      if (!res?.success) throw new Error(res?.error || (fa ? 'بررسی حساب‌ها ناموفق بود.' : 'Account verification failed.'));
      setMetaAccounts(res);
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : String(err));
    } finally {
      setMetaLoading(false);
    }
  }

  async function handleMetaDisconnect() {
    setMetaLoading(true);
    setMetaError(null);
    setMetaMessage(null);
    setMetaAccounts(null);
    try {
      if (!api?.disconnectMetaAccount) throw new Error(fa ? 'رابط قطع اتصال Meta در دسترس نیست.' : 'Meta disconnect is unavailable.');
      const res = await api.disconnectMetaAccount();
      if (!res?.success) throw new Error(res?.error || (fa ? 'قطع اتصال Meta ناموفق بود.' : 'Could not disconnect Meta.'));
      await refreshMetaStatus();
      setMetaMessage(res.revoked
        ? (fa ? 'توکن محلی پاک و دسترسی Meta لغو شد.' : 'The local token was cleared and Meta access was revoked.')
        : (fa ? 'توکن محلی پاک شد؛ لغو دسترسی سرور انجام نشد.' : 'The local token was cleared; remote revocation was not confirmed.'));
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : String(err));
    } finally {
      setMetaLoading(false);
    }
  }

  async function handleGenerate() {
    if (!topic.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      if (!api?.executeInstagramSkill) {
        throw new Error(fa ? 'رابط مهارت‌های اینستاگرام در دسترس نیست.' : 'Instagram skills API unavailable.');
      }
      const res = await api.executeInstagramSkill(skill, skill === 'caption-linter' ? { draftCaption: topic.trim() } : skill === 'viral-research' ? { niche: topic.trim() } : { topic: topic.trim() });
      if (!res || !res.success) {
        throw new Error(res?.error || (fa ? 'خطا در تولید محتوا' : 'Failed to generate content'));
      }
      setResult(res.result || res.script || res.data || res);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResolveApproval(id: string, approved: boolean, riskLevel?: string) {
    if (!api?.resolveApproval) return;
    try {
      if (approved && riskLevel !== 'LOW') {
        const code = approvalCodes[id] || '';
        if (!api.beginStepUp || !api.verifyStepUp) throw new Error(fa ? 'احراز مرحله‌ای در دسترس نیست.' : 'Step-up authentication is unavailable.');
        const challenge = await api.beginStepUp(id);
        if (!challenge?.success) throw new Error(challenge?.error || 'MFA challenge could not be created.');
        const verified = await api.verifyStepUp(challenge.challenge, id, code);
        if (!verified?.success) throw new Error(verified?.error || 'MFA verification failed.');
      }
      const resolved = await api.resolveApproval(id, approved, 'Owner');
      if (!resolved?.success) throw new Error(resolved?.error || 'Approval could not be resolved');
      setApprovals((prev) => prev.filter((a) => a.id !== id));
      setApprovalCodes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleTelegramAuthorization() {
    if (telegramBusy) return;
    setTelegramBusy(true);
    setTelegramMessage('');
    setError(null);
    try {
      if (!api?.authorizeSocialProvider) throw new Error(fa ? 'رابط Telegram در دسترس نیست.' : 'Telegram connector is unavailable.');
      const result = await api.authorizeSocialProvider('telegram', {
        botToken: telegramToken,
        channelId: telegramChannelId
      }, telegramConfirmed);
      if (!result?.success) throw new Error(result?.error || 'Telegram bot verification failed.');
      setTelegramToken('');
      setTelegramConfirmed(false);
      await refreshSocialProviders();
      setTelegramMessage(result.channelVerified
        ? (fa ? 'ربات و دسترسی مدیر کانال بررسی شد.' : 'Bot identity and channel-admin access verified.')
        : (fa ? 'هویت ربات بررسی شد؛ کانالی پیکربندی نشد.' : 'Bot identity verified; no channel was configured.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTelegramBusy(false);
    }
  }

  async function handleTelegramVerify() {
    setTelegramBusy(true);
    setError(null);
    try {
      if (!api?.verifySocialProvider) throw new Error('Telegram verification is unavailable.');
      const result = await api.verifySocialProvider('telegram', { channelId: telegramChannelId });
      if (!result?.success) throw new Error(result?.error || 'Telegram verification failed.');
      setTelegramMessage(result.channel
        ? `${result.bot.username ? `@${result.bot.username}` : result.bot.firstName} — ${result.channel.title}`
        : (result.bot.username ? `@${result.bot.username}` : result.bot.firstName));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTelegramBusy(false);
    }
  }

  async function handleTelegramDisconnect() {
    setTelegramBusy(true);
    setError(null);
    try {
      const result = await api?.disconnectSocialProvider?.('telegram', telegramConfirmed);
      if (!result?.success) throw new Error(result?.error || 'Telegram disconnect failed.');
      setTelegramConfirmed(false);
      await refreshSocialProviders();
      setTelegramMessage(fa ? 'Տեղային նշանը հեռացվեց․ BotFather-ում առանձին չեղարկեք բոտի token-ը։' : 'Local token removed; revoke it separately with BotFather.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTelegramBusy(false);
    }
  }

  async function handleBeginMfaEnrollment() {
    const result = await api?.beginMfaEnrollment?.(true);
    if (!result?.success) {
      setError(result?.error || 'Unable to begin MFA enrollment.');
      return;
    }
    setMfaEnrollment(result.secret);
  }

  async function handleCompleteMfaEnrollment() {
    const result = await api?.completeMfaEnrollment?.(mfaCode);
    if (!result?.success) {
      setError(result?.error || 'MFA enrollment failed.');
      return;
    }
    setMfaStatus(true);
    setMfaEnrollment('');
    setMfaCode('');
  }

  return (
    <div className="ht-social-page">
      <header className="ht-social-header">
        <div>
          <h1 className="ht-social-title">
            {fa ? 'سوشیال ماهواره و استودیو تولید محتوا' : 'Social Satellite & Content Studio'}
          </h1>
          <p className="ht-social-subtitle">
            {fa
              ? 'تولید سناریوهای وایرال اینستاگرام، اعتبارسنجی کپشن، مهندسی قلاب‌های توجه و گیت تایید مالک'
              : 'Viral Reels scripting, caption optimization, 26 hook formulas, and Owner Permission Gate'}
          </p>
        </div>

        <div className="ht-social-gate-badge">
          <Icon name="lock" size={16} />
          <span>{fa ? 'گیت امنیتی: با اجازه خودم (Human-in-the-Loop)' : 'Owner Permission Gate Active'}</span>
        </div>
      </header>

      {/* Tabs */}
      <div className="ht-social-tabs">
        <button
          type="button"
          className={`ht-social-tab-btn ${activeTab === 'reels' ? 'ht-social-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('reels')}
        >
          <Icon name="video" size={16} />
          <span>{fa ? 'تولید سناریو ریلز وایرال' : 'Reels Script Generator'}</span>
        </button>

        <button
          type="button"
          className={`ht-social-tab-btn ${activeTab === 'approvals' ? 'ht-social-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('approvals')}
        >
          <Icon name="shield" size={16} />
          <span>{fa ? 'درخواست‌های تایید مالک («با اجازه خودم»)' : 'Pending Approvals'}</span>
          {approvals.length > 0 && <span className="ht-badge">{approvals.length}</span>}
        </button>

        <button
          type="button"
          className={`ht-social-tab-btn ${activeTab === 'hooks' ? 'ht-social-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('hooks')}
        >
          <Icon name="zap" size={16} />
          <span>{fa ? 'بانک ۲۶ قلاب وایرال' : '26 Viral Hooks Library'}</span>
        </button>

        <button
          type="button"
          className={`ht-social-tab-btn ${activeTab === 'accounts' ? 'ht-social-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('accounts')}
        >
          <Icon name="lock" size={16} />
          <span>{fa ? 'اتصال حساب‌های Meta' : 'Meta Accounts'}</span>
        </button>

        <button
          type="button"
          className={`ht-social-tab-btn ${activeTab === 'intelligence' ? 'ht-social-tab-btn--active' : ''}`}
          onClick={() => { setActiveTab('intelligence'); handleLoadTregStatus(); }}
        >
          <Icon name="search" size={16} />
          <span>{fa ? 'هوشمندی اجتماعی و ابزار Treg' : 'Social Intelligence & Treg'}</span>
        </button>
      </div>

      {/* Tab: Reels & Script Generator */}
      {activeTab === 'reels' && (
        <div className="ht-social-grid">
          <div className="ht-social-card">
            <h2 className="ht-social-card__title">
              <Icon name="sparkles" size={18} />
              {fa ? 'تنظیمات تولید محتوا' : 'Content Generation Settings'}
            </h2>

            <div className="ht-social-field">
              <label className="ht-social-label">{fa ? 'مهارت مورد نظر' : 'Target Skill'}</label>
              <select
                className="ht-social-select"
                value={skill}
                onChange={(e) => setSkill(e.target.value as any)}
                disabled={loading}
              >
                <option value="reels-script">{fa ? 'سناریو و استوری‌بورد ریلز (High-Retention)' : 'Viral Reels Script'}</option>
                <option value="caption-linter">{fa ? 'کپشن‌نویسی طبیعی و انسانی (Humanize)' : 'Caption Linter & Humanizer'}</option>
                <option value="viral-research">{fa ? 'تحلیل ترندها و هشتگ‌های پرمخاطب' : 'Viral Trends & Hashtags'}</option>
              </select>
            </div>

            <div className="ht-social-field">
              <label className="ht-social-label">{fa ? 'موضوع یا نیچ محتوایی' : 'Topic / Niche'}</label>
              <textarea
                rows={4}
                className="ht-social-textarea"
                placeholder={fa ? 'مثال: اضطراب از کجا شروع میشه و راهکارهای مدیریت استرس روزمره' : 'e.g. Psychology: Where does anxiety start?'}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={loading}
              />
            </div>

            <button
              type="button"
              className="ht-social-btn"
              onClick={handleGenerate}
              disabled={loading || !topic.trim()}
            >
              <Icon name="zap" size={18} />
              {loading ? (fa ? 'در حال تولید و مهندسی سناریو...' : 'Generating...') : (fa ? 'مهندسی و تولید سناریو ریلز' : 'Generate Viral Content')}
            </button>
            {error && <p className="ht-disconnected" role="alert">{error}</p>}
          </div>

          <div className="ht-social-card">
            <h2 className="ht-social-card__title">
              <Icon name="fileText" size={18} />
              {fa ? 'خروجی سناریو و استوری‌بورد' : 'Script & Storyboard Output'}
            </h2>

            {result ? (
              <div className="ht-social-result-box">
                {result.hookFormula && (
                  <div>
                    <span className="ht-social-hook-badge">
                      <Icon name="zap" size={14} />
                      {fa ? 'فرمول قلاب:' : 'Hook Formula:'} {result.hookFormula} ({result.hookScore || '95'}/100)
                    </span>
                  </div>
                )}

                {result.storyboard && Array.isArray(result.storyboard) && (
                  <div>
                    <strong style={{ fontSize: 'var(--ht-text-xs)', color: 'var(--ht-accent-bright)' }}>
                      {fa ? 'استوری‌بورد ثانیه‌به‌ثانیه:' : 'Second-by-Second Storyboard:'}
                    </strong>
                    <table className="ht-social-storyboard-table">
                      <thead>
                        <tr>
                          <th>{fa ? 'زمان' : 'Time'}</th>
                          <th>{fa ? 'بخش' : 'Beat'}</th>
                          <th>{fa ? 'تصویر و بی-رول' : 'Visual / B-Roll'}</th>
                          <th>{fa ? 'گفتار گوینده' : 'Spoken Audio'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.storyboard.map((s: any, idx: number) => (
                          <tr key={idx}>
                            <td>{s.seconds || s.time}</td>
                            <td><strong>{s.beat || s.stage}</strong></td>
                            <td>{s.visual || s.broll}</td>
                            <td>{s.spoken || s.text}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {result.caption && (
                  <div>
                    <strong style={{ fontSize: 'var(--ht-text-xs)', color: 'var(--ht-accent-bright)' }}>
                      {fa ? 'کپشن و هشتگ‌های بهینه‌سازی‌شده:' : 'Caption & Hashtags:'}
                    </strong>
                    <div className="ht-social-caption-box">
                      {result.caption}
                    </div>
                  </div>
                )}

                {!result.storyboard && !result.caption && (
                  <pre style={{ fontSize: 'var(--ht-text-xs)', whiteSpace: 'pre-wrap' }}>
                    {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                  </pre>
                )}
              </div>
            ) : (
              <div className="ht-empty-state">
                <p>{fa ? 'موضوع مورد نظرتان را وارد کرده و دکمه تولید را بزنید.' : 'Enter a topic and generate viral content.'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Pending Approvals */}
      {activeTab === 'approvals' && (
        <div className="ht-social-card">
          <h2 className="ht-social-card__title">
            <Icon name="shield" size={18} />
            {fa ? 'درخواست‌های در انتظار تایید انسانی («با اجازه خودم»)' : 'Pending Approvals Awaiting Owner Signature'}
          </h2>
          <p className="ht-social-subtitle">
            {fa
              ? 'هیچ اقدامی روی شبکه‌های اجتماعی، ارسال پیام یا انتشار بدون تایید مستقیم شما در این بخش انجام نمی‌پذیرد.'
              : 'Zero external actions occur without your explicit approval in this panel.'}
          </p>

          <section className="ht-social-mfa" aria-labelledby="social-mfa-title">
            <h3 id="social-mfa-title">{fa ? 'احراز چندعاملی و تایید مرحله‌ای' : 'MFA and step-up approval'}</h3>
            <p role="status">
              {mfaStatus === null
                ? (fa ? 'در حال بررسی وضعیت MFA…' : 'Checking MFA status…')
                : mfaStatus
                  ? (fa ? 'MFA فعال است؛ تایید درخواست‌های پرخطر به کد یک‌بارمصرف نیاز دارد.' : 'MFA is enrolled; approving high-risk requests requires a one-time code.')
                  : (fa ? 'MFA راه‌اندازی نشده است؛ تایید درخواست‌های پرخطر تا راه‌اندازی مسدود می‌ماند.' : 'MFA is not enrolled; high-risk approvals remain blocked until setup.')}
            </p>
            {!mfaStatus && !mfaEnrollment && (
              <button type="button" className="ht-social-btn" onClick={handleBeginMfaEnrollment}>
                {fa ? 'راه‌اندازی MFA' : 'Set up MFA'}
              </button>
            )}
            {mfaEnrollment && (
              <div className="ht-social-field">
                <p>{fa ? 'این کلید را در برنامهٔ احراز هویت وارد کنید:' : 'Add this secret to your authenticator app:'}</p>
                <code>{mfaEnrollment}</code>
                <label className="ht-social-label" htmlFor="mfa-enrollment-code">{fa ? 'کد شش‌رقمی' : 'Six-digit code'}</label>
                <input id="mfa-enrollment-code" className="ht-social-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
                <button type="button" className="ht-social-btn" onClick={handleCompleteMfaEnrollment} disabled={mfaCode.length !== 6}>
                  {fa ? 'تایید و فعال‌سازی MFA' : 'Verify and enable MFA'}
                </button>
              </div>
            )}
          </section>
          {error && <p className="ht-disconnected" role="alert">{error}</p>}

          {approvals.length === 0 ? (
            <div className="ht-empty-state">
              <p>{fa ? 'در حال حاضر هیچ درخواستی در انتظار تایید نیست.' : 'No pending approvals.'}</p>
            </div>
          ) : (
            <div className="ht-approvals-list">
              {approvals.map((app) => (
                <div key={app.id} className="ht-approval-item">
                  <div className="ht-approval-info">
                    <span className="ht-approval-title">{app.type || 'EXTERNAL_ACTION'}: {app.summary || app.id}</span>
                    <span className="ht-approval-meta">
                      {fa ? 'سرویس:' : 'Service:'} {app.service || 'Social'} | {fa ? 'شناسه:' : 'ID:'} {app.id}
                    </span>
                  </div>
                  <div className="ht-approval-actions">
                    {app.riskLevel !== 'LOW' && (
                      <label className="ht-social-field">
                        <span className="ht-social-label">{fa ? 'کد MFA برای تایید' : 'MFA code to approve'}</span>
                        <input
                          className="ht-social-input"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          aria-label={fa ? `کد MFA برای ${app.id}` : `MFA code for ${app.id}`}
                          value={approvalCodes[app.id] || ''}
                          onChange={(event) => setApprovalCodes((prev) => ({ ...prev, [app.id]: event.target.value.replace(/\D/g, '').slice(0, 6) }))}
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      className="ht-approval-btn--approve"
                      onClick={() => handleResolveApproval(app.id, true, app.riskLevel)}
                      disabled={app.riskLevel !== 'LOW' && (approvalCodes[app.id] || '').length !== 6}
                    >
                      {fa ? 'تایید و اجازه انجام' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      className="ht-approval-btn--reject"
                      onClick={() => handleResolveApproval(app.id, false, app.riskLevel)}
                    >
                      {fa ? 'رد درخواست' : 'Reject'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: 26 Viral Hooks */}
      {activeTab === 'hooks' && (
        <div className="ht-social-card">
          <h2 className="ht-social-card__title">
            <Icon name="zap" size={18} />
            {fa ? 'کتابخانه ۲۶ فرمول طلایی قلاب‌های وایرال اینستاگرام' : '26 Viral Hook Formulas'}
          </h2>
          <div className="ht-council-grid">
            {hooks.map((h, idx) => (
              <div key={idx} className="ht-council-card">
                <div className="ht-council-card__header">
                  <span className="ht-council-card__name">{h.name || h.title || `فرمول ${idx + 1}`}</span>
                  <span className="ht-council-card__score">{h.score || 90}/100</span>
                </div>
                <p className="ht-council-card__text">{h.formula || h.template || h.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'accounts' && (
        <>
        <section className="ht-social-card" aria-labelledby="social-provider-title">
          <h2 id="social-provider-title" className="ht-social-card__title">
            <Icon name="layers" size={18} />
            {fa ? 'مرکز یکپارچهٔ حساب‌ها و سرویس‌ها' : 'Unified accounts & services'}
          </h2>
          <p className="ht-social-subtitle">
            {fa
              ? 'فقط اتصال‌هایی که واقعاً آداپتر دارند به‌عنوان پیاده‌سازی‌شده نمایش داده می‌شوند؛ سایر سرویس‌ها هنوز متصل نیستند.'
              : 'Only providers with a real adapter are marked implemented. The remaining services are not connected.'}
          </p>
          {socialProvidersError && <p className="ht-disconnected" role="alert">{socialProvidersError}</p>}
          <div className="ht-social-provider-grid">
            {socialProviders.map((provider) => {
              const implemented = provider.integrationStatus === 'implemented';
              const connected = provider.connectionStatus === 'connected';
              return (
                <article className="ht-social-provider" key={provider.id}>
                  <div className="ht-social-provider__heading">
                    <strong>{provider.name}</strong>
                    <span className={`ht-social-provider__status ${connected ? 'ht-social-provider__status--connected' : ''}`}>
                      {connected
                        ? (fa ? 'متصل' : 'Connected')
                        : implemented
                          ? (fa ? 'آداپتر آماده؛ حساب متصل نیست' : 'Adapter ready; not connected')
                          : (fa ? 'پیاده‌سازی نشده' : 'Not implemented')}
                    </span>
                  </div>
                  <span className="ht-social-provider__detail">
                    {implemented
                          ? (fa ? `حالت: ${provider.mode} · ${provider.capabilities.join('، ')}` : `Mode: ${provider.mode} · ${provider.capabilities.join(', ')}`)
                      : (fa ? 'تا زمان افزودن آداپتر رسمی، هیچ اتصال یا قابلیتی ادعا نمی‌شود.' : 'No connection or capability is claimed until an official adapter is added.')}
                  </span>
                </article>
              );
            })}
            {!socialProviders.length && !socialProvidersError && (
              <p className="ht-social-subtitle">{fa ? 'در حال دریافت وضعیت سرویس‌ها…' : 'Loading provider status…'}</p>
            )}
          </div>
        </section>

        <section className="ht-social-card" aria-labelledby="telegram-connector-title">
          <h2 id="telegram-connector-title" className="ht-social-card__title">
            <Icon name="lock" size={18} />
            {fa ? 'اتصال رسمی ربات تلگرام' : 'Official Telegram Bot API'}
          </h2>
          <p className="ht-social-subtitle">
            {fa
              ? 'توکن فقط هنگام تایید getMe به API رسمی تلگرام فرستاده می‌شود و در مخزن رمزگذاری‌شدهٔ سیستم‌عامل ذخیره می‌شود. هیچ پیامی ارسال یا کانالی تغییر داده نمی‌شود.'
              : 'The bot token is sent only to verify getMe with the official Telegram API and is stored in OS-encrypted storage. No messages are sent and no channel is changed.'}
          </p>
          {telegramMessage && <p role="status">{telegramMessage}</p>}
          {socialProviders.find((provider) => provider.id === 'telegram')?.connectionStatus !== 'connected' ? (
            <div className="ht-social-field">
              <label className="ht-social-label" htmlFor="telegram-bot-token">{fa ? 'توکن BotFather' : 'BotFather bot token'}</label>
              <input
                id="telegram-bot-token"
                type="password"
                className="ht-social-input"
                autoComplete="new-password"
                value={telegramToken}
                onChange={(event) => setTelegramToken(event.target.value)}
                disabled={telegramBusy}
              />
              <label className="ht-social-label" htmlFor="telegram-channel-id">{fa ? 'شناسه یا نام کاربری کانال (اختیاری)' : 'Channel ID or username (optional)'}</label>
              <input
                id="telegram-channel-id"
                className="ht-social-input"
                autoComplete="off"
                value={telegramChannelId}
                onChange={(event) => setTelegramChannelId(event.target.value)}
                disabled={telegramBusy}
              />
              <label className="ht-social-confirm">
                <input type="checkbox" checked={telegramConfirmed} onChange={(event) => setTelegramConfirmed(event.target.checked)} />
                {fa ? 'تایید می‌کنم این ربات متعلق به من است و بررسی هویت آن را مجاز می‌دانم.' : 'I confirm I own this bot and authorize verification of its identity.'}
              </label>
              <button type="button" className="ht-social-btn" onClick={handleTelegramAuthorization} disabled={telegramBusy || !telegramToken.trim() || !telegramConfirmed}>
                {telegramBusy ? (fa ? 'در حال بررسی…' : 'Verifying…') : (fa ? 'تایید و ذخیرهٔ امن ربات' : 'Verify and securely store bot')}
              </button>
            </div>
          ) : (
            <div className="ht-meta-actions">
              <button type="button" className="ht-social-btn" onClick={handleTelegramVerify} disabled={telegramBusy}>
                {fa ? 'بررسی ربات و کانال' : 'Verify bot and channel'}
              </button>
              <label className="ht-social-confirm">
                <input type="checkbox" checked={telegramConfirmed} onChange={(event) => setTelegramConfirmed(event.target.checked)} />
                {fa ? 'قطع اتصال این ربات را تایید می‌کنم.' : 'I confirm that I want to disconnect this bot.'}
              </label>
              <button type="button" className="ht-meta-disconnect" onClick={handleTelegramDisconnect} disabled={telegramBusy || !telegramConfirmed}>
                {fa ? 'قطع اتصال' : 'Disconnect'}
              </button>
            </div>
          )}
        </section>

        <div className="ht-social-card ht-meta-card">
          <h2 className="ht-social-card__title">
            <Icon name="lock" size={18} />
            {fa ? 'درگاه محلی Meta — مرحلهٔ اول' : 'Local Meta Gateway — Phase 1'}
          </h2>
          <p className="ht-social-subtitle">
            {fa
              ? 'آداپتر در فرایند محلی کار می‌کند و listener جدید نمی‌سازد. توکن در مخزن رمزگذاری‌شدهٔ سیستم‌عامل می‌ماند؛ قطع اتصال ابتدا نسخهٔ محلی را پاک می‌کند و سپس لغو دسترسی را از Meta درخواست می‌کند.'
              : 'The adapter runs in the local process and opens no listener. Tokens are stored in OS-encrypted storage; disconnect clears local credentials first and then requests revocation from Meta.'}
          </p>

          <div className={`ht-meta-status ${metaStatus?.connected ? 'ht-meta-status--connected' : ''}`} role="status">
            <span className="ht-meta-status__dot" aria-hidden />
            <strong>
              {metaStatus?.connected
                ? (fa ? 'متصل (مخزن رمزگذاری‌شدهٔ سیستم‌عامل)' : 'Connected (OS-encrypted credential store)')
                : (fa ? 'متصل نیست' : 'Not connected')}
            </strong>
            {metaStatus?.connected && metaStatus.expiresAt && (
              <span>{fa ? 'انقضا:' : 'Expires:'} {new Date(metaStatus.expiresAt).toLocaleString(locale)}</span>
            )}
          </div>

          {!metaStatus?.connected && (
            <div className="ht-social-field">
              <label className="ht-social-label" htmlFor="meta-app-id">{fa ? 'شناسهٔ برنامهٔ Meta' : 'Meta App ID'}</label>
              <input
                id="meta-app-id"
                className="ht-social-input"
                inputMode="numeric"
                autoComplete="off"
                value={metaAppId}
                onChange={(event) => setMetaAppId(event.target.value.replace(/\D/g, '').slice(0, 20))}
                placeholder={fa ? 'شناسه را از داشبورد Meta وارد کنید' : 'Enter the App ID from Meta Developer Dashboard'}
                disabled={metaLoading}
              />
            </div>
          )}

          <div className="ht-meta-permissions">
            <strong>{fa ? 'مجوزهای درخواستی فقط‌خواندنی:' : 'Requested read-only permissions:'}</strong>
            <code>public_profile</code>
            <code>pages_show_list</code>
            <code>pages_read_engagement</code>
            <code>instagram_basic</code>
          </div>

          <p className="ht-meta-readonly">
            {fa
              ? 'انتشار، زمان‌بندی، حذف و پاسخ‌دادن در این مرحله اصلاً پیاده‌سازی نشده و از ابزارهای MCP قابل فراخوانی نیست.'
              : 'Publishing, scheduling, deletion, and replying are not implemented or exposed as MCP tools in this phase.'}
          </p>

          {!metaStatus?.connected && (
            <label className="ht-social-confirm">
              <input type="checkbox" checked={metaConfirmed} onChange={(event) => setMetaConfirmed(event.target.checked)} />
              {fa ? 'تایید می‌کنم حساب را به HezTech متصل کنم و فقط مجوزهای نمایش‌داده‌شده را بدهم.' : 'I confirm I want to connect this account to HezTech and grant only the permissions shown.'}
            </label>
          )}
          <div className="ht-meta-actions">
            {!metaStatus?.connected ? (
              <button
                type="button"
                className="ht-social-btn"
                onClick={handleMetaAuthorization}
                disabled={metaLoading || !metaConfirmed || !/^\d{5,20}$/.test(metaAppId.trim())}
              >
                <Icon name="lock" size={16} />
                {metaLoading
                  ? (fa ? 'در انتظار تکمیل مجوز در پنجرهٔ Meta…' : 'Waiting for Meta authorization…')
                  : (fa ? 'ادامه به ورود و تأیید مجوزهای Meta' : 'Continue to Meta login and consent')}
              </button>
            ) : (
              <>
                <button type="button" className="ht-social-btn" onClick={handleVerifyMetaAccounts} disabled={metaLoading}>
                  {metaLoading ? (fa ? 'در حال بررسی…' : 'Verifying…') : (fa ? 'بررسی فقط‌خواندنی حساب‌ها' : 'Verify accounts (read-only)')}
                </button>
                <label className="ht-social-confirm">
                  <input type="checkbox" checked={metaConfirmed} onChange={(event) => setMetaConfirmed(event.target.checked)} />
                  {fa ? 'تایید می‌کنم دسترسی Meta را قطع کنم.' : 'I confirm that I want to disconnect Meta.'}
                </label>
                <button type="button" className="ht-meta-disconnect" onClick={handleMetaDisconnect} disabled={metaLoading || !metaConfirmed}>
                  {fa ? 'پاک‌کردن نشست محلی' : 'Clear local session'}
                </button>
              </>
            )}
          </div>

          {metaMessage && <p className="ht-meta-message" role="status">{metaMessage}</p>}
          {metaError && <p className="ht-disconnected" role="alert">{metaError}</p>}

          {metaAccounts && (
            <div className="ht-meta-accounts">
              <h3>{fa ? 'حساب Facebook تأییدشده' : 'Verified Facebook account'}</h3>
              <p>{metaAccounts.facebookAccount.name} <code>{metaAccounts.facebookAccount.id}</code></p>
              <h3>{fa ? 'صفحه‌ها و حساب‌های Instagram متصل' : 'Linked Pages and Instagram accounts'}</h3>
              {metaAccounts.pages.length === 0 ? (
                <p>{fa ? 'صفحه‌ای برای این حساب برنگشت.' : 'No Pages were returned for this account.'}</p>
              ) : (
                <ul>
                  {metaAccounts.pages.map((page: any) => (
                    <li key={page.id}>
                      <strong>{page.name || (fa ? 'صفحهٔ بدون نام' : 'Unnamed Page')}</strong>
                      <code>{page.id}</code>
                      {page.instagramAccount && (
                        <span>
                          Instagram: @{page.instagramAccount.username || page.instagramAccount.id}
                          {' '}<code>{page.instagramAccount.id}</code>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {metaAccounts.hasMorePages && (
                <p>{fa ? 'بیش از ۱۰۰ صفحه وجود دارد؛ ادامهٔ صفحه‌بندی عمداً در این مرحله انجام نمی‌شود.' : 'More than 100 Pages exist; pagination is intentionally not followed in Phase 1.'}</p>
              )}
            </div>
          )}
        </div>
        </>
      )}

      {activeTab === 'intelligence' && (
        <div className="ht-social-grid">
          {/* Social Discovery */}
          <div className="ht-social-card">
            <h2 className="ht-social-card__title">
              <Icon name="search" size={18} />
              <span>{fa ? 'کشف ترندها و موضوعات داغ (Social Discovery)' : 'Social Trends Discovery'}</span>
            </h2>
            <p className="ht-social-subtitle">
              {fa ? 'پیمایش الگوهای پربازدید، هشتگ‌ها و ساختار وایرال بر اساس پلتفرم' : 'Explore high-velocity topics, hashtags, and viral formats'}
            </p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <select
                className="ht-social-input"
                style={{ width: '130px' }}
                value={intelPlatform}
                onChange={(e) => setIntelPlatform(e.target.value)}
              >
                <option value="instagram">Instagram</option>
                <option value="youtube">YouTube</option>
                <option value="tiktok">TikTok</option>
                <option value="x">X / Twitter</option>
                <option value="linkedin">LinkedIn</option>
                <option value="telegram">Telegram</option>
              </select>
              <input
                type="text"
                className="ht-social-input"
                placeholder={fa ? 'موضوع یا حوزه (مثلاً هوش مصنوعی)...' : 'Topic or niche (e.g. AI)...'}
                value={intelTopic}
                onChange={(e) => setIntelTopic(e.target.value)}
              />
              <button
                type="button"
                className="ht-social-btn ht-social-btn--primary"
                onClick={handleDiscoverTrends}
                disabled={intelLoading || !intelTopic}
              >
                {intelLoading ? '...' : (fa ? 'جستجو' : 'Search')}
              </button>
            </div>

            {intelTrends && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <strong>{fa ? 'هشتگ‌ها و ترندهای داغ:' : 'Trending Topics:'}</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {intelTrends.trendingTopics?.map((t: any, idx: number) => (
                    <span key={idx} className="ht-badge" style={{ background: 'rgba(0,229,255,0.1)', color: '#00e5ff', padding: '4px 8px' }}>
                      #{t.tag} ({t.volume} · {t.growth})
                    </span>
                  ))}
                </div>
                <strong style={{ marginTop: '8px' }}>{fa ? 'فرمت‌های پربازدید پیشنهادی:' : 'Viral Formats:'}</strong>
                {intelTrends.viralFormats?.map((f: any, idx: number) => (
                  <div key={idx} style={{ background: 'rgba(30,41,59,0.6)', padding: '6px 10px', borderRadius: '4px' }}>
                    <strong>{f.format}</strong> — نرخ نگه‌داشت: {f.retentionAvg} ({f.bestPlatform})
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Competitor & Hook Auditor */}
          <div className="ht-social-card">
            <h2 className="ht-social-card__title">
              <Icon name="zap" size={18} />
              <span>{fa ? 'تحلیل رقبا و ممیزی هوک (Hook Auditor)' : 'Competitor & Hook Intelligence'}</span>
            </h2>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input
                type="text"
                className="ht-social-input"
                placeholder={fa ? 'متن هوک ویدیو جهت امتیازدهی...' : 'Enter 3-sec hook text to audit...'}
                value={hookAuditText}
                onChange={(e) => setHookAuditText(e.target.value)}
              />
              <button
                type="button"
                className="ht-social-btn"
                onClick={handleAuditHook}
                disabled={intelLoading || !hookAuditText}
              >
                {fa ? 'سنجش هوک' : 'Audit'}
              </button>
            </div>

            {hookAuditResult && (
              <div style={{ background: 'rgba(30,41,59,0.7)', padding: '10px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <strong>امتیاز کشش مخاطب: {hookAuditResult.score}/100</strong>
                  <span className={`ht-badge ${hookAuditResult.score >= 80 ? 'ht-badge--success' : ''}`}>{hookAuditResult.rating}</span>
                </div>
                <div>الگوهای شناسایی‌شده: {hookAuditResult.detectedPatterns?.join('، ')}</div>
                <div style={{ color: '#00e5ff', marginTop: '4px' }}>پیشنهاد: {hookAuditResult.suggestions?.[0]}</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input
                type="text"
                className="ht-social-input"
                placeholder={fa ? 'آیدی رقیب در اینستاگرام یا یوتیوب...' : 'Competitor handle/URL...'}
                value={intelCompetitor}
                onChange={(e) => setIntelCompetitor(e.target.value)}
              />
              <button
                type="button"
                className="ht-social-btn"
                onClick={handleAuditCompetitor}
                disabled={intelLoading || !intelCompetitor}
              >
                {fa ? 'تحلیل رقیب' : 'Analyze'}
              </button>
            </div>

            {competitorData && (
              <div style={{ background: 'rgba(30,41,59,0.7)', padding: '10px', borderRadius: '6px', fontSize: '13px' }}>
                <div><strong>ریتم انتشار:</strong> {competitorData.metrics?.estimatedCadence}</div>
                <div><strong>فرمت اصلی:</strong> {competitorData.metrics?.primaryFormat}</div>
                <div><strong>معیار تعامل:</strong> {competitorData.metrics?.avgEngagementBenchmark}</div>
              </div>
            )}
          </div>

          {/* Treg Tool Gateway Integration Card */}
          <div className="ht-social-card" style={{ gridColumn: '1 / -1' }}>
            <h2 className="ht-social-card__title">
              <Icon name="globe" size={18} />
              <span>{fa ? 'کاتالوگ ابزارهای عامل هوشمند Treg (تأمین‌کننده مستقل MCP/REST)' : 'Treg Agent Tool Catalog (Independent Adapter)'}</span>
            </h2>
            <p className="ht-social-subtitle">
              {fa
                ? 'Treg بیش از ۴۱۰۰ ابزار عامل‌ها را در لایه Integration Adapter فراهم می‌کند. توکن فقط در سیستم‌عامل ذخیره شده و در صورت نبود، ابزارهای داخلی فعال خواهند بود.'
                : 'Treg catalog provides 4,100+ tools as an independent adapter. Token is stored securely via DPAPI with automatic fallback to native tools.'}
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <strong>{fa ? 'وضعیت اتصال:' : 'Status:'}</strong>{' '}
                <span className={`ht-badge ${tregStatusInfo?.connected ? 'ht-badge--success' : ''}`}>
                  {tregStatusInfo?.connected ? (fa ? 'متصل' : 'Connected') : (fa ? 'غیرفعال / فال‌بک بومی فعال' : 'Inactive / Native Fallback Active')}
                </span>
              </div>
              {tregStatusInfo?.balanceUsd !== undefined && (
                <div><strong>{fa ? 'موجودی اعتبار:' : 'Balance:'}</strong> ${tregStatusInfo.balanceUsd} USD</div>
              )}
              <div><strong>{fa ? 'آدرس MCP:' : 'MCP Endpoint:'}</strong> <code>https://treg.to/mcp/</code></div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                type="password"
                className="ht-social-input"
                placeholder={fa ? 'کلید دسترسی Treg (اختیاری)...' : 'Treg API Key (optional)...'}
                value={tregKey}
                onChange={(e) => setTregKey(e.target.value)}
              />
              <button
                type="button"
                className="ht-social-btn ht-social-btn--primary"
                onClick={handleConfigureTreg}
                disabled={intelLoading || !tregKey}
              >
                {fa ? 'ذخیره امن کلید' : 'Save Key'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="ht-social-input"
                placeholder={fa ? 'جستجوی ابزار در کاتالوگ Treg (مثلاً social trends, scraper, seo)...' : 'Search Treg catalog tools...'}
                value={tregSearchQuery}
                onChange={(e) => setTregSearchQuery(e.target.value)}
              />
              <button
                type="button"
                className="ht-social-btn"
                onClick={handleSearchTreg}
                disabled={intelLoading || !tregSearchQuery}
              >
                {fa ? 'جستجوی ابزار' : 'Search Tools'}
              </button>
            </div>

            {tregSearchResults.length > 0 && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {tregSearchResults.map((t: any, idx: number) => (
                  <div key={idx} style={{ background: 'rgba(30,41,59,0.7)', padding: '6px 10px', borderRadius: '4px', fontSize: '13px' }}>
                    <strong>{t.name || t.id}</strong>: {t.description || t.job}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
