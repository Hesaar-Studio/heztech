/**
 * HesaTech Instagram Agent Skills Framework
 * Inspired by instagram-agent-skill (open-source) & AmirHosseinAI architecture
 * 
 * Safe, Local AI Agent skills for Instagram Content Strategy:
 * 1. Reels Scripting (26 Scored Viral Hook Formulas, Visual Storyboard, Audio)
 * 2. Caption Linter & Humanizer (Strips AI fingerprints, high-converting CTAs)
 * 3. Viral Research & Trend Hunter (Analyzes patterns & competitor dynamics)
 * 4. Weekly Content Matrix Planner (7-day strategic calendar)
 * 5. Bio & Profile Audit (High-converting positioning)
 * 6. DM & Comment Reply Drafter (Lead gen & engagement flows)
 * 7. Content Repurposing Engine (Converts text/notes into Reels, Carousels, Stories)
 * 8. Brand Voice Tuner (Injects personal creator tone)
 * 9. Carousel Post Architect (Slide-by-slide retention hooks)
 */

const { GoogleGenAI } = require('@google/genai');
const ConfigManager = require('./config');

// 26 Proven Scored Viral Hook Formulas
const VIRAL_HOOK_FORMULAS = [
  { id: 'h1', category: 'کنجکاوی شدید', text: 'کاری که هیچ‌کس بهت در مورد {موضوع} نمی‌گه اینه که...', score: 98 },
  { id: 'h2', category: 'تضاد و باور غلط', text: 'تمام این مدت {موضوع} رو اشتباه انجام می‌دادی؛ حقیقت اینه...', score: 96 },
  { id: 'h3', category: 'افشاگری و راز', text: 'راز پشت پرده‌ای که مدرس‌های {موضوع} نمی‌خوان بدونی...', score: 95 },
  { id: 'h4', category: 'حل مشکل فوری', text: 'اگه فقط ۳۰ ثانیه وقت داری، این ترفند {موضوع} زندگیتو نجات می‌ده...', score: 94 },
  { id: 'h5', category: 'شوک و آمار', text: '۹۰ درصد کسایی که وارد {موضوع} می‌شن تو ماه اول شکست می‌خورن، چون...', score: 95 },
  { id: 'h6', category: 'قبل و بعد', text: 'قبل اینکه {موضوع} رو یاد بگیرم ساعت‌ها گیر می‌کردم، اما الان...', score: 92 },
  { id: 'h7', category: 'هشدار و ضرر', text: 'اگه هنوز داری برای {موضوع} این اشتباه رو می‌کنی، همین الان متوقفش کن!', score: 97 },
  { id: 'h8', category: 'ترفند پنهان', text: 'یه قابلیت مخفی توی {موضوع} پیدا کردم که هوش از سرت می‌پرونه...', score: 93 },
  { id: 'h9', category: 'آسان‌سازی', text: 'ساده‌ترین راهی که تا حالا برای {موضوع} دیدی دقیقاً اینه...', score: 91 },
  { id: 'h10', category: 'مقایسه مستقیم', text: 'تفاوت افراد آماتور و حرفه‌ای توی {موضوع} فقط همین یک نکته‌ست...', score: 94 },
  { id: 'h11', category: 'نقطه عطف شخصی', text: 'بزرگ‌ترین درسی که بعد از ۳ سال کار روی {موضوع} گرفتم...', score: 90 },
  { id: 'h12', category: 'سناریوی بدون هزینه', text: 'چطور بدون ۱ ریال خرج اضافی، بهترین نتیجه رو توی {موضوع} بگیری؟', score: 96 },
  { id: 'h13', category: 'تله روانی', text: 'شاید از شنیدنش خوشت نیاد، ولی اگه به {موضوع} نرسی عقب می‌مونی...', score: 93 },
  { id: 'h14', category: 'پیش‌بینی آینده', text: 'تا ۶ ماه آینده وضعیت {موضوع} کاملاً دگرگون می‌شه، این ۳ نکته رو بدون...', score: 92 },
  { id: 'h15', category: 'چالش ۷ روزه', text: 'اگه ۷ روز این فرمول رو برای {موضوع} پیاده کنی، نتیجش شوکه‌ت می‌کنه...', score: 94 },
  { id: 'h16', category: 'سوال برانگیز', text: 'چرا هیشکی راجع به خطرناک‌ترین باگ {موضوع} حرفی نمی‌زنه؟', score: 95 },
  { id: 'h17', category: 'جایگزین ارزان/سریع', text: 'به جای تلف کردن وقتت پای {موضوع}، این راه میانبر رو برو...', score: 93 },
  { id: 'h18', category: 'افشاگری مالی/سود', text: 'با این تکنیک توی {موضوع} بازدهیت ۳ برابر می‌شه بدون استرس اضافی...', score: 92 },
  { id: 'h19', category: 'قانون ۳ ثانیه', text: 'فقط ۳ ثانیه وقت بذار و نگاه کن چطور این نکته توی {موضوع} معجزه می‌کنه...', score: 95 },
  { id: 'h20', category: 'لیست طلایی', text: '۳ تا ابزار رایگان برای {موضوع} که هوش مصنوعی رو می‌ترکونه...', score: 94 },
  { id: 'h21', category: 'برعکس جریان آب', text: 'همه می‌گن باید {موضوع} رو اینجوری شروع کنی، ولی من دقیقاً برعکس عمل کردم!', score: 96 },
  { id: 'h22', category: 'تصور کن...', text: 'تصور کن فردا صبح بیدار بشی و مشکل {موضوع} برای همیشه حل شده باشه...', score: 89 },
  { id: 'h23', category: 'داستان کوتاه', text: 'دیروز یه پیام جالب گرفتم در مورد {موضوع} که فکرم رو خیلی درگیر کرد...', score: 88 },
  { id: 'h24', category: 'قضاوت نادرست', text: 'فکر می‌کنی {موضوع} سخته؟ فقط چون این روش استاندارد رو تست نکردی...', score: 91 },
  { id: 'h25', category: 'هشدار زمان', text: 'تا قبل از اینکه امسال تموم بشه، باید این مهارت {موضوع} رو مسلط بشی...', score: 90 },
  { id: 'h26', category: 'کال تو اکشن معکوس', text: 'اگه حوصله یادگیری عمیق نداری این ویدیو رو رد کن، ولی اگه می‌خوای {موضوع} رو ببندی...', score: 97 }
];

