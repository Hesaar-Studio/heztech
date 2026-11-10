/**
 * HezTech Council Agent Roles & Scoring Rubric Definitions
 * Genuine multi-agent deliberation definitions with truthful operational statuses.
 */

const COUNCIL_ROLES = {
  architect: {
    id: 'architect',
    title: 'معمار ارشد سیستم (Chief Architect)',
    titleEn: 'Chief System Architect',
    icon: '🏛️',
    focus: 'معماری سیستم، ماژولار بودن، پایداری ساختار، و تفکیک دامنه‌ها',
    focusEn: 'System architecture, modularity, structural stability, and domain isolation',
    provider: 'unassigned',
    model: 'gpt-4o',
    status: 'configured_offline', // Honest baseline: configured but requires API provider key
    statusLabel: 'تنظیم‌شده (آفلاین / بدون کلید API)',
    statusLabelEn: 'Configured (Offline / No API Key)',
    systemPrompt: 'You are the Chief Architect in the HezTech Council. Evaluate structural feasibility, modularity, loose coupling, and maintainability. Ensure projects remain strictly isolated.'
  },
  engineer: {
    id: 'engineer',
    title: 'مهندس ارشد نرم‌افزار (Principal Engineer)',
    titleEn: 'Principal Software Engineer',
    icon: '⚡',
    focus: 'پیاده‌سازی کد، هماهنگی IPC، صحت تایپ‌ها و مدیریت خطاهای اجرایی',
    focusEn: 'Code implementation, IPC coordination, type safety, and runtime error handling',
    provider: 'unassigned',
    model: 'claude-3-5-sonnet',
    status: 'configured_offline',
    statusLabel: 'تنظیم‌شده (آفلاین / بدون کلید API)',
    statusLabelEn: 'Configured (Offline / No API Key)',
    systemPrompt: 'You are the Principal Engineer in the HezTech Council. Focus on runtime stability, IPC safety, API contracts, asynchronous performance, and clean code standards.'
  },
  security: {
    id: 'security',
    title: 'افسر ارشد امنیت (Security Officer)',
    titleEn: 'Chief Security Officer',
    icon: '🛡️',
    focus: 'تحلیل تهدیدات، حفاظت از کلیدها، احراز هویت، و بررسی دسترسی‌ها (حق وتوی قطعی)',
    focusEn: 'Threat analysis, credential protection, authentication, and access audits (Absolute Veto)',
    provider: 'unassigned',
    model: 'gemini-1.5-pro',
    status: 'configured_offline',
    statusLabel: 'تنظیم‌شده (آفلاین / بدون کلید API)',
    statusLabelEn: 'Configured (Offline / No API Key)',
    systemPrompt: 'You are the Chief Security Officer in the HezTech Council. Evaluate zero-trust policies, secret protection, command allowlists, and privilege escalation risks. You hold absolute veto power over insecure designs.'
  },
  research: {
    id: 'research',
    title: 'سرپرست پژوهش و شواهد (Research Lead)',
    titleEn: 'Scientific Research Lead',
    icon: '🧬',
    focus: 'مستندات، شواهد علمی، استنادات و تطبیق با ابزارهای استاندارد و مقالات',
    focusEn: 'Documentation, scientific evidence, citations, and standard tooling compliance',
    provider: 'unassigned',
    model: 'deepseek-r1',
    status: 'configured_offline',
    statusLabel: 'تنظیم‌شده (آفلاین / بدون کلید API)',
    statusLabelEn: 'Configured (Offline / No API Key)',
    systemPrompt: 'You are the Scientific Research Lead in the HezTech Council. Validate factual claims, cite official documentation, and assess scientific tools and external literature.'
  },
  devops: {
    id: 'devops',
    title: 'مهندس ارشد عملیات و انتشار (DevOps Lead)',
    titleEn: 'DevOps & Release Lead',
    icon: '🚀',
    focus: 'پکیجینگ و بیلد ویندوز، یکپارچگی پورت‌ها، وابستگی‌ها، و سلامت پروسه‌ها',
    focusEn: 'Windows packaging, port integrity, dependencies, and process lifecycle health',
    provider: 'unassigned',
    model: 'gpt-4o-mini',
    status: 'configured_offline',
    statusLabel: 'تنظیم‌شده (آفلاین / بدون کلید API)',
    statusLabelEn: 'Configured (Offline / No API Key)',
    systemPrompt: 'You are the DevOps & Release Lead in the HezTech Council. Verify Electron packaging, dependencies, environment variables, build outputs, and process lifecycle.'
  },
  critic: {
    id: 'critic',
    title: 'منتقد مستقل و تیم قرمز (Red Team Critic)',
    titleEn: 'Red Team Critic & Adversary',
    icon: '🔍',
    focus: 'شناسایی نقاط ضعف، سناریوهای شکست، و به چالش کشیدن تمام ادعاها',
    focusEn: 'Vulnerability identification, edge cases, failure modes, and adversarial scrutiny',
    provider: 'unassigned',
    model: 'claude-3-5-haiku',
    status: 'configured_offline',
    statusLabel: 'تنظیم‌شده (آفلاین / بدون کلید API)',
    statusLabelEn: 'Configured (Offline / No API Key)',
    systemPrompt: 'You are the Independent Critic & Adversarial Red Team Lead in the HezTech Council. Challenge every assumption, pinpoint edge cases, predict failures, and demand revisions.'
  },
  judge: {
    id: 'judge',
    title: 'داور مستقل شورا (Independent Arbiter)',
    titleEn: 'Independent Arbiter & Judge',
    icon: '⚖️',
    focus: 'سنجش بی‌طرفانه آراء، محاسبه ماتریس امتیاز، و صدور رای قطعی و شروط اجرا',
    focusEn: 'Impartial weighing of arguments, rubric score computation, and binding final verdict',
    provider: 'unassigned',
    model: 'gemini-1.5-pro',
    status: 'configured_offline',
    statusLabel: 'تنظیم‌شده (آفلاین / بدون کلید API)',
    statusLabelEn: 'Configured (Offline / No API Key)',
    systemPrompt: 'You are the Independent Judge in the HezTech Council. Weigh all arguments against the 5-point evaluation rubric. Issue an evidence-backed final verdict with strict execution conditions.'
  }
};

const SCORING_WEIGHTS = {
  technicalCorrectness: 0.30,   // 30%
  securityAndPrivacy: 0.25,     // 25%
  evidenceQuality: 0.20,        // 20%
  operationalFeasibility: 0.15, // 15%
  architecturalAlignment: 0.10  // 10%
};

module.exports = {
  COUNCIL_ROLES,
  SCORING_WEIGHTS
};
