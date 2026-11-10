import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useLocale } from '@/hooks/useLocale';
import './SocialSatellitePage.css';

export function MarketingPage() {
  const { locale } = useLocale();
  const fa = locale === 'fa';

  const [product, setProduct] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [goal, setGoal] = useState<'leads' | 'sales' | 'brand_awareness'>('leads');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const api = window.heztech || window.hesatech;

  async function handleCreatePlan() {
    if (!product.trim() || loading) return;
    setLoading(true);
    setError(null);
    setPlan(null);

    try {
      const prompt = `شما مدیر ارشد بازاریابی (CMO) هستید. یک استراتژی جامع و عملیاتی بازاریابی برای مورد زیر طراحی کنید:
محصول / خدمت: ${product}
مخاطبان هدف: ${targetAudience || 'عموم مخاطبان علاقه‌مند'}
هدف اصلی کمپین: ${goal === 'leads' ? 'جذب لید و مخاطب راغب' : goal === 'sales' ? 'فروش مستقیم و تبدیل' : 'آگاهی از برند'}

خروجی ساختاریافته شامل:
۱. پیام کلیدی و ارزش پیشنهادی متمایز (UVP)
۲. ستون‌های محتوایی (Content Pillars) برای اینستاگرام و وب
۳. تقویم هفتگی انتشار محتوا (شنبه تا پنج‌شنبه)
۴. استراتژی قلاب و تبدیل لید به مشتری`;

      if (!api?.sendMessage) {
        throw new Error(fa ? 'رابط هوش مصنوعی در دسترس نیست.' : 'AI API unavailable.');
      }

      const res = await api.sendMessage({
        message: prompt,
        model: 'openclaw-default',
      });

      if (!res || !res.success) {
        throw new Error(res?.error || (fa ? 'خطا در تدوین برنامه بازاریابی' : 'Failed to generate plan'));
      }

      setPlan(res.reply);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ht-social-page">
      <header className="ht-social-header">
        <div>
          <h1 className="ht-social-title">
            {fa ? 'استودیو استراتژی و بازار (Marketing Hub)' : 'Strategic Marketing Hub'}
          </h1>
          <p className="ht-social-subtitle">
            {fa
              ? 'تدوین برنامه‌های کمپین، بخش‌بندی مخاطبان، ارزش پیشنهادی متمایز و تقویم اجرایی بازاریابی'
              : 'Campaign planning, audience segmentation, UVP formulation, and weekly marketing schedules'}
          </p>
        </div>
      </header>

      <div className="ht-social-grid">
        <div className="ht-social-card">
          <h2 className="ht-social-card__title">
            <Icon name="briefcase" size={18} />
            {fa ? 'مشخصات کسب‌وکار و کمپین' : 'Campaign Parameters'}
          </h2>

          <div className="ht-social-field">
            <label className="ht-social-label">{fa ? 'نام یا موضوع محصول / خدمت' : 'Product / Service'}</label>
            <input
              type="text"
              className="ht-social-input"
              placeholder={fa ? 'مثال: دوره آموزشی مدیریت اضطراب و روان‌درمانی فردی' : 'e.g. Anxiety Management Masterclass'}
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="ht-social-field">
            <label className="ht-social-label">{fa ? 'مخاطب هدف و پرسونای مشتری' : 'Target Audience'}</label>
            <input
              type="text"
              className="ht-social-input"
              placeholder={fa ? 'مثال: افراد ۲۵ تا ۴۵ سال با استرس شغلی یا فردی' : 'e.g. Adults 25-45 facing career burnout'}
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="ht-social-field">
            <label className="ht-social-label">{fa ? 'هدف اصلی کمپین' : 'Campaign Objective'}</label>
            <select
              className="ht-social-select"
              value={goal}
              onChange={(e) => setGoal(e.target.value as any)}
              disabled={loading}
            >
              <option value="leads">{fa ? 'جذب سرنخ و مخاطب راغب (Lead Generation)' : 'Lead Generation'}</option>
              <option value="sales">{fa ? 'فروش و ثبت‌نام مستقیم (Direct Sales)' : 'Direct Sales'}</option>
              <option value="brand_awareness">{fa ? 'آگاهی از برند و اعتبار حرفه‌ای (Brand Awareness)' : 'Brand Awareness'}</option>
            </select>
          </div>

          <button
            type="button"
            className="ht-social-btn"
            style={{ background: 'linear-gradient(135deg, #0284c7, #2563eb)' }}
            onClick={handleCreatePlan}
            disabled={loading || !product.trim()}
          >
            <Icon name="zap" size={18} />
            {loading ? (fa ? 'در حال تدوین استراتژی مارکتینگ...' : 'Formulating Strategy...') : (fa ? 'تدوین برنامه بازاریابی و تقویم محتوا' : 'Generate Marketing Plan')}
          </button>
          {error && <p className="ht-disconnected" role="alert">{error}</p>}
        </div>

        <div className="ht-social-card">
          <h2 className="ht-social-card__title">
            <Icon name="fileText" size={18} />
            {fa ? 'برنامه راهبردی و تقویم اجرایی' : 'Marketing Strategy & Execution Blueprint'}
          </h2>

          {plan ? (
            <div className="ht-social-result-box">
              <div className="ht-social-caption-box" style={{ fontSize: 'var(--ht-text-sm)' }}>
                {plan}
              </div>
            </div>
          ) : (
            <div className="ht-empty-state">
              <p>{fa ? 'اطلاعات محصول و مخاطب را وارد کنید تا برنامه بازاریابی تدوین شود.' : 'Fill the parameters and generate your campaign strategy.'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