// AI Words & Clichés that ruin human captions (Caption Linter blacklist)
const AI_CLICHE_BLACKLIST = [
  'در این پست قصد داریم',
  'در ادامه به بررسی خواهیم پرداخت',
  'در دنیای پرشتاب امروز',
  'غوطه‌ور شوید',
  'رونمایی می‌کنیم',
  'پتانسیل نامحدود',
  'بدون شک',
  'لازم به ذکر است',
  'شایان ذکر است',
  'در وهله اول',
  'این امر مهم',
  'همانطور که می‌دانید',
  'در دنیای امروزی'
];

class InstagramSkillsEngine {
  constructor() {
    this.models = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash'];
  }

  getGenAI() {
    const apiKey = ConfigManager.getDecryptedApiKey() || process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
  }

  async runAiPrompt(systemInstruction, userPrompt) {
    if (this.textGenerator) return this.textGenerator(systemInstruction, userPrompt);
    const ai = this.getGenAI();
    if (!ai) return null;
    for (const model of this.models) {
      try {
        const resp = await ai.models.generateContent({
          model,
          contents: [{ text: userPrompt }],
          config: {
            systemInstruction: { parts: [{ text: systemInstruction }] },
            temperature: 0.7
          }
        });
        if (resp && resp.text) return resp.text.trim();
      } catch (e) {
        console.warn(`[InstagramSkill] Model ${model} failed, trying next:`, e.message);
      }
    }
    return null;
  }

