import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '@/hooks/useLocale';
import { useAdapters } from '@/hooks/useAdapters';
import type { LabelKey } from '@/i18n/labels';
import './ShellPage.css';

interface Item { id?: string; title?: string; name?: string; content?: string; snippet?: string; status?: string; url?: string; }
export function ShellPage({ titleKey }: { titleKey: keyof LabelKey['nav'] }) {
  const { labels, locale, setLocale } = useLocale();
  const fa = locale === 'fa';
  const adapters = useAdapters();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState('');
  const api = window.heztech || window.hesatech;
  const workspace = ['socialSatellite', 'marketing', 'mediaStudio'].includes(titleKey);
  async function load() {
    setBusy(true); setError(''); setLoaded(false);
    try {
      if (titleKey === 'missions') {
        if (!adapters.missions) throw Error(labels.notConnected);
        const res = await adapters.missions.listMissions();
        if (!res.ok) throw Error(res.error);
        setItems(res.data);
      } else if (titleKey === 'connections') {
        if (!adapters.system) throw Error(labels.notConnected);
        const res = await adapters.system.getConnections();
        if (!res.ok) throw Error(res.error);
        setItems(res.data);
      } else if (titleKey === 'knowledge') {
        if (!api?.searchMemory) throw Error(labels.notConnected);
        const res = await api.searchMemory(query, 'all');
        if (!res.success) throw Error(res.error || labels.unavailable);
        setItems(res.knowledge || []);
      } else if (titleKey === 'webResearch') {
        if (!api?.searchWeb) throw Error(labels.notConnected);
        const res = await api.searchWeb(query, 5);
        if (res.success === false) throw Error(res.error || labels.unavailable);
        const result = res.result || res;
        setItems(result.results || []);
      } else if (titleKey === 'settings') {
        if (!adapters.chat) throw Error(labels.notConnected);
        const res = await adapters.chat.listModels();
        if (!res.ok) throw Error(res.error);
        setItems(res.data.map(m => ({ id: m.id, name: m.name, status: m.verified ? (fa ? 'تأییدشده' : 'Verified') : (fa ? 'نیاز به آزمون اتصال' : 'Connection not verified') })));
      }
      setLoaded(true);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { setItems([]); setLoaded(false); setError(''); setQuery(''); }, [titleKey]);
  const purpose: Record<string, [string, string]> = {
    socialSatellite: ['پژوهش محتوا و آماده‌سازی پیش‌نویس برای شبکه‌های اجتماعی؛ انتشار خودکار فعال نیست.', 'Research social content and prepare drafts. Automatic publishing is not configured.'],
    marketing: ['هدف، مخاطب و محدودیت‌ها را بنویسید تا با اَرتا (ARTA)، برنامهٔ بازاریابی بسازید.', 'Describe your goal, audience and constraints to prepare a marketing plan with ARTA.'],
    mediaStudio: ['سناریو، استوری‌بورد و برنامهٔ تولید بسازید. رندر ویدئو یا تولید تصویر در این نسخه متصل نیست.', 'Prepare scripts, storyboards and production plans. Video rendering and image generation are not connected.'],
  };
  return <div className="ht-page">
    <header className="ht-page__header"><h1>{labels.nav[titleKey]}</h1><p className="ht-page__lead">{workspace ? purpose[titleKey][fa ? 0 : 1] : (fa ? 'اطلاعات واقعی از هستهٔ هستک (HezTech)؛ برای دریافت، دکمهٔ زیر را بزنید.' : 'Real information from HezTech. Use the action below to load it.')}</p></header>
    {titleKey === 'settings' && <form className="ht-workspace-panel" onSubmit={async e => {e.preventDefault();setBusy(true);setError('');setSaved('');try {const res=await api.saveConfig({geminiApiKey:apiKey});if(!res.success)throw Error(res.message||res.error);setApiKey('');setSaved(fa?'کلید با رمزگذاری ویندوز ذخیره شد.':'Key saved using Windows encryption.');}catch(e){setError(String(e));}finally{setBusy(false);}}}>
      <label>{fa?'کلید Gemini برای صدای زنده و تولید صوت':'Gemini key for live voice and speech'}<input type="password" autoComplete="off" value={apiKey} onChange={e=>setApiKey(e.target.value)} /></label>
      <button type="submit" className="ht-workspace-action" disabled={!apiKey.trim()||busy}>{fa?'ذخیرهٔ امن کلید':'Save key securely'}</button>{saved&&<p role="status">{saved}</p>}
    </form>}
    {titleKey === 'settings' && <div className="ht-workspace-panel"><label>{fa ? 'زبان رابط' : 'Interface language'} <select value={locale} onChange={e => setLocale(e.target.value as 'fa' | 'en')}><option value="fa">فارسی</option><option value="en">English</option></select></label><p>{fa ? 'کلیدها از تنظیمات موجود خوانده می‌شوند و در این صفحه نمایش داده نمی‌شوند.' : 'Credentials use existing configuration and are never displayed here.'}</p></div>}
    {(workspace || titleKey === 'knowledge' || titleKey === 'webResearch') && <label className="ht-workspace-panel">{fa ? 'موضوع یا درخواست شما' : 'Your topic or request'}<textarea aria-label={fa ? 'موضوع' : 'Topic'} rows={4} value={query} onChange={e => setQuery(e.target.value)} placeholder={fa ? 'با جزئیات بنویسید…' : 'Add details…'} /></label>}
    <button className="ht-workspace-action" disabled={busy || ((workspace || titleKey === 'knowledge' || titleKey === 'webResearch') && !query.trim())} onClick={() => workspace ? navigate('/assistant', { state: { draft: `${labels.nav[titleKey]}: ${query}` } }) : void load()}>{busy ? labels.common.loading : workspace ? (fa ? 'ادامه با اَرتا (ARTA)' : 'Continue with ARTA') : (fa ? 'دریافت اطلاعات' : 'Load information')}</button>
    {error && <p className="ht-disconnected" role="alert">{error}</p>}
    {loaded && !items.length && <div className="ht-empty-state">{fa ? 'موردی پیدا نشد.' : 'No results found.'}</div>}
    <div className="ht-workspace-results">{items.map((item, i) => <article className="ht-workspace-panel" key={item.id || i}>
      <h2>{item.title || item.name || item.id || (fa ? 'نتیجه' : 'Result')}</h2>{item.status && <span className="ht-badge">{item.status}</span>}<p>{item.snippet || item.content}</p>
      {item.url && /^https?:\/\//i.test(item.url) && <button className="ht-workspace-action" onClick={() => api?.openExternal(item.url)}>{fa ? 'باز کردن منبع' : 'Open source'}</button>}
      {titleKey === 'settings' && item.id && <button disabled={busy} className="ht-workspace-action" onClick={async () => { setBusy(true); setError(''); try { const result = await api.testModelConnection(item.id); if (!result.success) throw Error(result.error || labels.unavailable); setItems(list => list.map(m => m.id === item.id ? { ...m, status: fa ? 'اتصال تأیید شد' : 'Connection verified' } : m)); } catch (e) {setError(String(e));} finally {setBusy(false);} }}>{fa ? 'آزمون اتصال' : 'Test connection'}</button>}
    </article>)}</div>
  </div>;
}
