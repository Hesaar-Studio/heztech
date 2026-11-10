import { useState, type CSSProperties } from 'react';

interface TrimResult {
  outputPath: string;
  durationSec: number;
  sizeBytes: number;
  video?: { codec?: string; width?: number; height?: number } | null;
  audio?: { codec?: string } | null;
}

interface ProbeInfo {
  durationSec: number;
  sizeBytes: number;
  format?: string | null;
  video?: { codec?: string; width?: number; height?: number } | null;
  audio?: { codec?: string } | null;
}

interface HezTechMediaApi {
  pickMediaFile?: () => Promise<{ success?: boolean; filePath?: string; canceled?: boolean }>;
  mediaProbe?: (inputPath: string) => Promise<{ success?: boolean; media?: ProbeInfo; error?: string }>;
  mediaTrim?: (options: { inputPath: string; startSec: number; durationSec: number; name?: string }) => Promise<{ success?: boolean; media?: TrimResult; error?: string }>;
  mediaExtractFrame?: (options: { inputPath: string; atSec: number; name?: string }) => Promise<{ success?: boolean; frame?: { outputPath: string }; error?: string }>;
}

function mediaApi(): HezTechMediaApi {
  const w = window as unknown as { heztech?: HezTechMediaApi; hesatech?: HezTechMediaApi };
  return w.heztech || w.hesatech || {};
}

function toFileUrl(path: string) {
  return `file:///${path.replace(/\\/g, '/').replace(/ /g, '%20')}`;
}

function formatBytes(bytes?: number) {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

export function VideoProcessor() {
  const api = mediaApi();
  const [inputPath, setInputPath] = useState('');
  const [info, setInfo] = useState<ProbeInfo | null>(null);
  const [startSec, setStartSec] = useState('0');
  const [durationSec, setDurationSec] = useState('3');
  const [result, setResult] = useState<TrimResult | null>(null);
  const [framePath, setFramePath] = useState('');
  const [busy, setBusy] = useState<'idle' | 'probe' | 'trim' | 'frame'>('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const pick = async () => {
    setError(''); setMessage('');
    const picked = await api.pickMediaFile?.();
    if (!picked || picked.canceled || !picked.filePath) return;
    setInputPath(picked.filePath);
    setResult(null); setFramePath(''); setInfo(null);
    setBusy('probe');
    try {
      const probed = await api.mediaProbe?.(picked.filePath);
      if (probed?.success && probed.media) setInfo(probed.media);
      else setError(probed?.error || 'خواندن مشخصات ویدئو ناموفق بود.');
    } finally {
      setBusy('idle');
    }
  };

  const trim = async () => {
    if (!inputPath) { setError('اول یک ویدئوی ورودی انتخاب کنید.'); return; }
    setError(''); setMessage(''); setBusy('trim');
    try {
      const res = await api.mediaTrim?.({
        inputPath,
        startSec: Number(startSec) || 0,
        durationSec: Number(durationSec) || 0,
        name: `arta-trim-${Date.now()}`
      });
      if (res?.success && res.media) {
        setResult(res.media);
        setMessage('خروجی MP4 ساخته و با ffprobe تأیید شد.');
      } else {
        setError(res?.error || 'برش ویدئو ناموفق بود.');
      }
    } finally {
      setBusy('idle');
    }
  };

  const frame = async () => {
    if (!inputPath) { setError('اول یک ویدئوی ورودی انتخاب کنید.'); return; }
    setError(''); setBusy('frame');
    try {
      const res = await api.mediaExtractFrame?.({ inputPath, atSec: Number(startSec) || 0, name: `arta-frame-${Date.now()}` });
      if (res?.success && res.frame) setFramePath(res.frame.outputPath);
      else setError(res?.error || 'استخراج فریم ناموفق بود.');
    } finally {
      setBusy('idle');
    }
  };

  const card: CSSProperties = {
    padding: 16,
    borderRadius: 12,
    border: '1px solid rgba(0,229,255,0.25)',
    background: 'rgba(8,15,26,0.75)',
    marginBottom: 18
  };
  const row: CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' };
  const input: CSSProperties = {
    padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(2,6,23,0.8)', color: '#e2e8f0', width: 110
  };

  return (
    <div style={card} dir="rtl">
      <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>پردازش واقعی ویدئو (FFmpeg)</h3>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>
        فایل مبدأ تغییر نمی‌کند؛ خروجی در پوشهٔ media-output برنامه ساخته و با ffprobe تأیید می‌شود.
      </p>

      <div style={row}>
        <button type="button" className="ht-media-btn" onClick={() => { void pick(); }} disabled={busy !== 'idle'}>
          انتخاب ویدئو
        </button>
        <input
          value={inputPath}
          onChange={e => setInputPath(e.target.value)}
          placeholder="مسیر فایل ویدئو (یا انتخاب ویدئو)"
          style={{ ...input, width: 360, direction: 'ltr' }}
          spellCheck={false}
        />
      </div>

      {info && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#cbd5e1' }}>
          مدت: {info.durationSec.toFixed(2)}s · حجم: {formatBytes(info.sizeBytes)} · کدک: {info.video?.codec || '—'} · {info.video?.width || '—'}×{info.video?.height || '—'}
          {info.audio?.codec ? ` · صدا: ${info.audio.codec}` : ' · بدون صدا'}
        </div>
      )}

      <div style={{ ...row, marginTop: 12 }}>
        <label style={{ fontSize: 12, color: '#94a3b8' }}>
          شروع (ثانیه)
          <input style={{ ...input, marginRight: 8 }} value={startSec} onChange={e => setStartSec(e.target.value)} inputMode="decimal" />
        </label>
        <label style={{ fontSize: 12, color: '#94a3b8' }}>
          مدت (ثانیه)
          <input style={{ ...input, marginRight: 8 }} value={durationSec} onChange={e => setDurationSec(e.target.value)} inputMode="decimal" />
        </label>
        <button type="button" className="ht-media-btn ht-media-btn--primary" onClick={() => { void trim(); }} disabled={busy !== 'idle' || !inputPath}>
          {busy === 'trim' ? 'در حال برش…' : 'برش و خروجی MP4'}
        </button>
        <button type="button" className="ht-media-btn" onClick={() => { void frame(); }} disabled={busy !== 'idle' || !inputPath}>
          {busy === 'frame' ? 'در حال استخراج…' : 'استخراج فریم PNG'}
        </button>
      </div>

      {message && <div style={{ marginTop: 10, fontSize: 12, color: '#34d399' }}>✅ {message}</div>}
      {error && <div style={{ marginTop: 10, fontSize: 12, color: '#f87171' }}>⚠️ {error}</div>}

      {result && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#cbd5e1' }}>
          <div style={{ marginBottom: 6 }}>
            خروجی: {result.outputPath} · {result.durationSec.toFixed(2)}s · {result.video?.codec} {result.video?.width}×{result.video?.height} · {formatBytes(result.sizeBytes)}
          </div>
          <video src={toFileUrl(result.outputPath)} controls style={{ width: '100%', maxWidth: 520, borderRadius: 8 }} />
        </div>
      )}

      {framePath && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#cbd5e1' }}>
          فریم: {framePath}
          <div><img src={toFileUrl(framePath)} alt="frame" style={{ maxWidth: 320, borderRadius: 8, marginTop: 6 }} /></div>
        </div>
      )}
    </div>
  );
}