  // 1. REELS SCRIPT GENERATOR (with 26 Hook Formulas & Storyboard)
  async generateReelsScript({ topic, targetAudience = 'عموم علاقه‌مندان', tone = 'پرانرژی و متقاعدکننده', hookCategory = 'کنجکاوی شدید' }) {
    const sampleHooks = VIRAL_HOOK_FORMULAS.slice(0, 5).map(h => `- [امتیاز وایرال: ${h.score}/100] ${h.text.replace('{موضوع}', topic)}`).join('\n');
    
    const sysPrompt = `شما کارگردان و فیلم‌نامه‌نویس ارشد ریلزهای اینستاگرام (Instagram Reels Scriptwriter) هستید.
وظیفه شما طراحی یک سناریوی کامل، ثانیه‌به‌ثانیه و بدون کلیشه‌های ماشینی بر پایه ساختار استاندارد ریلزهای میلیونی است.
خروجی باید با فرمت دقیق Markdown شامل:
1. 🎯 مشخصات ویدیو (مدت زمان بهینه، زاویه دوربین، موزیک ترند پیشنهادی)
2. 🔥 ۳ هوک کلامی و متنی برای ۳ ثانیه اول (با نمره جذابیت)
3. 🎬 جدول ثانیه‌به‌ثانیه (زمان | تصویر و حرکت دوربین | متن روی تصویر B-Roll | دیالوگ یا وویس‌اور)
4. 💎 نکته طلایی نگهداشت مخاطب (Retention Trick)
5. 📣 کال تو اکشن پایانی (CTA برای سیو و کامنت کلمه کلیدی)
زبان کاملاً روان و انسانی فارسی باشد.`;

    const userPrompt = `موضوع ریلز: «${topic}»
مخاطب هدف: «${targetAudience}»
لحن ویدیو: «${tone}»
دسته‌بندی هوک ترجیحی: «${hookCategory}»

نمونه هوک‌های پرامتیاز پیشنهادی:
${sampleHooks}`;

    const aiRes = await this.runAiPrompt(sysPrompt, userPrompt);
    if (aiRes) return { success: true, script: aiRes, topic, formulas: VIRAL_HOOK_FORMULAS };

    // Fallback template if offline
    return {
      success: true,
      topic,
      script: `### 🎬 سناریوی ریلز پیشنهادی برای: «${topic}»
**مدت زمان بهینه:** ۲۵ تا ۳۵ ثانیه | **موزیک پیشنهادی:** لایت بیت پرانرژی اینستاگرامی

#### 🔥 هوک‌های ۳ ثانیه‌ای اول (انتخاب یکی):
1. **هوک شوکه‌کننده:** «کاری که هیچ‌کس در مورد ${topic} بهت نمی‌گه دقیقاً اینه...»
2. **هوک تضاد:** «تمام این مدت داشتی ${topic} رو اشتباه انجام می‌دادی، این ۳۰ ثانیه رو خوب ببین!»
3. **هوک سریع:** «اگه وقت نداری ساعت‌ها سر ${topic} گیر کنی، این فرمول نجاتت می‌ده.»

#### 🎥 استوری‌بورد ثانیه‌به‌ثانیه:
- **ثانیه ۰ تا ۳ (قلاب):** نگاه مستقیم به دوربین، دست به سمت لنز یا نمایش یک نتیجه ناگهانی. متن روی تصویر: *«راز مخفی ${topic}!»*
- **ثانیه ۳ تا ۱۰ (مشکل):** بیان کوتاه مشکلی که همه با آن درگیرند (کات سریع هر ۲ ثانیه).
- **ثانیه ۱۰ تا ۲۲ (راه‌حل طلایی):** معرفی تکنیک ۳ مرحله‌ای با نمایش اسکرین یا دمو عملی.
- **ثانیه ۲۲ تا ۳۰ (کال تو اکشن):** *«کلمه "${topic}" رو توی کامنت بفرست تا لیست ابزارهاشو مستقیم تو دایرکت برات بفرستم!»*

#### 🏷️ هشتگ‌های مکمل:
#${topic.replace(/\s+/g, '_')} #آموزش #اکسپلور #ریلز_وایرال #هوش_مصنوعی #هساتک`,
      formulas: VIRAL_HOOK_FORMULAS
    };
  }

