import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useLocale } from '@/hooks/useLocale';
import './MediaStudioPage.css';

interface ProbeInfo {
  path: string;
  name?: string;
  durationSec: number;
  sizeBytes: number;
  format?: string | null;
  video?: {
    codec?: string;
    width?: number;
    height?: number;
    aspectRatio?: string | null;
    fps?: number;
    bitrate?: number;
  } | null;
  audio?: {
    codec?: string;
    channels?: number;
    sampleRate?: number;
    bitrate?: number;
  } | null;
}

interface SubtitleItem {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
}

interface CapCutDraft {
  name: string;
  durationSec?: number;
  tracksCount?: number;
  updatedAt?: string;
}

function toFileUrl(filepath: string) {
  return `file:///${filepath.replace(/\\/g, '/').replace(/ /g, '%20')}`;
}

function formatSec(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
}

function formatBytes(bytes?: number) {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

export function MediaStudioPage() {
  const { locale } = useLocale();
  const fa = locale === 'fa';
  const api = window.heztech || window.hesatech;

  // Active Media File State
  const [inputPath, setInputPath] = useState<string>('');
  const [mediaInfo, setMediaInfo] = useState<ProbeInfo | null>(null);
  const [extractedFrame, setExtractedFrame] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<number>(0);

  // Tab State: 'editor' | 'smart_ops' | 'capcut_sync' | 'projects'
  const [activeTab, setActiveTab] = useState<'editor' | 'smart_ops' | 'capcut_sync' | 'projects'>('editor');

  // Timeline / Cut Controls
  const [startSec, setStartSec] = useState<number>(0);
  const [durationSec, setDurationSec] = useState<number>(5);

  // Silence Removal Controls
  const [noiseThreshold, setNoiseThreshold] = useState<number>(-30);
  const [minSilenceDuration, setMinSilenceDuration] = useState<number>(0.5);
  const [silenceResult, setSilenceResult] = useState<any | null>(null);

  // Persian Subtitles Controls
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([
    { id: 'sub_1', startSec: 0.5, endSec: 3.5, text: 'استودیوی رسانه هزتک — موتور تدوین یکپارچه' }
  ]);
  const [newSubText, setNewSubText] = useState<string>('');
  const [newSubStart, setNewSubStart] = useState<number>(0);
  const [newSubEnd, setNewSubEnd] = useState<number>(3);

  // CapCut State
  const [capcutDrafts, setCapcutDrafts] = useState<CapCutDraft[]>([]);
  const [capcutStatus, setCapcutStatus] = useState<any | null>(null);

  // Projects State
  const [savedProjects, setSavedProjects] = useState<any[]>([]);

  // Execution & UI Feedback
  const [busyOp, setBusyOp] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lastExportedPath, setLastExportedPath] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);

  // Load initial environment data
  const refreshCapcutAndProjects = async () => {
    try {
      if (api?.capcutGetStatus) {
        const s = await api.capcutGetStatus();
        setCapcutStatus(s);
      }
      if (api?.capcutListDrafts) {
        const d = await api.capcutListDrafts();
        if (d?.success && Array.isArray(d.drafts)) setCapcutDrafts(d.drafts);
      }
      if (api?.mediaProjectList) {
        const p = await api.mediaProjectList();
        if (p?.success && Array.isArray(p.projects)) setSavedProjects(p.projects);
      }
    } catch (err: any) {
      console.warn('Refresh error:', err?.message);
    }
  };

  useEffect(() => {
    refreshCapcutAndProjects();
  }, []);

  // 1. Pick and Probe Media File
  const handlePickMedia = async () => {
    setErrorMessage('');
    setStatusMessage('');
    try {
      const picked = await api?.pickMediaFile?.();
      if (!picked || picked.canceled || !picked.filePath) return;

      const path = picked.filePath;
      setInputPath(path);
      setBusyOp('probe');
      setStatusMessage(fa ? 'در حال تحلیل مشخصات فایل ویدیو...' : 'Probing video properties...');

      const probe = await api?.mediaProbe?.(path);
      if (probe?.success && probe.media) {
        setMediaInfo(probe.media);
        setDurationSec(Math.min(10, Math.floor(probe.media.durationSec || 5)));
        setStatusMessage(fa ? 'مشخصات فایل با موفقیت دریافت شد.' : 'Video probed successfully.');
      } else {
        throw new Error(probe?.error || 'خطا در خواندن مشخصات ویدیو');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطا در بارگذاری فایل');
    } finally {
      setBusyOp('');
    }
  };

  // 2. Extract Frame at Current Time
  const handleExtractFrame = async () => {
    if (!inputPath) {
      setErrorMessage(fa ? 'ابتدا یک فایل ویدیو انتخاب کنید.' : 'Select a video first.');
      return;
    }
    setErrorMessage('');
    setBusyOp('frame');
    try {
      const at = videoRef.current?.currentTime || currentTime || 0;
      const res = await api?.mediaExtractFrame?.({
        inputPath,
        atSec: at,
        name: `heztech-frame-${Date.now()}`
      });
      if (res?.success && res.frame) {
        setExtractedFrame(res.frame.outputPath);
        setStatusMessage(fa ? `فریم ثانیه ${at.toFixed(1)} با موفقیت استخراج شد.` : `Frame extracted at ${at.toFixed(1)}s.`);
      } else {
        throw new Error(res?.error || 'استخراج فریم ناموفق بود.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطا در استخراج فریم');
    } finally {
      setBusyOp('');
    }
  };

  // 3. Trim / Cut
  const handleTrim = async () => {
    if (!inputPath) return;
    setErrorMessage('');
    setBusyOp('trim');
    setStatusMessage(fa ? 'در حال برش و استخراج بخش مشخص‌شده از ویدیو...' : 'Trimming video segment...');
    try {
      const res = await api?.mediaTrim?.({
        inputPath,
        startSec,
        durationSec,
        name: `heztech-cut-${Date.now()}`
      });
      if (res?.success && res.media) {
        setLastExportedPath(res.media.outputPath);
        setStatusMessage(fa ? `برش انجام شد: ${res.media.outputPath} (${formatBytes(res.media.sizeBytes)})` : `Trim complete: ${res.media.outputPath}`);
      } else {
        throw new Error(res?.error || 'برش ویدیو ناموفق بود.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطا در برش ویدیو');
    } finally {
      setBusyOp('');
    }
  };

  // 4. Automated Silence Removal
  const handleRemoveSilence = async () => {
    if (!inputPath) return;
    setErrorMessage('');
    setBusyOp('silence');
    setStatusMessage(fa ? 'در حال اسکن فرکانس‌های صوتی و حذف خودکار سکوت‌ها...' : 'Scanning audio frequencies and removing silence...');
    try {
      const res = await api?.mediaRemoveSilence?.({
        inputPath,
        noiseThresholdDb: noiseThreshold,
        minSilenceDurationSec: minSilenceDuration,
        name: `heztech-nosilence-${Date.now()}`
      });
      if (res?.success && res.result) {
        setSilenceResult(res.result);
        setLastExportedPath(res.result.outputPath);
        setStatusMessage(fa ? `حذف سکوت پایان یافت: ${res.result.silencesRemoved} وقفه حذف شد و ${res.result.savedTimeSec.toFixed(1)} ثانیه زمان ذخیره گردید.` : `Silence removed: ${res.result.silencesRemoved} gaps removed, saved ${res.result.savedTimeSec.toFixed(1)}s.`);
      } else {
        throw new Error(res?.error || 'حذف سکوت ناموفق بود.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطا در پردازش سکوت');
    } finally {
      setBusyOp('');
    }
  };

  // 5. Add / Burn Persian Subtitles
  const handleAddSubtitleItem = (e: FormEvent) => {
    e.preventDefault();
    if (!newSubText.trim()) return;
    const newItem: SubtitleItem = {
      id: `sub_${Date.now()}`,
      startSec: Number(newSubStart) || 0,
      endSec: Number(newSubEnd) || 3,
      text: newSubText.trim()
    };
    setSubtitles([...subtitles, newItem]);
    setNewSubText('');
    setNewSubStart(Number(newSubEnd) || 0);
    setNewSubEnd((Number(newSubEnd) || 0) + 3);
  };

  const handleBurnSubtitles = async () => {
    if (!inputPath || subtitles.length === 0) return;
    setErrorMessage('');
    setBusyOp('subtitles');
    setStatusMessage(fa ? 'در حال الصاق زیرنویس فارسی با موتور FriBidi/HarfBuzz...' : 'Burning Persian RTL subtitles...');
    try {
      const res = await api?.mediaAddSubtitles?.({
        inputPath,
        subtitles,
        fontName: 'Arial',
        fontSize: 24,
        name: `heztech-persian-sub-${Date.now()}`
      });
      if (res?.success && res.result) {
        setLastExportedPath(res.result.outputPath);
        setStatusMessage(fa ? `زیرنویس با موفقیت به ویدیو پیوند خورد: ${res.result.outputPath}` : `Subtitles burned successfully: ${res.result.outputPath}`);
      } else {
        throw new Error(res?.error || 'الصاق زیرنویس ناموفق بود.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطا در الصاق زیرنویس');
    } finally {
      setBusyOp('');
    }
  };

  // 6. Aspect Ratio Transformation
  const handleChangeAspect = async (targetRatio: '16:9' | '9:16', mode: 'pad' | 'crop') => {
    if (!inputPath) return;
    setErrorMessage('');
    setBusyOp('aspect');
    setStatusMessage(fa ? `در حال تبدیل به نسبت تصویر ${targetRatio} (${mode === 'pad' ? 'پس‌زمینه محو' : 'برش'}) ...` : `Converting to aspect ratio ${targetRatio}...`);
    try {
      const res = await api?.mediaChangeAspect?.({
        inputPath,
        targetRatio,
        mode,
        name: `heztech-aspect-${targetRatio.replace(':', 'x')}-${Date.now()}`
      });
      if (res?.success && res.result) {
        setLastExportedPath(res.result.outputPath);
        setStatusMessage(fa ? `تبدیل ابعاد با موفقیت انجام شد: ${res.result.width}x${res.result.height}` : `Aspect ratio updated: ${res.result.width}x${res.result.height}`);
      } else {
        throw new Error(res?.error || 'تغییر نسبت تصویر ناموفق بود.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطا در تغییر نسبت تصویر');
    } finally {
      setBusyOp('');
    }
  };

  // 7. Enhance Audio
  const handleEnhanceAudio = async () => {
    if (!inputPath) return;
    setErrorMessage('');
    setBusyOp('audio');
    setStatusMessage(fa ? 'در حال شفاف‌سازی صدا و نرمال‌سازی استانداردهای EBU R128...' : 'Enhancing voice and normalizing audio levels...');
    try {
      const res = await api?.mediaEnhanceAudio?.({
        inputPath,
        normalize: true,
        name: `heztech-enhanced-voice-${Date.now()}`
      });
      if (res?.success && res.result) {
        setLastExportedPath(res.result.outputPath);
        setStatusMessage(fa ? `کیفیت صدای گوینده ارتقا یافت: ${res.result.outputPath}` : `Audio enhancement complete: ${res.result.outputPath}`);
      } else {
        throw new Error(res?.error || 'بهبود صدا ناموفق بود.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطا در پردازش صدا');
    } finally {
      setBusyOp('');
    }
  };

  // 8. Export to CapCut Draft
  const handleExportToCapcut = async () => {
    if (!inputPath) return;
    setErrorMessage('');
    setBusyOp('capcut_export');
    setStatusMessage(fa ? 'در حال ساخت فایل‌های پیش‌نویس رسمی CapCut...' : 'Exporting project to CapCut Desktop draft...');
    try {
      const res = await api?.mediaExportCapCut?.({
        projectName: `HezTech_${Date.now()}`,
        videoPath: inputPath,
        subtitles,
        durationSec: mediaInfo?.durationSec || 10
      });
      if (res?.success && res.result) {
        setStatusMessage(fa ? `پروژه CapCut با موفقیت ایجاد شد: ${res.result.projectDir}` : `CapCut draft created at ${res.result.projectDir}`);
        refreshCapcutAndProjects();
      } else {
        throw new Error(res?.error || 'صادرات به CapCut ناموفق بود.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطا در صادرات به کپ‌کات');
    } finally {
      setBusyOp('');
    }
  };

  // Export with Professional Presets
  const handleExportPreset = async (preset: string) => {
    if (!inputPath) return;
    setErrorMessage('');
    setBusyOp('preset_' + preset);
    setStatusMessage(fa ? `در حال تهیه خروجی استاندارد (${preset})...` : `Exporting with preset ${preset}...`);
    try {
      const res = await api?.mediaExportPreset?.({
        inputPath,
        preset,
        name: `heztech-${preset}-${Date.now()}`
      });
      if (res?.success && res.result) {
        setLastExportedPath(res.result.outputPath);
        setStatusMessage(fa ? `خروجی پریست آماده شد: ${res.result.outputPath} (${formatBytes(res.result.sizeBytes)})` : `Preset export completed: ${res.result.outputPath}`);
      } else {
        throw new Error(res?.error || 'خروجی پریست ناموفق بود.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطا در خروجی ویدیو');
    } finally {
      setBusyOp('');
    }
  };

  // 9. Save Current Project
  const handleSaveProject = async () => {
    if (!inputPath) return;
    setErrorMessage('');
    try {
      const res = await api?.mediaProjectSave?.({
        id: `proj_${Date.now()}`,
        title: mediaInfo?.name || `پروژه تدوین ${new Date().toLocaleDateString('fa-IR')}`,
        inputPath,
        durationSec: mediaInfo?.durationSec || 0,
        subtitles,
        startSec,
        clipDurationSec: durationSec
      });
      if (res?.success) {
        setStatusMessage(fa ? 'پروژه با موفقیت در والت ذخیره شد.' : 'Project saved to vault.');
        refreshCapcutAndProjects();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطا در ذخیره پروژه');
    }
  };

  return (
    <div className="ht-media-studio">
      {/* Header */}
      <div className="ht-media-header">
        <div className="ht-media-title-group">
          <h1>
            <Icon name="video" size={24} />
            <span>{fa ? 'استودیوی رسانه هزتک (HezTech Media Studio)' : 'HezTech Media Studio'}</span>
          </h1>
          <p>
            {fa
              ? 'موتور تدوین واقعی و یکپارچه محلی — مبتنی بر خط لوله مهندسی‌معکوس Concat و همگام‌ساز CapCut Desktop'
              : 'Unified local media editing engine powered by Concat & CapCut Bridge'}
          </p>
        </div>

        <div className="ht-media-header-actions">
          <button
            type="button"
            className="ht-media-btn ht-media-btn--primary"
            onClick={handlePickMedia}
            disabled={!!busyOp}
          >
            <Icon name="upload" size={16} />
            <span>{fa ? 'انتخاب و بارگذاری ویدیو' : 'Open Video File'}</span>
          </button>

          {inputPath && (
            <button
              type="button"
              className="ht-media-btn"
              onClick={handleSaveProject}
            >
              <Icon name="check" size={16} />
              <span>{fa ? 'ذخیره پروژه' : 'Save Project'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Notification / Feedback Bar */}
      {statusMessage && (
        <div className="ht-media-card" style={{ borderColor: '#00e5ff', background: 'rgba(0, 229, 255, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#00e5ff', fontSize: '13px' }}>
            <Icon name="check" size={16} />
            <span>{statusMessage}</span>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="ht-media-card" style={{ borderColor: '#ef4444', background: 'rgba(239, 68, 68, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontSize: '13px' }}>
            <Icon name="alert" size={16} />
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* Top Engine Status Cards */}
      <div className="ht-media-status-grid">
        <div className="ht-media-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>موتور پردازش محلی (FFmpeg / Concat)</span>
            <span className="ht-media-status-badge ht-media-status-badge--connected">فعال و آماده</span>
          </div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>رندر سخت‌افزاری H.264 / AAC</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>پشتیبانی از HarfBuzz RTL و EBU R128</div>
        </div>

        <div className="ht-media-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>پل ارتباطی CapCut Desktop</span>
            <span className={`ht-media-status-badge ${capcutStatus?.bridgeConnected ? 'ht-media-status-badge--connected' : 'ht-media-status-badge--neutral'}`}>
              {capcutStatus?.capcutRunning ? 'CapCut در حال اجرا' : 'آماده همگام‌سازی پیش‌نویس'}
            </span>
          </div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>پروژه‌های شناسایی‌شده: {capcutDrafts.length}</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>صادرات دوطرفه با draft_content.json</div>
        </div>

        <div className="ht-media-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>پروژه فعال</span>
            <span className="ht-media-status-badge ht-media-status-badge--neutral">{mediaInfo ? 'فایل بارگذاری‌شده' : 'انتخاب نشده'}</span>
          </div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {mediaInfo?.name || '—'}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {mediaInfo ? `${formatSec(mediaInfo.durationSec)} | ${mediaInfo.video?.width}x${mediaInfo.video?.height} (${mediaInfo.video?.fps} fps)` : 'فایل ورودی را انتخاب کنید'}
          </div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="ht-media-tabs">
        <button
          type="button"
          className={`ht-media-tab-btn ${activeTab === 'editor' ? 'ht-media-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('editor')}
        >
          <Icon name="video" size={16} />
          <span>{fa ? 'تایم‌لاین و برش ویدیو' : 'Timeline & Cuts'}</span>
        </button>

        <button
          type="button"
          className={`ht-media-tab-btn ${activeTab === 'smart_ops' ? 'ht-media-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('smart_ops')}
        >
          <Icon name="sparkles" size={16} />
          <span>{fa ? 'حذف سکوت و زیرنویس فارسی' : 'Silence & Subtitles'}</span>
        </button>

        <button
          type="button"
          className={`ht-media-tab-btn ${activeTab === 'capcut_sync' ? 'ht-media-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('capcut_sync')}
        >
          <Icon name="layers" size={16} />
          <span>{fa ? 'پیش‌نویس‌های CapCut Desktop' : 'CapCut Drafts'}</span>
        </button>

        <button
          type="button"
          className={`ht-media-tab-btn ${activeTab === 'projects' ? 'ht-media-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('projects')}
        >
          <Icon name="clock" size={16} />
          <span>{fa ? 'آرشیو پروژه‌های والت' : 'Saved Projects'}</span>
        </button>
      </div>

      {/* TAB 1: Real Timeline & Cut */}
      {activeTab === 'editor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Video Player & Frame Preview */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.2fr) minmax(280px, 0.8fr)', gap: '20px' }}>
            <div className="ht-media-card" style={{ padding: '16px', alignItems: 'center' }}>
              {inputPath ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <video
                    ref={videoRef}
                    controls
                    src={toFileUrl(inputPath)}
                    style={{ width: '100%', maxHeight: '360px', borderRadius: '8px', background: '#000' }}
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#94a3b8' }}>
                    <span>زمان جاری: {formatSec(currentTime)}</span>
                    <span>طول کل: {mediaInfo ? formatSec(mediaInfo.durationSec) : '00:00'}</span>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                  <Icon name="video" size={48} />
                  <p style={{ marginTop: '12px', fontSize: '14px' }}>برای مشاهده و ادیت، یک فایل ویدیویی انتخاب کنید.</p>
                </div>
              )}
            </div>

            {/* Frame Snap & Technical Metadata */}
            <div className="ht-media-card" style={{ gap: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', color: '#00e5ff' }}>مشخصات فنی و استخراج فریم</h3>
              {mediaInfo ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                  <div><strong>نام فایل:</strong> {mediaInfo.name}</div>
                  <div><strong>حجم:</strong> {formatBytes(mediaInfo.sizeBytes)}</div>
                  <div><strong>رزولوشن:</strong> {mediaInfo.video?.width}x{mediaInfo.video?.height} ({mediaInfo.video?.aspectRatio})</div>
                  <div><strong>کدک ویدیو:</strong> {mediaInfo.video?.codec} | {mediaInfo.video?.fps} FPS</div>
                  <div><strong>صدای استریو:</strong> {mediaInfo.audio?.codec} ({mediaInfo.audio?.channels} کانال)</div>
                </div>
              ) : (
                <p style={{ fontSize: '13px', color: '#64748b' }}>فایلی بارگذاری نشده است.</p>
              )}

              <div style={{ marginTop: 'auto', display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="ht-media-btn"
                  onClick={handleExtractFrame}
                  disabled={!inputPath || busyOp === 'frame'}
                >
                  <Icon name="camera" size={16} />
                  <span>{busyOp === 'frame' ? 'در حال ثبت...' : 'ثبت فریم جاری'}</span>
                </button>
              </div>

              {extractedFrame && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>آخرین فریم استخراج‌شده:</div>
                  <img src={toFileUrl(extractedFrame)} alt="Extracted Frame" style={{ width: '100%', maxHeight: '120px', objectFit: 'cover', borderRadius: '6px', border: '1px solid rgba(0,229,255,0.2)' }} />
                </div>
              )}
            </div>
          </div>

          {/* Timeline Visualizer & Cut Sliders */}
          <div className="ht-media-card">
            <h3 style={{ margin: 0, fontSize: '15px', color: '#00e5ff' }}>تایم‌لاین چندلایه و برش فریم‌به‌فریم</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>نقطه شروع (ثانیه):</label>
                <input
                  type="number"
                  min="0"
                  max={mediaInfo?.durationSec || 100}
                  step="0.5"
                  value={startSec}
                  onChange={(e) => setStartSec(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px', background: 'rgba(30,41,59,0.8)', border: '1px solid #334155', borderRadius: '6px', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>طول برش (ثانیه):</label>
                <input
                  type="number"
                  min="0.5"
                  max={mediaInfo ? mediaInfo.durationSec - startSec : 100}
                  step="0.5"
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px', background: 'rgba(30,41,59,0.8)', border: '1px solid #334155', borderRadius: '6px', color: '#fff' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  type="button"
                  className="ht-media-btn ht-media-btn--primary"
                  onClick={handleTrim}
                  disabled={!inputPath || busyOp === 'trim'}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <Icon name="scissors" size={16} />
                  <span>{busyOp === 'trim' ? 'در حال رندر برش...' : 'برش و ایجاد کلیپ MP4'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Smart Ops (Silence Removal & Persian RTL Subtitles) */}
      {activeTab === 'smart_ops' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
          {/* Silence Removal Card */}
          <div className="ht-media-card">
            <h3 style={{ margin: 0, fontSize: '15px', color: '#00e5ff' }}>
              <Icon name="sparkles" size={18} />
              <span>حذف خودکار مکث‌ها و سکوت (Silence Remover)</span>
            </h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '6px 0 12px 0' }}>
              تشخیص وقفه‌های صوتی و مکث‌های ناخواسته گوینده با دقت میکروثانیه و تولید ویدیوی روان.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>آستانه تشخیص نویز (دسی‌بل): {noiseThreshold} dB</label>
                <input
                  type="range"
                  min="-50"
                  max="-15"
                  value={noiseThreshold}
                  onChange={(e) => setNoiseThreshold(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>حداقل طول سکوت (ثانیه): {minSilenceDuration}s</label>
                <input
                  type="range"
                  min="0.2"
                  max="2.0"
                  step="0.1"
                  value={minSilenceDuration}
                  onChange={(e) => setMinSilenceDuration(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              <button
                type="button"
                className="ht-media-btn ht-media-btn--primary"
                onClick={handleRemoveSilence}
                disabled={!inputPath || busyOp === 'silence'}
              >
                <Icon name="scissors" size={16} />
                <span>{busyOp === 'silence' ? 'در حال حذف سکوت‌ها...' : 'اجرای حذف خودکار سکوت'}</span>
              </button>

              {silenceResult && (
                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '10px', borderRadius: '6px', fontSize: '12px' }}>
                  <div><strong>وقفه‌های حذف‌شده:</strong> {silenceResult.silencesRemoved}</div>
                  <div><strong>زمان صرفه‌جویی‌شده:</strong> {silenceResult.savedTimeSec.toFixed(1)} ثانیه</div>
                  <div><strong>طول ویدیوی جدید:</strong> {formatSec(silenceResult.durationSec)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Persian Subtitle Card */}
          <div className="ht-media-card">
            <h3 style={{ margin: 0, fontSize: '15px', color: '#00e5ff' }}>
              <Icon name="edit" size={18} />
              <span>تولید و الصاق زیرنویس فارسی (HarfBuzz RTL)</span>
            </h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '6px 0 12px 0' }}>
              رندر مستقیم متن فارسی بدون جداشدن حروف یا وارونگی کلمات، الصاق دائم به ویدیوی خروجی.
            </p>

            <form onSubmit={handleAddSubtitleItem} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="text"
                placeholder="متن خط زیرنویس فارسی..."
                value={newSubText}
                onChange={(e) => setNewSubText(e.target.value)}
                style={{ width: '100%', padding: '8px', background: 'rgba(30,41,59,0.8)', border: '1px solid #334155', borderRadius: '6px', color: '#fff', textAlign: 'right' }}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input
                  type="number"
                  step="0.5"
                  placeholder="شروع (ثانیه)"
                  value={newSubStart}
                  onChange={(e) => setNewSubStart(Number(e.target.value))}
                  style={{ padding: '6px', background: 'rgba(30,41,59,0.8)', border: '1px solid #334155', borderRadius: '6px', color: '#fff' }}
                />
                <input
                  type="number"
                  step="0.5"
                  placeholder="پایان (ثانیه)"
                  value={newSubEnd}
                  onChange={(e) => setNewSubEnd(Number(e.target.value))}
                  style={{ padding: '6px', background: 'rgba(30,41,59,0.8)', border: '1px solid #334155', borderRadius: '6px', color: '#fff' }}
                />
              </div>

              <button type="submit" className="ht-media-btn" style={{ justifyContent: 'center' }}>
                <Icon name="check" size={14} />
                <span>افزودن به خطوط زیرنویس</span>
              </button>
            </form>

            <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
              {subtitles.map((sub) => (
                <div key={sub.id} style={{ background: 'rgba(30,41,59,0.7)', padding: '6px 10px', borderRadius: '4px', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#00e5ff' }}>[{sub.startSec}s - {sub.endSec}s]</span>
                  <span style={{ textAlign: 'right', flex: 1, marginRight: '10px' }}>{sub.text}</span>
                  <button type="button" onClick={() => setSubtitles(subtitles.filter(s => s.id !== sub.id))} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>×</button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="ht-media-btn ht-media-btn--primary"
              onClick={handleBurnSubtitles}
              disabled={!inputPath || subtitles.length === 0 || busyOp === 'subtitles'}
              style={{ marginTop: '10px', justifyContent: 'center' }}
            >
              <Icon name="sparkles" size={16} />
              <span>{busyOp === 'subtitles' ? 'در حال رندر زیرنویس...' : 'رندر و سوختن زیرنویس روی ویدیو'}</span>
            </button>
          </div>

          {/* Quick Format & Audio Enhancements */}
          <div className="ht-media-card" style={{ gridColumn: '1 / -1' }}>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#00e5ff' }}>ابزارهای تکمیلی (نسبت تصویر و شفاف‌سازی صدا)</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '12px' }}>
              <button
                type="button"
                className="ht-media-btn"
                onClick={() => handleChangeAspect('9:16', 'pad')}
                disabled={!inputPath || busyOp === 'aspect'}
              >
                <Icon name="smartphone" size={16} />
                <span>تبدیل به عمودی ۹:۱۶ (Instagram Reels / Shorts)</span>
              </button>

              <button
                type="button"
                className="ht-media-btn"
                onClick={() => handleChangeAspect('16:9', 'pad')}
                disabled={!inputPath || busyOp === 'aspect'}
              >
                <Icon name="monitor" size={16} />
                <span>تبدیل به افقی ۱۶:۹ (YouTube Landscape)</span>
              </button>

              <button
                type="button"
                className="ht-media-btn"
                onClick={handleEnhanceAudio}
                disabled={!inputPath || busyOp === 'audio'}
              >
                <Icon name="volume" size={16} />
                <span>بهبود صدا و نرمال‌سازی EBU R128</span>
              </button>

              <button
                type="button"
                className="ht-media-btn ht-media-btn--primary"
                onClick={handleExportToCapcut}
                disabled={!inputPath || busyOp === 'capcut_export'}
              >
                <Icon name="external" size={16} />
                <span>صادرات پروژه به CapCut Desktop</span>
              </button>
            </div>

            <h4 style={{ margin: '16px 0 8px 0', fontSize: '13px', color: '#94a3b8' }}>پریست‌های خروجی استاندارد:</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <button
                type="button"
                className="ht-media-btn"
                onClick={() => handleExportPreset('instagram_reel')}
                disabled={!inputPath || busyOp.startsWith('preset_')}
              >
                <Icon name="video" size={14} />
                <span>خروجی Instagram Reels (۱۰۸۰×۱۹۲۰)</span>
              </button>
              <button
                type="button"
                className="ht-media-btn"
                onClick={() => handleExportPreset('youtube_16_9')}
                disabled={!inputPath || busyOp.startsWith('preset_')}
              >
                <Icon name="monitor" size={14} />
                <span>خروجی YouTube افقی (۱۹۲۰×۱۰۸۰)</span>
              </button>
              <button
                type="button"
                className="ht-media-btn"
                onClick={() => handleExportPreset('youtube_shorts')}
                disabled={!inputPath || busyOp.startsWith('preset_')}
              >
                <Icon name="smartphone" size={14} />
                <span>خروجی YouTube Shorts (۱۰۸۰×۱۹۲۰)</span>
              </button>
              <button
                type="button"
                className="ht-media-btn"
                onClick={() => handleExportPreset('web_optimized')}
                disabled={!inputPath || busyOp.startsWith('preset_')}
              >
                <Icon name="globe" size={14} />
                <span>خروجی وب بهینه‌شده (Web FastStart)</span>
              </button>
              <button
                type="button"
                className="ht-media-btn"
                onClick={() => handleExportPreset('high_quality')}
                disabled={!inputPath || busyOp.startsWith('preset_')}
              >
                <Icon name="sparkles" size={14} />
                <span>مسترینگ با بالاترین کیفیت (CRF 18)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CapCut Drafts Sync */}
      {activeTab === 'capcut_sync' && (
        <div className="ht-media-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#00e5ff' }}>پروژه‌های شناسایی‌شده روی نرم‌افزار CapCut Desktop</h3>
            <button type="button" className="ht-media-btn" onClick={refreshCapcutAndProjects}>
              <Icon name="refresh" size={14} />
              <span>به‌روزرسانی فهرست</span>
            </button>
          </div>

          {capcutDrafts.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
              {capcutDrafts.map((draft) => (
                <div key={draft.name} style={{ background: 'rgba(30,41,59,0.7)', border: '1px solid #334155', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>{draft.name}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>مدت زمان: {draft.durationSec ? `${draft.durationSec.toFixed(1)} ثانیه` : '—'}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>تعداد ترک‌ها: {draft.tracksCount || '۲'}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#64748b', fontSize: '13px' }}>هنوز پیش‌نویسی در پوشه CapCut یافت نشد.</p>
          )}
        </div>
      )}

      {/* TAB 4: Saved Vault Projects */}
      {activeTab === 'projects' && (
        <div className="ht-media-card">
          <h3 style={{ margin: 0, fontSize: '16px', color: '#00e5ff', marginBottom: '12px' }}>آرشیو پروژه‌های تدوین در والت محلی</h3>
          {savedProjects.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
              {savedProjects.map((p) => (
                <div key={p.id} style={{ background: 'rgba(30,41,59,0.7)', border: '1px solid #334155', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{p.title}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>طول پروژه: {formatSec(p.durationSec)}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>شناسه: {p.id}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#64748b', fontSize: '13px' }}>پروژه‌ای در والت ثبت نشده است.</p>
          )}
        </div>
      )}

      {/* Last Output Result Card */}
      {lastExportedPath && (
        <div className="ht-media-card" style={{ borderColor: '#22c55e', background: 'rgba(34, 197, 94, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#22c55e', fontWeight: 'bold' }}>آخرین خروجی تولیدشده (MP4 سالم روی دیسک C):</div>
              <div style={{ fontSize: '13px', fontFamily: 'monospace', color: '#f1f5f9', marginTop: '4px' }}>{lastExportedPath}</div>
            </div>
            <button
              type="button"
              className="ht-media-btn"
              onClick={() => {
                if (api?.openExternal) api.openExternal(lastExportedPath);
              }}
            >
              <Icon name="external" size={14} />
              <span>پخش / مشاهده فایل</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
