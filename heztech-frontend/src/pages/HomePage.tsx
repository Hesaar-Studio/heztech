import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { useLocale } from '@/hooks/useLocale';
import './HomePage.css';

export function HomePage() {
  const { locale } = useLocale();
  const fa = locale === 'fa';

  return (
    <div className="apple-landing-wrapper" dir={fa ? 'rtl' : 'ltr'}>
      {/* 120px Vertical Padding Landing Section */}
      <section className="apple-landing-section">
        {/* Subtle Ambient Glow */}
        <div className="apple-landing-ambient" />

        {/* Eyebrow Tag Pill */}
        <div className="apple-eyebrow-pill apple-fade-in apple-delay-1">
          <span className="apple-badge-dot" />
          <span>{fa ? 'مرکز فرماندهی هساتک ۲٫۰ • دستیار هوشمند ARTA' : 'HezTech Command Center 2.0 • Powered by ARTA'}</span>
        </div>

        {/* High-Contrast Typography with Tighter Letter-Spacing */}
        <h1 className="apple-hero-headline apple-fade-in apple-delay-2">
          <span className="apple-headline-gradient">
            {fa ? 'هوشمندی، دقت و سرعت.' : 'Intelligence at the speed of thought.'}
          </span>
          <br />
          {fa ? 'یکپارچه‌سازی بی‌نقص در یک اکوسیستم.' : 'Engineered for seamless command.'}
        </h1>

        {/* Subheadline with subtle contrast */}
        <p className="apple-hero-subheadline apple-fade-in apple-delay-3">
          {fa
            ? 'ارکستراسیون عامل‌های خودمختار هوش مصنوعی، ممیزی و تدوین حرفه‌ای رسانه با پل CapCut، و امنیت در کلاس سازمانی.'
            : 'Autonomous multi-agent orchestration, broadcast-grade media editing with CapCut Bridge, and enterprise-grade local vault security.'}
        </p>

        {/* Apple-Style CTA Action Buttons */}
        <div className="apple-cta-group apple-fade-in apple-delay-4">
          <Link to="/assistant" className="apple-btn-primary">
            <Icon name="messageSquare" size={17} />
            <span>{fa ? 'شروع گفتگو با ARTA' : 'Start with ARTA Voice'}</span>
          </Link>
          <Link to="/media-studio" className="apple-btn-secondary">
            <Icon name="video" size={17} />
            <span>{fa ? 'ورود به استودیو مدیا' : 'Open Media Studio'}</span>
          </Link>
        </div>

        {/* Main Image / Mockup Container with Subtle Radial Gradient Glow */}
        <div className="apple-image-container apple-fade-in apple-delay-5">
          {/* Subtle Radial Gradient Glow behind the main showcase */}
          <div className="apple-image-radial-glow" />

          {/* Glassmorphic Window Mockup */}
          <div className="apple-window-mockup">
            <div className="apple-window-titlebar">
              <div className="apple-window-dots">
                <span className="apple-dot apple-dot-red" />
                <span className="apple-dot apple-dot-yellow" />
                <span className="apple-dot apple-dot-green" />
              </div>
              <div className="apple-window-title">
                {fa ? 'مرکز عملیات هساتک — جلسه فعال ARTA' : 'HezTech Executive Studio — Active Session'}
              </div>
              <div className="apple-window-badge">
                <span className="apple-badge-dot" />
                {fa ? 'آنلاین و ایمن' : 'Local Vault Secure'}
              </div>
            </div>

            <div className="apple-window-body">
              {/* Left Column: Voice Orb Preview */}
              <div className="apple-window-card apple-orb-preview">
                <div className="apple-orb-sphere" />
                <div className="apple-orb-label">
                  {fa ? 'هسته صوتی زنده ARTA' : 'ARTA Realtime Voice Core'}
                </div>
                <div className="apple-orb-sub">
                  {fa
                    ? 'پردازش مستقیم بدون نشت داده با تفکیک وظایف و حق وتوی تیم امنیت'
                    : 'Low-latency conversational agent with local telemetry and zero plaintext leakage'}
                </div>
              </div>

              {/* Right Column: Engine Telemetry Status */}
              <div className="apple-window-card apple-telemetry-grid">
                <div className="apple-telemetry-item">
                  <div className="apple-telemetry-label">
                    <Icon name="cpu" size={16} />
                    <span>{fa ? 'موتور تدوین Unified Media Engine' : 'Unified Media Engine (FFmpeg)'}</span>
                  </div>
                  <span className="apple-telemetry-status">{fa ? 'فعال' : 'Active'}</span>
                </div>

                <div className="apple-telemetry-item">
                  <div className="apple-telemetry-label">
                    <Icon name="layers" size={16} />
                    <span>{fa ? 'اتصال پل مستقل CapCut Bridge' : 'CapCut Bridge Kit (Typed Contract)'}</span>
                  </div>
                  <span className="apple-telemetry-status">{fa ? 'همگام' : 'Synced'}</span>
                </div>

                <div className="apple-telemetry-item">
                  <div className="apple-telemetry-label">
                    <Icon name="share2" size={16} />
                    <span>{fa ? 'هوشمندی شبکه‌های اجتماعی و ترندها' : 'Social Intelligence & Treg MCP'}</span>
                  </div>
                  <span className="apple-telemetry-status">{fa ? 'آماده' : 'Ready'}</span>
                </div>

                <div className="apple-telemetry-item">
                  <div className="apple-telemetry-label">
                    <Icon name="shield" size={16} />
                    <span>{fa ? 'شورای چندعامله و داوری مستقل' : 'Multi-Agent Council Deliberation'}</span>
                  </div>
                  <span className="apple-telemetry-status">{fa ? 'محافظت‌شده' : 'Guarded'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bento Grid Features Showcase */}
        <div className="apple-bento-grid apple-fade-in apple-delay-5">
          <Link to="/media-studio" className="apple-bento-card">
            <div>
              <div className="apple-bento-icon">
                <Icon name="video" size={22} />
              </div>
              <h3 className="apple-bento-title">
                {fa ? 'استودیو تدوین و رسانه' : 'Unified Media Studio'}
              </h3>
              <p className="apple-bento-desc">
                {fa
                  ? 'برش دقیق، حذف خودکار سکوت، زیرنویس فارسی RTL و پریست‌های رسمی ریلز و یوتیوب.'
                  : 'Frame-accurate cuts, silence removal, Persian RTL subtitles, and instant social export presets.'}
              </p>
            </div>
            <span className="apple-bento-link">
              <span>{fa ? 'مشاهده استودیو' : 'Explore Studio'}</span>
              <span>&rarr;</span>
            </span>
          </Link>

          <Link to="/social-satellite" className="apple-bento-card">
            <div>
              <div className="apple-bento-icon">
                <Icon name="share2" size={22} />
              </div>
              <h3 className="apple-bento-title">
                {fa ? 'هوشمندی شبکه‌های اجتماعی' : 'Social Intelligence'}
              </h3>
              <p className="apple-bento-desc">
                {fa
                  ? 'تحلیل رقبا، امتیازدهی هوک، کشف الگوهای پربازدید و دروازه تایید انسانی برای انتشار.'
                  : 'Competitor audits, hook scoring, viral discovery, and cryptographic human approval gates.'}
              </p>
            </div>
            <span className="apple-bento-link">
              <span>{fa ? 'بررسی آمار و ترندها' : 'Analyze Trends'}</span>
              <span>&rarr;</span>
            </span>
          </Link>

          <Link to="/agents" className="apple-bento-card">
            <div>
              <div className="apple-bento-icon">
                <Icon name="users" size={22} />
              </div>
              <h3 className="apple-bento-title">
                {fa ? 'ارکستراسیون عامل‌ها و شورا' : 'Agent Council & Ops'}
              </h3>
              <p className="apple-bento-desc">
                {fa
                  ? 'هماهنگی وظایف بین معمار، مهندس، تیم امنیت، داور مستقل و ارزیابی چندبعدی طرح‌ها.'
                  : 'Deliberation with Architect, Engineer, Security Veto, and Independent Arbitration.'}
              </p>
            </div>
            <span className="apple-bento-link">
              <span>{fa ? 'مدیریت عامل‌ها' : 'View Agents'}</span>
              <span>&rarr;</span>
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}