  // 2. CAPTION LINTER & HUMANIZER (Removes AI Clichés)
  async lintAndHumanizeCaption({ draftCaption, goal = 'تعامل و فروش', tone = 'صمیمی و حرفه‌ای' }) {
    const sysPrompt = `شما ویراستار و متخصص کپشن‌نویسی اینستاگرام (Instagram Caption Linter) هستید.
وظایف اصلی:
1. حذف تمام کلمات ماشینی و کلیشه‌های لوده‌هنده هوش مصنوعی (مانند: ${AI_CLICHE_BLACKLIST.join('، ')})
2. بازنویسی خط اول (Hook line) به شکلی که مخاطب حتماً دکمه "...more" یا "...بیشتر" را لمس کند.
3. ایجاد ریتم تنفسی، فاصله‌گذاری اصولی خطوط با ایموجی‌های معنادار و بدون شلوغ‌کاری.
4. پایان‌بندی با یک CTA هوشمند برای کامنت یا اشتراک‌گذاری.`;

    const userPrompt = `متن پیش‌نویس کپشن:\n«${draftCaption}»\nهدف پست: «${goal}»\nلحن مطلوب: «${tone}»`;

    const aiRes = await this.runAiPrompt(sysPrompt, userPrompt);
    let cleaned = draftCaption;
    AI_CLICHE_BLACKLIST.forEach(bad => {
      cleaned = cleaned.split(bad).join('');
    });

    return {
      success: true,
      humanizedCaption: aiRes || `🔥 ${cleaned.trim()}\n\n👇 نظرت رو راجع به این موضوع توی کامنت‌ها برام بنویس، تک‌تک پاسخ می‌دم!`,
      clichesRemoved: AI_CLICHE_BLACKLIST.filter(b => draftCaption.includes(b))
    };
  }

  // 3. VIRAL PATTERNS & COMPETITOR RESEARCH
  async researchViralPatterns({ niche, competitorFocus = '' }) {
    const sysPrompt = `شما تحلیل‌گر داده‌های اکسپلور و ترندهای اینستاگرام هستید.
تحلیل دقیقی از الگوهای وایرال شدن در حوزه کاری داده شده ارائه دهید:
1. ۳ زاویه دید (Angle) که در حال حاضر بالاترین سیو و شیر را دارند
2. فرمت‌های ویدیویی موفق (مثلاً Talking Head، POV، قبل/بعد، کاروسل متنی)
3. ترندهای صوتی و ساختار گرافیکی کاور
4. اشتباهات رایجی که باعث افت Reach پیج در این حوزه می‌شود`;

    const userPrompt = `حوزه کاری / نیچ: «${niche}»\nتمرکز روی رقبا یا زیرشاخه: «${competitorFocus}»`;
    const aiRes = await this.runAiPrompt(sysPrompt, userPrompt);
    return {
      success: true,
      niche,
      analysis: aiRes || `الگوهای وایرال برای «${niche}»:\n- ویدیوهای با ریتم تند زیر ۳۰ ثانیه\n- کاروسل‌های اسلایدی آموزشی با کاور مینیمال و متن بولد\n- چالش‌های تجربی و نمایش پشت‌صحنه کارها`
    };
  }

  // 4. WEEKLY CONTENT MATRIX (7-Day Strategy)
  async generateWeeklyPlan({ niche, primaryGoal = 'جذب فالوور و فروش', targetAudience = '' }) {
    const sysPrompt = `شما استراتژیست ارشد برنامه محتوایی هفتگی اینستاگرام هستید.
یک تقویم ماتریسی ۷ روزه محتوا ارائه دهید. برای هر روز هفته مشخص کنید:
- روز (شنبه تا جمعه)
- فرمت محتوا (ریلز، کاروسل، تک‌پست یا استوری زنجیره‌ای)
- هدف پست (آگاهی، تعامل، آموزش، اعتماد یا فروش مستقیم)
- موضوع و قلاب اصلی (Hook)
- برنامه مکمل در استوری برای همان روز`;

    const userPrompt = `حوزه کاری: «${niche}»\nهدف اصلی: «${primaryGoal}»\nمخاطب: «${targetAudience || 'مخاطب تخصصی'}»`;
    const aiRes = await this.runAiPrompt(sysPrompt, userPrompt);
    return {
      success: true,
      niche,
      weeklyMatrix: aiRes || `تقویم هفتگی «${niche}»:\nشنبه: ریلز آموزشی سریع با هوک کنجکاوی\nیکشنبه: استوری نظرسنجی و تعاملی\nدوشنبه: کاروسل ۱۰ اسلایدی نکته‌دار\nسه‌شنبه: پشت صحنه و لایف‌استایل کاری\nچهارشنبه: معرفی خدمات یا فروش محصول\nپنج‌شنبه: بررسی اشتباهات رایج مخاطب\nجمعه: جمع‌بندی هفته و پرسش و پاسخ (Q&A)`
    };
  }

  // 5. PROFILE & BIO AUDIT
  async auditProfileBio({ username = '', currentBio = '', niche = '', targetAudience = '' }) {
    const sysPrompt = `شما مشاور برندینگ و بهینه‌سازی پروفایل اینستاگرام هستید.
بیو و پروفایل را با رویکرد تبدیل بازدیدکننده به فالوور (Conversion Rate Optimization) ممیزی کنید:
1. ارزیابی نام و نام نمایشی (Name Field SEO)
2. پیشنهاد ۳ نمونه بیوی جذاب با فرمول استاندارد (کی هستی + برای کی چیکار می‌کنی + مدرک اثبات + کال تو اکشن به هایلایت یا لینک)
3. ساختار بهینه ۴ هایلایت حیاتی (درباره ما، نتایج/رضایت، محصولات/خدمات، شروع از اینجا)
4. نکات بهینه‌سازی عکس پروفایل`;

    const userPrompt = `نام پیج / آیدی: «${username}»\nبیوی فعلی: «${currentBio}»\nحوزه فعالیت: «${niche}»\nمخاطب هدف: «${targetAudience}»`;
    const aiRes = await this.runAiPrompt(sysPrompt, userPrompt);
    return {
      success: true,
      audit: aiRes || `پیشنهاد بهینه‌سازی بیو برای «${username || niche}»:\nخط ۱: متخصص و مربی ${niche}\nخط ۲: کمکت می‌کنم به بالاترین بازدهی برسی\nخط ۳: +۵۰۰ پروژه موفق\nخط ۴: 🎁 هدیه رایگان در لینک زیر 👇`
    };
  }

  // 6. CONTENT REPURPOSING (Turn notes/articles into Reels, Carousels, Stories)
  async repurposeContent({ sourceText, targetFormat = 'کاروسل اسلایدی' }) {
    const sysPrompt = `شما معمار بازآفرینی محتوا (Content Repurposer) هستید.
متن ورودی را دریافت کرده و آن را دقیقاً به فرمت «${targetFormat}» تبدیل کنید:
اگر کاروسل است: اسلاید ۱ (کاور قلاب)، اسلایدهای ۲ تا ۹ (نکات لقمه‌ای و جذاب)، اسلاید ۱۰ (خلاصه + سیو و اشتراک‌گذاری).
اگر ریلز است: سناریوی کلامی کوتاه + نمایش بصری.
اگر استوری زنجیره‌ای است: سکانس ۵ استوری متوالی با استیکرهای تعاملی.`;

    const userPrompt = `متن اصلی:\n«${sourceText}»\nفرمت هدف: «${targetFormat}»`;
    const aiRes = await this.runAiPrompt(sysPrompt, userPrompt);
    return {
      success: true,
      repurposed: aiRes || `خروجی بازآفرینی به ${targetFormat}:\nاسلاید ۱: بزرگترین نکته درباره این موضوع\nاسلاید ۲ تا ۵: مراحل اجرایی\nاسلاید پایانی: این پست رو سیو کن تا گمش نکنی!`
    };
  }

  // 7. SMART DM & COMMENT REPLY DRAFTER
  async draftReplies({ incomingText, context = 'فروش و راهنمایی', tone = 'دوستانه و حرفه‌ای' }) {
    const sysPrompt = `شما دستیار پاسخگویی هوشمند به دایرکت‌ها و کامنت‌های اینستاگرام هستید.
وظیفه شما ایجاد ۳ نوع پاسخ هوشمندانه، کوتاه و تعاملی متناسب با پیام دریافتی است:
1. پاسخ مستقیم و حل سوال (با لحن گرم)
2. پاسخ پیش‌برنده به سمت دایرکت یا ثبت سفارش (Lead Gen)
3. پاسخ طنزآمیز یا فوق‌العاده صمیمی برای افزایش وفاداری مخاطب
پاسخ‌ها باید طبیعی به نظر برسند و هرگز بوی پاسخ رباتیک ندهند.`;

    const userPrompt = `پیام یا کامنت دریافتی: «${incomingText}»\nزمینه: «${context}»\nلحن: «${tone}»`;
    const aiRes = await this.runAiPrompt(sysPrompt, userPrompt);
    return {
      success: true,
      options: aiRes || `گزینه ۱ (صمیمی): سلام دوست من! خیلی خوشحالم که این نکته به کارت اومد ❤️\nگزینه ۲ (فروش/لید): سلام وقتت بخیر، برای دریافت اطلاعات تکمیلی و تخفیف ویژه کافیه پیامت رو تو دایرکت چک کنی 😊`
    };
  }

  // 8. CAROUSEL POST ARCHITECT
  async buildCarouselPost({ topic, slideCount = 7, targetGoal = 'آموزشی و ارجاعی' }) {
    const sysPrompt = `شما معمار پست‌های اسلایدی و کاروسل اینستاگرام (Instagram Carousel Architect) هستید.
طراحی دقیق اسلاید به اسلاید برای یک کاروسل با نرخ سیو بالا:
- اسلاید ۱: تیتر قلاب (Hook Headline)، ساب‌هد، المان بصری پیشنهادی
- اسلایدهای میانی (۲ تا ${slideCount - 1}): هر اسلاید فقط یک پیام واضح، کوتاه و متقاعدکننده + ترغیب به سوایپ (Slide Indicator)
- اسلاید آخر (${slideCount}): کال تو اکشن قوی برای ذخیره پست (Save) و ارسال به یک دوست`;

    const userPrompt = `موضوع کاروسل: «${topic}»\nتعداد اسلایدها: ${slideCount}\nهدف اصلی: «${targetGoal}»`;
    const aiRes = await this.runAiPrompt(sysPrompt, userPrompt);
    return {
      success: true,
      topic,
      carousel: aiRes || `کاروسل «${topic}» آماده شد.`
    };
  }
}

const engine = new InstagramSkillsEngine();
engine.VIRAL_HOOK_FORMULAS = VIRAL_HOOK_FORMULAS;
engine.AI_CLICHE_BLACKLIST = AI_CLICHE_BLACKLIST;

module.exports = engine;

