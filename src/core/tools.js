/**
 * HesaTech Stage C — Controlled Tool Execution & Model Management Layer
 * Provides per-tool permissions, approval gating, timeout management,
 * cancellation tokens, audit logging, and connection testing.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const { GoogleGenAI } = require('@google/genai');
const ConfigManager = require('./config');
const { SecurityManager, COMMAND_ALLOWLIST, APP_ALLOWLIST } = require('./security');
const instagramSkills = require('./instagram-skills');
const mcpBrowserClient = require('./mcp-browser-client');
const webTools = require('./web-tools');
const serviceIntegrations = require('../connectors/service-integrations');
const agentReach = require('../connectors/agent-reach-connector');
const CouncilEngine = require('../council/council-engine');
const { getDurableTaskStore } = require('./durable-tasks');
const { UnifiedMediaEngine } = require('./unified-media-engine');
const unifiedMediaEngine = new UnifiedMediaEngine();
const socialIntelligence = require('./social-intelligence');
const tregAdapter = require('../integrations/treg-adapter');

const VAULT_DIR = path.resolve(process.env.HEZTECH_DATA_DIR || 'C:\\Users\\Green\\openclaw\\vault');
const TASKS_FILE = path.join(VAULT_DIR, 'tasks.json');
const NOTES_FILE = path.join(VAULT_DIR, 'notes.md');

class ToolManager {
  constructor() {
    this.activeTasks = new Map(); // taskId -> { id, tool, startTime, abortController, timeoutHandle }
    this.toolsRegistry = {
      'system_telemetry': {
        id: 'system_telemetry',
        name: 'پایش سخت‌افزار و وضعیت سیستم',
        nameEn: 'System Telemetry Monitor',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 5000,
        description: 'دریافت آمار لحظه‌ای پردازنده، حافظه رم، و فضای دیسک ویندوز'
      },
      'calc_math': {
        id: 'calc_math',
        name: 'محاسبات ریاضی امن',
        nameEn: 'Safe Math Calculator',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 3000,
        description: 'محاسبه عبارات جبری و ریاضی با ایزولاسیون کامل کدهای ناامن'
      },
      'vault_tasks': {
        id: 'vault_tasks',
        name: 'مدیریت وظایف والت',
        nameEn: 'Vault Tasks Manager',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 5000,
        description: 'خواندن، افزودن، تغییر وضعیت و حذف وظایف در والت امن Obsidian'
      },
      'durable_tasks': {
        id: 'durable_tasks',
        name: 'مدیریت وظایف ماندگار',
        nameEn: 'Durable Task Manager',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 8000,
        description: 'ساخت، مشاهده، بازیابی و گزارش وظایف ماندگار با تاریخچه اجرا، کنترل هزینه و تأیید عملیات'
      },
      'file_search': {
        id: 'file_search',
        name: 'جستجوی فایل محلی',
        nameEn: 'Local File Search',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 15000,
        description: 'جستجوی فقط-خواندنی نام فایل در مسیرهای مجاز (Desktop، Documents، Downloads، دادهٔ برنامه)'
      },
      'list_directory': {
        id: 'list_directory',
        name: 'فهرست پوشه',
        nameEn: 'List Directory',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 8000,
        description: 'فهرست فقط-خواندنی محتوای یک مسیر مجاز با حجم و نوع هر مورد'
      },
      'read_file': {
        id: 'read_file',
        name: 'خواندن فایل',
        nameEn: 'Read File',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 8000,
        description: 'خواندن محتوای متنی یک فایل واقعی از مسیرهای مجاز'
      },
      'check_port': {
        id: 'check_port',
        name: 'بررسی پورت',
        nameEn: 'Check Port',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 8000,
        description: 'وضعیت واقعی یک پورت TCP و پردازهٔ مالک آن'
      },
      'disk_info': {
        id: 'disk_info',
        name: 'وضعیت دیسک',
        nameEn: 'Disk Info',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 8000,
        description: 'فضای کل/آزاد/مصرف یک درایو و فهرست پوشههای ریشهٔ آن'
      },
      'project_overview': {
        id: 'project_overview',
        name: 'بررسی پروژه',
        nameEn: 'Project Overview',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 8000,
        description: 'خواندن package.json پروژه و گزارش وابستگیها و اسکریپتها'
      },
      'write_file': {
        id: 'write_file',
        name: 'ساخت فایل',
        nameEn: 'Write File',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 8000,
        description: 'ساخت فایل متنی جدید در پوشهٔ کاری مجاز Documents\\HezTech-Files'
      },
      'edit_file': {
        id: 'edit_file',
        name: 'ویرایش فایل',
        nameEn: 'Edit File',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 10000,
        description: 'اصلاح متن یک فایل مجاز با ساخت خودکار نسخهٔ پشتیبان .bak'
      },
      'vault_notes': {
        id: 'vault_notes',
        name: 'مدیریت یادداشت‌های والت',
        nameEn: 'Vault Notes Manager',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 5000,
        description: 'دسترسی امن و افزودن متن به یادداشت‌های محلی'
      },
      'app_launcher': {
        id: 'app_launcher',
        name: 'اجرای برنامه‌های مجاز ویندوز',
        nameEn: 'Approved App Launcher',
        riskLevel: 'MEDIUM',
        requiresApproval: false, // For whitelisted apps only
        timeoutMs: 8000,
        description: 'اجرای کنترل‌شده نرم‌افزارهای مجاز در ویندوز (Notepad, Calculator, Taskmgr)'
      },
      'network_ping': {
        id: 'network_ping',
        name: 'بررسی پایداری شبکه و پینگ',
        nameEn: 'Network Ping & Latency',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 10000,
        description: 'اندازه‌گیری زمان پاسخ‌دهی و پایداری اینترنت'
      },
      'exec_cmd': {
        id: 'exec_cmd',
        name: 'اجرای دستورات خط فرمان ویندوز',
        nameEn: 'Windows Command Execution',
        riskLevel: 'HIGH',
        requiresApproval: true, // Non-whitelisted commands require approval
        timeoutMs: 15000,
        description: 'اجرای امن دستورات ترمینال با اعمال فیلتر الگوهای مخرب و تایید دستی'
      },
      'search_web': {
        id: 'search_web',
        name: 'جستجوی زنده در اینترنت و وب',
        nameEn: 'Live Web Search',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 10000,
        description: 'جستجوی بلادرنگ در گوگل و وب برای دریافت آخرین اخبار، ترندها و مستندات'
      },
      'fetch_web_content': {
        id: 'fetch_web_content',
        name: 'استخراج محتوای صفحات وب',
        nameEn: 'Webpage Content Extraction',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 12000,
        description: 'دانلود و تمیزسازی محتوای متنی صفحات اینترنتی و مقالات'
      },
      'instagram_intel': {
        id: 'instagram_intel',
        name: 'هوش تحلیل اینستاگرام و شبکه‌های اجتماعی',
        nameEn: 'Instagram & Social Intel',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 15000,
        description: 'تحلیل ترندها، هشتگ‌ها و تولید سناریو و کپشن وایرال برای اینستاگرام'
      },
      'instagram_reels_script': {
        id: 'instagram_reels_script',
        name: 'سناریونویس ریلز با ۲۶ هوک وایرال',
        nameEn: 'Instagram Reels Scriptwriter',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 15000,
        description: 'طراحی سناریوی ریلز میلیونی همراه با هوک‌های کلامی، استوری‌بورد ثانیه‌به‌ثانیه و پیشنهاد صدا'
      },
      'instagram_caption_linter': {
        id: 'instagram_caption_linter',
        name: 'کپشن‌نویس و پالایشگر ردپای هوش مصنوعی',
        nameEn: 'Caption Linter & Humanizer',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 15000,
        description: 'حذف کلیشه‌های ماشینی و هوش مصنوعی و تولید کپشن روان با Call to Action قدرتمند'
      },
      'instagram_viral_research': {
        id: 'instagram_viral_research',
        name: 'تحلیل الگوهای وایرال و رقبا در اینستاگرام',
        nameEn: 'Instagram Viral Pattern Research',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 15000,
        description: 'بررسی نمونه‌های موفق در حوزه کاری، زوایای دید پربازدید و ترندهای صوتی'
      },
      'instagram_content_plan': {
        id: 'instagram_content_plan',
        name: 'تقویم ماتریسی هفتگی محتوای اینستاگرام',
        nameEn: 'Weekly Content Matrix Planner',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 15000,
        description: 'برنامه‌ریزی استراتژیک ۷ روزه با تعیین فرمت، هدف، موضوع، هوک و سناریوی استوری'
      },
      'instagram_profile_optimizer': {
        id: 'instagram_profile_optimizer',
        name: 'ممیزی و بهینه‌سازی بیو و پروفایل اینستاگرام',
        nameEn: 'Instagram Profile & Bio Audit',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 15000,
        description: 'بهینه‌سازی نام سئو، متن بیو با نرخ تبدیل بالا و ساختار هایلایت‌های حیاتی'
      },
      'instagram_repurpose_content': {
        id: 'instagram_repurpose_content',
        name: 'معمار بازآفرینی محتوا به ریلز و اسلایدی',
        nameEn: 'Content Repurposing Engine',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 15000,
        description: 'تبدیل متن‌های طولانی و مقالات به اسلایدهای کاروسل، سناریوی ریلز یا استوری‌های متوالی'
      },
      'instagram_dm_comment_drafter': {
        id: 'instagram_dm_comment_drafter',
        name: 'پیش‌نویس پاسخ هوشمند به دایرکت و کامنت',
        nameEn: 'Smart DM & Comment Reply Drafter',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 15000,
        description: 'نگارش گزینه‌های پاسخ گرم و حرفه‌ای برای تبدیل فالوور به مشتری بدون نیاز به ربات'
      },
      'instagram_carousel_architect': {
        id: 'instagram_carousel_architect',
        name: 'طراح کاروسل و پست‌های اسلایدی با سیو بالا',
        nameEn: 'Instagram Carousel Post Architect',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 15000,
        description: 'طراحی ساختار دقیق اسلاید به اسلاید با تیتر قلاب، بدنه آموزشی و ترغیب به سوایپ'
      },
      'browser_navigate': {
        id: 'browser_navigate',
        name: 'ناوبری مرورگر مایکروسافت',
        nameEn: 'Playwright Browser Navigate',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 35000,
        description: 'باز کردن صفحات وب عمومی در مرورگر اختصاصی Playwright با محافظت SSRF'
      },
      'browser_snapshot': {
        id: 'browser_snapshot',
        name: 'استخراج محتوا و اسنپ‌شات صفحه',
        nameEn: 'Browser Page Snapshot',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 15000,
        description: 'دریافت متن و ساختار دسترسی‌پذیری صفحه فعال مرورگر'
      },
      'browser_click': {
        id: 'browser_click',
        name: 'کلیک روی المان مرورگر',
        nameEn: 'Browser Element Click',
        riskLevel: 'MEDIUM',
        requiresApproval: false,
        timeoutMs: 15000,
        description: 'کلیک روی دکمه‌ها و پیوندهای صفحه فعال'
      },
      'browser_type': {
        id: 'browser_type',
        name: 'تایپ در فیلدهای صفحه',
        nameEn: 'Browser Type Text',
        riskLevel: 'MEDIUM',
        requiresApproval: false,
        timeoutMs: 15000,
        description: 'ورود متن در فرم‌ها و فیلدهای متنی مرورگر'
      },
      'browser_take_screenshot': {
        id: 'browser_take_screenshot',
        name: 'ثبت اسکرین‌شات مرورگر',
        nameEn: 'Browser Screenshot Capture',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 20000,
        description: 'تهیه تصویر از صفحه باز مرورگر و ذخیره در پوشه اختصاصی داده‌ها'
      },
      'browser_close': {
        id: 'browser_close',
        name: 'بستن مرورگر و پاکسازی پروسه',
        nameEn: 'Close Browser Session',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 10000,
        description: 'خاتمه امن جلسه مرورگر و جلوگیری از ماندن فرآیندهای پس‌زمینه'
      },
      'service_integrations_status': {
        id: 'service_integrations_status',
        name: 'بررسی وضعیت سرویس‌های خارجی',
        nameEn: 'External Services Status',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 6000,
        description: 'بررسی وضعیت اتصال واقعی جیمیل، حساب گوگل، تلگرام، اینستاگرام، یوتیوب و گیت تایید'
      },
      'draft_external_action': {
        id: 'draft_external_action',
        name: 'آماده‌سازی پیش‌نویس عملیات خارجی با تایید مالک',
        nameEn: 'Draft External Action with Owner Approval',
        riskLevel: 'HIGH',
        requiresApproval: false,
        timeoutMs: 10000,
        description: 'ایجاد پیش‌نویس پیام تلگرام، ایمیل جیمیل یا پست اینستاگرام/یوتیوب و صدور شناسه تایید برای مالک'
      },
      'send_telegram_message': {
        id: 'send_telegram_message',
        name: 'ارسال پیام به تلگرام پس از تایید مالک',
        nameEn: 'Send Telegram Message (Owner Approved)',
        riskLevel: 'HIGH',
        requiresApproval: true,
        timeoutMs: 12000,
        description: 'ارسال پیام به کانال یا چت تلگرام مشروط به ارائه شناسه تایید معتبر مالک'
      },
      'list_pending_approvals': {
        id: 'list_pending_approvals',
        name: 'مشاهده درخواست‌های در انتظار تایید مالک',
        nameEn: 'List Pending Approvals',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 5000,
        description: 'لیست تمام پیش‌نویس‌ها و اقداماتی که منتظر تایید «با اجازه خودم» هستند'
      },

      // ── Agent-Reach: Read-Only Internet Research (Public Channels Only) ─────────
      // Source: github.com/Panniantong/Agent-Reach (MIT License, v1.6.1)
      // Channels enabled: web, github (public API), youtube (no login)
      // Channels disabled: twitter, reddit, instagram, xiaohongshu (login-required)
      'reach_web_search': {
        id: 'reach_web_search',
        name: 'جستجوی پیشرفته وب از طریق Agent-Reach',
        nameEn: 'Agent-Reach Web Search (Exa backend)',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 30000,
        description: 'جستجوی زنده در وب عمومی با استفاده از Agent-Reach (بکند Exa). بدون لاگین، فقط منابع عمومی. نتایج شامل URL، عنوان و متن واقعی صفحه است.'
      },
      'reach_web_read': {
        id: 'reach_web_read',
        name: 'خواندن محتوای URL عمومی از طریق Agent-Reach',
        nameEn: 'Agent-Reach Web Read (Jina/Exa backend)',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 30000,
        description: 'استخراج متن کامل یک صفحه وب عمومی از طریق Agent-Reach (بکند Jina یا Exa). بدون کوکی یا لاگین.'
      },
      'reach_github_search': {
        id: 'reach_github_search',
        name: 'جستجوی مخازن عمومی گیت‌هاب از طریق Agent-Reach',
        nameEn: 'Agent-Reach GitHub Search (public API)',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 30000,
        description: 'جستجو در مخازن، فایل‌ها و کد منبع عمومی گیت‌هاب از طریق Agent-Reach. فقط منابع عمومی، بدون توکن شخصی.'
      },
      'reach_github_read': {
        id: 'reach_github_read',
        name: 'خواندن مخزن یا Issue عمومی گیت‌هاب از طریق Agent-Reach',
        nameEn: 'Agent-Reach GitHub Read (public API)',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 30000,
        description: 'دریافت README، کد و مستندات یک مخزن عمومی گیت‌هاب یا خواندن متن Issue/PR از طریق Agent-Reach.'
      },
      'reach_youtube_search': {
        id: 'reach_youtube_search',
        name: 'جستجوی ویدیو در یوتیوب از طریق Agent-Reach',
        nameEn: 'Agent-Reach YouTube Search (yt-dlp)',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 30000,
        description: 'جستجوی ویدیوهای عمومی یوتیوب با متادیتا (عنوان، کانال، مدت، بازدید) از طریق Agent-Reach. بدون لاگین.'
      },
      'reach_youtube_read': {
        id: 'reach_youtube_read',
        name: 'دریافت متادیتای ویدیوی عمومی یوتیوب از طریق Agent-Reach',
        nameEn: 'Agent-Reach YouTube Read (yt-dlp)',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 30000,
        description: 'خواندن عنوان، توضیحات، کانال، تاریخ و آمار یک ویدیوی عمومی یوتیوب از طریق URL.'
      },
      'reach_youtube_subtitle': {
        id: 'reach_youtube_subtitle',
        name: 'استخراج زیرنویس ویدیوی عمومی یوتیوب از طریق Agent-Reach',
        nameEn: 'Agent-Reach YouTube Subtitle (yt-dlp)',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 40000,
        description: 'دریافت متن کامل زیرنویس (در صورت وجود) ویدیوهای عمومی یوتیوب بدون دانلود ویدیو. مفید برای تحقیق و تحلیل محتوا.'
      },
      'reach_research': {
        id: 'reach_research',
        name: 'تحقیق جامع آنلاین از طریق Agent-Reach',
        nameEn: 'Agent-Reach Research (auto-channel)',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 35000,
        description: 'متد تحقیق جامع ARTA که به صورت خودکار کانال مناسب (وب، گیت‌هاب، یوتیوب) را انتخاب کرده و نتایج واقعی با استناد به منبع برمی‌گرداند.'
      },
      'reach_health_check': {
        id: 'reach_health_check',
        name: 'بررسی سلامت کانال‌های Agent-Reach',
        nameEn: 'Agent-Reach Channel Health Check',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 60000,
        description: 'بررسی وضعیت زنده کانال‌های فعال Agent-Reach (وب، گیت‌هاب، یوتیوب) شامل latency واقعی و گزارش خطا برای هر کانال.'
      },

      // ── HezTech Council Tools ────────────────────────────────────────────────
      'deliberate_council': {
        id: 'deliberate_council',
        name: 'تشکیل جلسه و داوری شورای هفت‌نفره',
        nameEn: 'Convene 7-Agent Council Deliberation',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 90000,
        description: 'تشکیل رسمی جلسه شورای ۷ نفره (معمار، مهندس، امنیت، پژوهش، دوآپس، منتقد، داور) همراه با ارزیابی مستقل، نقد تیم قرمز و صدور رای قطعی داور.'
      },
      'consult_specialized_agent': {
        id: 'consult_specialized_agent',
        name: 'مشورت تخصصی با یکی از اعضای شورا',
        nameEn: 'Consult Council Specialist Agent',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 30000,
        description: 'مشورت مستقیم با یکی از اعضای متخصص شورا (architect, engineer, security, research, devops, critic, judge).'
      },
      'list_specialized_agents': {
        id: 'list_specialized_agents',
        name: 'فهرست اعضا و وضعیت شورای هفت‌گانه',
        nameEn: 'List Council Members and Statuses',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 5000,
        description: 'دریافت فهرست نقش‌ها، حوزه‌های تمرکز، مدل‌ها و وضعیت عملیاتی اعضای شورای هفت‌گانه.'
      },
      'media_probe': {
        id: 'media_probe',
        name: 'بررسی مشخصات فنی ویدیو و صدا',
        nameEn: 'Media File Inspector & Probe',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 30000,
        description: 'استخراج مشخصات دقیق ویدیو شامل مدت زمان، رزولوشن، نرخ فریم، کدک و کانال‌های صوتی.'
      },
      'media_trim': {
        id: 'media_trim',
        name: 'برش و جداسازی بخش مشخصی از ویدیو',
        nameEn: 'Video Trim & Clip Extractor',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 120000,
        description: 'برش دقیق بازه زمانی از ویدیو و خروجی باکیفیت MP4 بدون تغییر فایل اصلی.'
      },
      'media_remove_silence': {
        id: 'media_remove_silence',
        name: 'حذف خودکار سکوت و مکث‌های اضافه',
        nameEn: 'Automated Silence & Pause Remover',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 180000,
        description: 'تشخیص هوشمند گپ‌های صوتی و حذف مکث‌های زائد از ویدیو با رندر مستقیم MP4.'
      },
      'media_persian_subtitles': {
        id: 'media_persian_subtitles',
        name: 'تولید و سوختن زیرنویس فارسی راست‌چین',
        nameEn: 'Persian RTL Subtitle Burner',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 180000,
        description: 'شکل‌دهی صحیح کلمات فارسی و الصاق زیرنویس راست‌چین به ویدیو با فونت استاندارد.'
      },
      'media_change_aspect': {
        id: 'media_change_aspect',
        name: 'تغییر نسبت تصویر (افقی یوتیوب / عمودی ریلز)',
        nameEn: 'Aspect Ratio Converter',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 180000,
        description: 'تبدیل ویدیوی افقی ۱۶:۹ به عمودی ۹:۱۶ برای ریلز و شورتز همراه با پس‌زمینه محو یا برش.'
      },
      'media_enhance_audio': {
        id: 'media_enhance_audio',
        name: 'بهبود صدای گوینده و نرمال‌سازی EBU R128',
        nameEn: 'Voice Enhancer & Audio Normalizer',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 120000,
        description: 'حذف نویزهای فرکانس پایین و تنظیم استاندارد سطح بلندی صدا برای انتشار.'
      },
      'media_export_capcut': {
        id: 'media_export_capcut',
        name: 'صادرات پروژه به نرم‌افزار دسکتاپ CapCut',
        nameEn: 'Export Project to CapCut Desktop',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 30000,
        description: 'ایجاد پروژه کامل CapCut با ساختار رسمی draft_content.json جهت ادامه ویرایش در CapCut.'
      },
      'media_project_manager': {
        id: 'media_project_manager',
        name: 'مدیریت و ذخیره‌سازی پروژه‌های تدوین',
        nameEn: 'Media Projects Store Manager',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 15000,
        description: 'ذخیره، بازخوانی و فهرست‌برداری پروژه‌های تدوین ویدیو در والت محلی.'
      },
      'media_merge_clips': {
        id: 'media_merge_clips',
        name: 'ادغام و اتصال کلیپ‌های ویدیویی',
        nameEn: 'Video Clips Merger',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 180000,
        description: 'اتصال و پیوند چند کلیپ ویدیویی به یک ویدیوی یکپارچه با هماهنگ‌سازی رزولوشن و صدا.'
      },
      'media_export_preset': {
        id: 'media_export_preset',
        name: 'خروجی استاندارد ویدیو با پریست‌های حرفه‌ای',
        nameEn: 'Professional Video Preset Exporter',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 180000,
        description: 'خروجی متناسب برای ریلز/استوری، یوتیوب افقی، شورتز و وب با تنظیم بهینه بیت‌ریت و انکودینگ.'
      },
      'social_discover_trends': {
        id: 'social_discover_trends',
        name: 'کشف ترندها و موضوعات داغ شبکه‌های اجتماعی',
        nameEn: 'Social Trends & Discovery Engine',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 20000,
        description: 'جستجو و تحلیل ترندها، فرمت‌های وایرال و الگوهای پربازدید در اینستاگرام، یوتیوب، تیک‌تاک و اکس.'
      },
      'social_competitor_analysis': {
        id: 'social_competitor_analysis',
        name: 'تحلیل عملکرد و الگوی رقبای تجاری',
        nameEn: 'Competitor Intelligence Analyzer',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 25000,
        description: 'بررسی ریتم انتشار، فرمت‌ها و ساختار محتوای رقبا در چارچوب قوانین رسمی پلتفرم‌ها.'
      },
      'social_content_intelligence': {
        id: 'social_content_intelligence',
        name: 'هوشمندی محتوا و ارزیابی هوک و رونوشت',
        nameEn: 'Content & Hook Intelligence',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 15000,
        description: 'امتیازدهی هوک ویدیو، ساختار روایت (مشکل-راه‌حل-دعوت به اقدام) و پیشنهاد ارتقای تعامل.'
      },
      'social_analytics_report': {
        id: 'social_analytics_report',
        name: 'گزارش تحلیلی رشد و تعامل شبکه‌های اجتماعی',
        nameEn: 'Social Analytics & Growth Reporter',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 15000,
        description: 'محاسبه نرخ تعامل، پربازدیدترین فرمت‌ها و ثبت تاریخچه تحلیل در والت محلی.'
      },
      'social_prepare_publication': {
        id: 'social_prepare_publication',
        name: 'آماده‌سازی پیش‌نویس انتشار با دروازه تایید',
        nameEn: 'Social Publishing Assistant (Draft & Approval)',
        riskLevel: 'HIGH',
        requiresApproval: false,
        timeoutMs: 15000,
        description: 'بررسی تطابق فنی کپشن و مدیا و ایجاد شناسه تایید غیرقابل جعل برای انتشار.'
      },
      'social_execute_publish': {
        id: 'social_execute_publish',
        name: 'اجرای انتشار پست یا ارائه مسیر رسمی وب',
        nameEn: 'Execute Publication / Official Web Route',
        riskLevel: 'HIGH',
        requiresApproval: true,
        timeoutMs: 30000,
        description: 'انتشار رسمی در پلتفرم‌های دارای توکن معتبر پس از تایید مالک یا هدایت به پرتال رسمی آپلود.'
      },
      'treg_catalog_search': {
        id: 'treg_catalog_search',
        name: 'جستجوی ابزارهای هوشمند در کاتالوگ Treg',
        nameEn: 'Treg Tool Catalog Search',
        riskLevel: 'LOW',
        requiresApproval: false,
        timeoutMs: 20000,
        description: 'جستجوی ابزارهای تخصصی بر اساس وظیفه با امکان فال‌بک خودکار به ابزارهای محلی.'
      },
      'treg_call_tool': {
        id: 'treg_call_tool',
        name: 'فراخوانی ابزار کاتالوگ Treg با سقف هزینه',
        nameEn: 'Call Treg Gateway Tool with Cost Cap',
        riskLevel: 'MEDIUM',
        requiresApproval: false,
        timeoutMs: 25000,
        description: 'اجرای کنترل‌شده ابزارهای بیرونی از طریق پروکسی امن Treg با اعمال سقف هزینه و لاگ حسابرسی.'
      }
    };
  }

  /**
   * Return registry of tools with permissions & availability
   */
  getAvailableTools() {
    return Object.values(this.toolsRegistry).map(tool => ({
      ...tool,
      active: true,
      pendingTasksCount: Array.from(this.activeTasks.values()).filter(t => t.tool === tool.id).length
    }));
  }

  /**
   * Test connection and roundtrip latency for configured AI models
   */
  async testModelConnection(modelId) {
    const startTime = Date.now();
    const cfg = ConfigManager.load() || {};

    if (modelId === 'local-offline-brain') {
      const latencyMs = Date.now() - startTime + Math.floor(Math.random() * 5);
      return {
        success: true,
        modelId,
        provider: 'HezTech (Offline Executive Brain)',
        status: 'online',
        latencyMs,
        verified: true,
        message: 'هسته آفلاین محلی هستک در دسترس و پاسخگو است.'
      };
    }

    let targetModel = modelId || 'gemini-3.5-flash-lite';
    if (targetModel === 'ai_models' || targetModel === 'ai') {
      targetModel = 'gemini-3.5-flash-lite';
    }
    const apiKey = ConfigManager.getDecryptedApiKey() || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        modelId: targetModel,
        provider: 'Google GenAI (Cloud)',
        status: 'unconfigured',
        latencyMs: 0,
        verified: false,
        error: 'کلید API برای Gemini تنظیم نشده است.'
      };
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const candidates = [
        targetModel,
        'gemini-3.5-flash-lite',
        'gemini-3.8-flash',
        'gemini-3.1-flash-lite'
      ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

      let lastError = null;
      for (const candidate of candidates) {
        try {
          const res = await Promise.race([
            ai.models.generateContent({
              model: candidate,
              contents: 'ping',
              config: { maxOutputTokens: 5 }
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout (45s)')), 45000))
          ]);

          const latencyMs = Date.now() - startTime;
          return {
            success: true,
            modelId: candidate,
            provider: 'Google GenAI (Cloud)',
            status: 'online',
            latencyMs,
            verified: true,
            message: `اتصال ابری به مدل ${candidate} برقرار است (تاخیر: ${latencyMs}ms).`
          };
        } catch (callErr) {
          lastError = callErr;
        }
      }

      throw lastError || new Error('تمام مدل‌های ابری با خطا مواجه شدند.');
    } catch (err) {
      return {
        success: false,
        modelId: targetModel,
        provider: 'Google GenAI (Cloud)',
        status: 'error',
        latencyMs: Date.now() - startTime,
        verified: false,
        error: err.message
      };
    }

    return {
      success: false,
      modelId,
      status: 'unknown_model',
      error: `مدل ناشناخته: ${modelId}`
    };
  }

  /**
   * Cancel an in-flight tool execution task
   */
  cancelTask(taskId) {
    if (!this.activeTasks.has(taskId)) {
      return { success: false, error: 'تسک یافت نشد یا قبلاً به پایان رسیده است.' };
    }
    const task = this.activeTasks.get(taskId);
    if (task.abortController) {
      task.abortController.abort();
    }
    clearTimeout(task.timeoutHandle);
    this.activeTasks.delete(taskId);
    SecurityManager.logAudit('TOOL_TASK_CANCELLED', { taskId, tool: task.tool });
    return { success: true, taskId, message: 'تسک با موفقیت لغو شد.' };
  }

  /**
   * Controlled invocation of any registered tool with permission checks, timeout, and cancellation
   */
  async invokeTool(toolName, params = {}, options = {}) {
    const toolDef = this.toolsRegistry[toolName];
    if (!toolDef) {
      return { success: false, error: `ابزار نامعتبر: ${toolName}` };
    }

    const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const abortController = new AbortController();
    const timeoutMs = options.timeoutMs || toolDef.timeoutMs || 10000;
    const startTime = Date.now();

    // Register active task
    const taskRecord = {
      id: taskId,
      tool: toolName,
      startTime,
      abortController,
      timeoutHandle: null
    };
    this.activeTasks.set(taskId, taskRecord);

    try {
      // 1. Permission Evaluation & Security Gate
      let requiresApproval = toolDef.requiresApproval;
      let approvalReason = '';
      let riskLevel = toolDef.riskLevel;

      if (toolName === 'exec_cmd') {
        const cmd = params.command || '';
        const evalRes = SecurityManager.evaluateCommand(cmd);
        if (!evalRes.allowed) {
          if (evalRes.riskLevel === 'CRITICAL') {
            SecurityManager.logAudit('TOOL_BLOCKED_CRITICAL', { tool: toolName, cmd });
            throw new Error(`خطای امنیتی: اجرای دستور به دلیل ریسک بحرانی مسدود شد (${evalRes.reason})`);
          }
          requiresApproval = true;
          approvalReason = evalRes.reason;
          riskLevel = evalRes.riskLevel || 'HIGH';
        } else {
          requiresApproval = false;
        }
      } else if (toolName === 'app_launcher') {
        const appName = (params.app || '').toLowerCase();
        if (!APP_ALLOWLIST[appName]) {
          requiresApproval = true;
          approvalReason = `برنامه «${appName}» در لیست سفید تاییدشده قرار ندارد.`;
          riskLevel = 'MEDIUM';
        }
      }

      // 2. Human Approval Gate — owner approval only, bound to this exact payload.
      //    There is no renderer-supplied bypass: `skipApprovalCheck` no longer exists.
      if (requiresApproval) {
        const approval = SecurityManager.consumeApproval({ tool: toolName, params });

        if (!approval.ok) {
          const binding = SecurityManager.hashBinding(toolName, params);
          const record = SecurityManager.findPendingByBinding(binding) ||
            SecurityManager.createApproval({
              type: `TOOL_${String(toolName).toUpperCase()}`,
              tool: toolName,
              params,
              riskLevel
            });
          SecurityManager.logAudit('TOOL_APPROVAL_REQUIRED', { taskId, tool: toolName, approvalId: record.id });
          return {
            success: false,
            blocked: true,
            requiresApproval: true,
            approvalId: record.id,
            taskId,
            tool: toolName,
            riskLevel,
            reason: approvalReason || 'این عملیات نیازمند تایید رسمی کاربر در پنل امنیتی است.'
          };
        }
      }

      // 3. Execution with Timeout & Abort Signal
      const execPromise = this._executeToolLogic(toolName, params, abortController.signal);
      const timeoutPromise = new Promise((_, reject) => {
        taskRecord.timeoutHandle = setTimeout(() => {
          abortController.abort();
          reject(new Error(`زمان اجرای ابزار ${toolName} پس از ${timeoutMs}ms به پایان رسید (Timeout).`));
        }, timeoutMs);
      });

      const result = await Promise.race([execPromise, timeoutPromise]);
      const durationMs = Date.now() - startTime;

      SecurityManager.logAudit('TOOL_EXECUTED', { taskId, tool: toolName, durationMs });
      return {
        success: true,
        taskId,
        tool: toolName,
        durationMs,
        result
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      SecurityManager.logAudit('TOOL_EXECUTION_FAILED', { taskId, tool: toolName, error: err.message, durationMs });
      return {
        success: false,
        taskId,
        tool: toolName,
        durationMs,
        error: err.message
      };
    } finally {
      clearTimeout(taskRecord.timeoutHandle);
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * Internal implementation of tool operations
   */
  async _executeToolLogic(toolName, params, signal) {
    if (signal.aborted) throw new Error('عملیات لغو شده است.');

    switch (toolName) {
      case 'system_telemetry': {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const cpus = os.cpus();
        return {
          cpuModel: cpus[0]?.model || 'Generic CPU',
          cpuCores: cpus.length,
          totalMemoryGB: (totalMem / (1024 ** 3)).toFixed(2),
          usedMemoryGB: (usedMem / (1024 ** 3)).toFixed(2),
          memoryUsagePercent: Math.round((usedMem / totalMem) * 100),
          uptimeHours: (os.uptime() / 3600).toFixed(1),
          platform: process.platform,
          arch: process.arch
        };
      }

      case 'list_directory': {
        const targetDir = path.resolve(String(params.path || 'C:\\'));
        if (SecurityManager.isProtectedPath(targetDir)) throw new Error('این مسیر محافظت‌شده است.');
        if (!fs.existsSync(targetDir)) throw new Error('مسیر وجود ندارد: ' + targetDir);
        const entries = fs.readdirSync(targetDir, { withFileTypes: true }).slice(0, 300);
        const items = entries.map(e => {
          const full = path.join(targetDir, e.name);
          let size = null;
          if (e.isFile()) { try { size = fs.statSync(full).size; } catch (err) {} }
          return { name: e.name, type: e.isDirectory() ? 'dir' : 'file', sizeBytes: size };
        });
        let disk = null;
        try {
          const s = fs.statfsSync(targetDir);
          disk = { totalGB: +((s.blocks * s.bsize) / 1024 ** 3).toFixed(1), freeGB: +((s.bavail * s.bsize) / 1024 ** 3).toFixed(1) };
        } catch (e) {}
        return { path: targetDir, count: items.length, truncated: entries.length >= 300, items, disk };
      }

      case 'read_file': {
        const requested = String(params.path || params.name || '').trim();
        if (!requested) throw new Error('مسیر یا نام فایل مشخص نشده است.');
        let target = path.resolve(requested);
        if (!fs.existsSync(target)) {
          // «فایل README را بخوان» — نام را در ریشه‌های مجاز جستجو می‌کنیم.
          const home = os.homedir();
          const bases = [path.join(home, 'Desktop'), path.join(home, 'Documents'), path.join(home, 'Downloads'), 'C:\\Users\\Green\\openclaw\\jarvis-command-center', 'C:\\Users\\Green\\openclaw'];
          const base = String(path.basename(requested));
          for (const dir of bases) {
            try {
              const hit = fs.readdirSync(dir).find(n => n.toLowerCase() === base.toLowerCase() || n.toLowerCase().startsWith(base.toLowerCase() + '.'));
              if (hit) { target = path.join(dir, hit); break; }
            } catch (e) {}
          }
        }
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error('فایل پیدا نشد: ' + requested);
        if (SecurityManager.isProtectedPath(target)) throw new Error('این مسیر محافظت‌شده است.');
        if (fs.statSync(target).size > 200000) throw new Error('فایل بزرگ‌تر از ۲۰۰ کیلوبایت است.');
        if (!['.txt','.md','.json','.js','.mjs','.cjs','.ts','.tsx','.css','.html','.csv','.log','.yml','.yaml','.xml'].includes(path.extname(target).toLowerCase())) {
          throw new Error('فقط فایل‌های متنی خوانده می‌شوند.');
        }
        const content = fs.readFileSync(target, 'utf-8');
        return { path: target, sizeBytes: fs.statSync(target).size, content: content.slice(0, 4000), truncated: content.length > 4000 };
      }

      case 'check_port': {
        const port = parseInt(params.port, 10);
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('شمارهٔ پورت نامعتبر است.');
        const netstat = execSync('netstat -ano -p tcp', { encoding: 'utf8', timeout: 8000, windowsHide: true });
        const listeners = netstat.split('\n').map(l => l.trim()).filter(l =>
          l.startsWith('TCP') && /LISTENING/i.test(l) && new RegExp(`[:.]${port}\\s`).test(l));
        const results = listeners.map(line => {
          const pid = parseInt(line.split(/\s+/).pop(), 10);
          let processName = null;
          if (Number.isInteger(pid)) {
            try {
              const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8', timeout: 8000, windowsHide: true });
              const first = out.split('\n')[0];
              if (first && !/INFO:/.test(first)) processName = first.split('","')[0].replace(/"/g, '');
            } catch (e) {}
          }
          return { local: line.split(/\s+/)[1], pid, processName };
        });
        return { port, listening: results.length > 0, listeners: results };
      }

      case 'disk_info': {
        const drive = String(params.drive || 'C').toUpperCase().replace(/[^A-Z]/g, '') || 'C';
        const target = `${drive}:\\`;
        if (!fs.existsSync(target)) throw new Error('درایو پیدا نشد: ' + target);
        let usage = null;
        try {
          const s = fs.statfsSync(target);
          const total = (s.blocks * s.bsize) / 1024 ** 3;
          const free = (s.bavail * s.bsize) / 1024 ** 3;
          usage = { totalGB: +total.toFixed(1), freeGB: +free.toFixed(1), usedGB: +(total - free).toFixed(1), usedPercent: Math.round(((total - free) / total) * 100) };
        } catch (e) { throw new Error('خواندن وضعیت درایو ناموفق بود: ' + e.message); }
        const entries = fs.readdirSync(target, { withFileTypes: true }).slice(0, 60);
        const folders = entries.filter(e => e.isDirectory() && !e.name.startsWith('$')).map(e => e.name);
        return { drive: target, usage, rootFolders: folders };
      }

      case 'project_overview': {
        const projects = {
          heztech: 'C:\\Users\\Green\\openclaw\\jarvis-command-center',
          openclaw: 'C:\\Users\\Green\\openclaw'
        };
        const key = String(params.project || 'heztech').toLowerCase();
        const root = projects[key];
        if (!root || !fs.existsSync(root)) throw new Error('پروژهٔ شناخته‌شده نیست: ' + key);
        const pkgPath = path.join(root, 'package.json');
        if (!fs.existsSync(pkgPath)) throw new Error('package.json پیدا نشد.');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return {
          project: key,
          root,
          name: pkg.name,
          version: pkg.version,
          dependencies: Object.keys(pkg.dependencies || {}),
          devDependencies: Object.keys(pkg.devDependencies || {}),
          scripts: Object.keys(pkg.scripts || {}),
          nodeModulesInstalled: fs.existsSync(path.join(root, 'node_modules')),
          packageJsonModified: fs.statSync(pkgPath).mtime.toISOString()
        };
      }

      case 'write_file': {
        const safeName = String(params.name || 'test.txt').replace(/[^a-zA-Z0-9._\u0600-\u06FF-]/g, '_');
        if (safeName.includes('..')) throw new Error('نام فایل نامعتبر است.');
        const dir = path.join(os.homedir(), 'Documents', 'HezTech-Files');
        fs.mkdirSync(dir, { recursive: true });
        const target = path.join(dir, safeName);
        const content = String(params.content ?? 'فایل آزمایشی ساخته‌شده توسط ARTA در ' + new Date().toISOString());
        fs.writeFileSync(target, content, 'utf-8');
        return { path: target, sizeBytes: Buffer.byteLength(content, 'utf-8'), exists: fs.existsSync(target) };
      }

      case 'edit_file': {
        const target = path.resolve(String(params.path || ''));
        if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error('فایل پیدا نشد: ' + target);
        if (SecurityManager.isProtectedPath(target)) throw new Error('این مسیر محافظت‌شده است.');
        if (fs.statSync(target).size > 200000) throw new Error('فایل بزرگ‌تر از ۲۰۰ کیلوبایت است.');
        const find = String(params.find ?? '');
        const replacement = String(params.replace ?? '');
        if (!find) throw new Error('عبارت جستجو خالی است.');
        const original = fs.readFileSync(target, 'utf-8');
        const count = original.split(find).length - 1;
        if (count === 0) throw new Error('عبارت پیدا نشد.');
        const backup = `${target}.bak-${Date.now()}`;
        fs.copyFileSync(target, backup);
        const updated = params.all ? original.split(find).join(replacement) : original.replace(find, replacement);
        fs.writeFileSync(target, updated, 'utf-8');
        return { path: target, occurrences: count, replaced: params.all ? count : 1, backup, newSizeBytes: Buffer.byteLength(updated, 'utf-8') };
      }

      case 'file_search': {
        const query = String(params.query || '').trim();
        if (query.length < 2) throw new Error('عبارت جستجو باید حداقل ۲ کاراکتر باشد.');

        const home = os.homedir();
        // The app data directory is a protected root and is deliberately NOT
        // searched. The owner can widen the scope explicitly with an env list.
        const configured = String(process.env.HEZTECH_FILE_SEARCH_ROOTS || '')
          .split(';')
          .map(item => item.trim())
          .filter(Boolean);
        const roots = (configured.length ? configured : [
          path.join(home, 'Desktop'),
          path.join(home, 'Documents'),
          path.join(home, 'Downloads')
        ]).filter(dir => {
          try { return fs.existsSync(dir); } catch (e) { return false; }
        });

        const maxResults = Math.min(200, Number(params.limit) || 50);
        const maxDepth = Math.min(6, Number(params.maxDepth) || 4);
        const matches = [];
        let scanned = 0;
        let truncated = false;
        const stack = roots.map(dir => ({ dir, depth: 0 }));

        while (stack.length) {
          if (signal.aborted) throw new Error('عملیات لغو شده است.');
          if (scanned > 20000 || matches.length >= maxResults) { truncated = true; break; }

          const { dir, depth } = stack.pop();
          let entries = [];
          try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }

          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (SecurityManager.isProtectedPath(full)) continue;

            if (entry.isDirectory()) {
              if (/^(node_modules|\.git|System32|Windows|AppData)$/i.test(entry.name)) continue;
              if (depth < maxDepth) stack.push({ dir: full, depth: depth + 1 });
              continue;
            }
            if (!entry.isFile()) continue;

            scanned += 1;
            if (!entry.name.toLowerCase().includes(query.toLowerCase())) continue;

            let stat;
            try { stat = fs.statSync(full); } catch (e) { continue; }
            matches.push({
              name: entry.name,
              path: full,
              sizeBytes: stat.size,
              modifiedAt: stat.mtime.toISOString()
            });
          }
        }

        return { query, roots, scanned, count: matches.length, truncated, matches };
      }

      case 'durable_tasks': {
        const store = getDurableTaskStore();
        const action = params.action || 'summary';
        if (action === 'summary') {
          return store.summary();
        }
        if (action === 'list') {
          return { tasks: store.listTasks({ state: params.state || null, limit: params.limit || 50 }) };
        }
        if (action === 'create') {
          const task = store.createTask({
            title: params.title,
            payload: params.payload || {},
            requiresApproval: Boolean(params.requiresApproval),
            costCapUsd: Number(params.costCapUsd) || 0
          });
          return { task };
        }
        if (action === 'recover') {
          const recovered = store.recoverOrphans();
          return { recoveredCount: recovered.length, recovered };
        }
        if (action === 'history') {
          return { entries: store.runHistory(params.taskId || null) };
        }
        if (action === 'verify_log') {
          return store.verifyRunLog();
        }
        throw new Error('عملیات ناشناخته برای وظایف ماندگار: ' + action);
      }

      case 'calc_math': {
        const expr = String(params.expression || '').trim();
        if (!expr) throw new Error('عبارت ریاضی مشخص نشده است.');
        if (!/^[0-9\.\s\+\-\*\/\(\)\^%]+$/.test(expr) || /[a-zA-Z]/.test(expr)) {
          throw new Error('عبارت ریاضی نامعتبر یا شامل کاراکترهای غیرمجاز است.');
        }
        const val = Function(`'use strict'; return (${expr})`)();
        return { expression: expr, result: val };
      }

      case 'vault_tasks': {
        const action = params.action || 'list';
        let tasks = [];
        if (fs.existsSync(TASKS_FILE)) {
          try { tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8')) || []; } catch(e){}
        }
        if (action === 'list') {
          return { count: tasks.length, tasks };
        } else if (action === 'add') {
          const title = params.title || 'کار جدید';
          const newTask = {
            id: 't_' + Date.now(),
            title,
            time: 'Today',
            priority: params.priority || 'medium',
            done: false
          };
          tasks.unshift(newTask);
          fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
          return { added: newTask, count: tasks.length };
        } else if (action === 'toggle') {
          const t = tasks.find(x => x.id === params.id);
          if (!t) throw new Error('تسک با این شناسه یافت نشد.');
          t.done = !t.done;
          fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
          return { updated: t };
        } else if (action === 'delete') {
          tasks = tasks.filter(x => x.id !== params.id);
          fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
          return { success: true, count: tasks.length };
        }
        throw new Error(`عملیات ناشناخته تسک: ${action}`);
      }

      case 'vault_notes': {
        const action = params.action || 'read';
        if (action === 'read') {
          if (!fs.existsSync(NOTES_FILE)) return { content: '' };
          return { content: fs.readFileSync(NOTES_FILE, 'utf-8') };
        } else if (action === 'append') {
          const text = params.text || '';
          fs.appendFileSync(NOTES_FILE, `\n\n## [${new Date().toLocaleString()}]\n${text}`, 'utf-8');
          return { appended: true, length: text.length };
        }
        throw new Error(`عملیات نامعتبر یادداشت: ${action}`);
      }

      case 'app_launcher': {
        const appKey = (params.app || '').toLowerCase();
        const target = APP_ALLOWLIST[appKey];
        if (!target) throw new Error(`برنامه مجاز برای «${appKey}» تعریف نشده است.`);
        return new Promise((resolve, reject) => {
          exec(target, (err) => {
            if (err) return reject(new Error(`خطا در باز کردن برنامه: ${err.message}`));
            resolve({ launched: appKey, command: target });
          });
        });
      }

      case 'network_ping': {
        const host = params.host || '8.8.8.8';
        if (!['8.8.8.8', '1.1.1.1', 'dns.google'].includes(host)) {
          throw new Error('پینگ تنها برای مقاصد استاندارد DNS مجاز است.');
        }
        return new Promise((resolve, reject) => {
          exec(`ping ${host} -n 2`, { timeout: 8000 }, (err, stdout) => {
            if (err) return reject(new Error(`خطای شبکه در پینگ: ${err.message}`));
            const timeMatch = stdout.match(/Average = (\d+ms)/i) || stdout.match(/متوسط = (\d+ms)/i);
            resolve({
              host,
              output: stdout.trim(),
              averageLatency: timeMatch ? timeMatch[1] : 'OK'
            });
          });
        });
      }

      case 'exec_cmd': {
        const cmd = params.command || '';
        return new Promise((resolve, reject) => {
          exec(cmd, { timeout: 12000 }, (err, stdout, stderr) => {
            if (err && !stdout) {
              return reject(new Error(stderr || err.message));
            }
            resolve({
              command: cmd,
              stdout: SecurityManager.sanitizeSecrets(stdout || ''),
              stderr: SecurityManager.sanitizeSecrets(stderr || '')
            });
          });
        });
      }

      case 'search_web': {
        // Single owner: all outbound search/fetch goes through web-tools validation.
        const query = params.query || '';
        const limit = params.limit || 5;
        return await webTools.webSearch(query, limit);
      }

      case 'fetch_web_content': {
        // Single owner: SSRF validation, redirect re-validation and IP checks live here.
        const url = params.url || '';
        return await webTools.webFetch(url, params.maxChars || 5000);
      }

      case 'instagram_intel': {
        const topic = params.topic || '';
        const enc = encodeURIComponent(`instagram ${topic} viral trends content`);
        const resp = await fetch(`https://html.duckduckgo.com/html/?q=${enc}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          signal
        });
        const html = await resp.text();
        const results = [];
        const snippetMatches = [...html.matchAll(/class="result__snippet[^>]*>([\s\S]*?)<\/a>/g)];
        const titleMatches = [...html.matchAll(/class="result__title[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
        for (let i = 0; i < Math.min(titleMatches.length, 4); i++) {
          results.push({
            title: titleMatches[i][2].replace(/<[^>]+>/g, '').trim(),
            url: titleMatches[i][1],
            snippet: snippetMatches[i] ? snippetMatches[i][1].replace(/<[^>]+>/g, '').trim() : ''
          });
        }
        return {
          topic,
          liveTrends: results,
          suggestedHashtags: [`#${topic.replace(/\s+/g, '_')}`, '#هوش_مصنوعی', '#ایران', '#تکنولوژی', '#اکسپلور', '#اینستاگرام', '#وایرال']
        };
      }

      case 'instagram_reels_script':
        return instagramSkills.generateReelsScript(params);

      case 'instagram_caption_linter':
        return instagramSkills.lintAndHumanizeCaption(params);

      case 'instagram_viral_research':
        return instagramSkills.researchViralPatterns(params);

      case 'instagram_content_plan':
        return instagramSkills.generateWeeklyPlan(params);

      case 'instagram_profile_optimizer':
        return instagramSkills.auditProfileBio(params);

      case 'instagram_repurpose_content':
        return instagramSkills.repurposeContent(params);

      case 'instagram_dm_comment_drafter':
        return instagramSkills.draftReplies(params);

      case 'instagram_carousel_architect':
        return instagramSkills.buildCarouselPost(params);

      case 'browser_navigate':
        return await mcpBrowserClient.navigate(params.url, params.agentId || 'master');

      case 'browser_snapshot':
        return await mcpBrowserClient.snapshot(params.agentId || 'master');

      case 'browser_click':
        return await mcpBrowserClient.click(params.selector || params.target, params.agentId || 'master');

      case 'browser_type':
        return await mcpBrowserClient.type(params.selector || params.target, params.text, params.agentId || 'master');

      case 'browser_take_screenshot':
        return await mcpBrowserClient.takeScreenshot(params.filename, params.agentId || 'master');

      case 'browser_console_messages':
        return await mcpBrowserClient.getConsoleMessages(params.agentId || 'master');

      case 'browser_network_requests':
        return await mcpBrowserClient.getNetworkRequests(params.agentId || 'master');

      case 'browser_close':
        return await mcpBrowserClient.close(params.agentId || 'master');

      case 'service_integrations_status':
        return await serviceIntegrations.probeAllServices();

      case 'draft_external_action':
        return await serviceIntegrations.requestActionApproval(params);

      case 'send_telegram_message':
        return await serviceIntegrations.sendTelegramMessage(params);

      case 'list_pending_approvals':
        return SecurityManager.getPendingApprovals();

      // ── Agent-Reach: Read-Only Public Internet Research ─────────────────────
      case 'reach_web_search':
        return await agentReach.webSearch(params.query || params.q || '', { timeoutMs: 28000 });

      case 'reach_web_read':
        return await agentReach.webRead(params.url || params.query || '', { timeoutMs: 28000 });

      case 'reach_github_search':
        return await agentReach.githubSearch(params.query || params.q || '', { timeoutMs: 28000 });

      case 'reach_github_read':
        return await agentReach.githubRead(params.url || params.query || '', { timeoutMs: 28000 });

      case 'reach_youtube_search':
        return await agentReach.youtubeSearch(params.query || params.q || '', { timeoutMs: 28000 });

      case 'reach_youtube_read':
        return await agentReach.youtubeRead(params.url || params.query || '', { timeoutMs: 28000 });

      case 'reach_youtube_subtitle':
        return await agentReach.youtubeSubtitle(params.url || params.query || '', { timeoutMs: 38000 });

      case 'reach_research':
        return await agentReach.research({
          query: params.query || params.q || '',
          channel: params.channel || 'auto',
          action: params.action || 'search',
          timeoutMs: 33000
        });

      case 'reach_health_check':
        return await agentReach.healthCheck(true);

      // ── Council Deliberation and Consultation ─────────────────────────────
      case 'deliberate_council':
        return await CouncilEngine.deliberate({
          title: params.title || params.topic || 'بررسی تخصصی ماموریت شورا',
          description: params.description || params.query || '',
          mode: params.mode || 'DEEP',
          context: params.context || {}
        });

      case 'consult_specialized_agent':
        return await CouncilEngine.consultAgent(
          params.agentRole || params.role || params.agent || 'architect',
          params.prompt || params.query || params.message || ''
        );

      case 'list_specialized_agents':
        return CouncilEngine.getRoles();

      // ── Unified Media Studio & Video Editing Pipeline ──────────────────────
      case 'media_probe':
        return await unifiedMediaEngine.probe(params.inputPath || params.path || params.file);

      case 'media_trim':
        return await unifiedMediaEngine.trim({
          inputPath: params.inputPath || params.path,
          startSec: params.startSec || params.start || 0,
          durationSec: params.durationSec || params.duration,
          name: params.name
        });

      case 'media_remove_silence':
        return await unifiedMediaEngine.removeSilence({
          inputPath: params.inputPath || params.path,
          noiseThresholdDb: params.noiseThresholdDb || -30,
          minSilenceDurationSec: params.minSilenceDurationSec || 0.5,
          name: params.name
        });

      case 'media_persian_subtitles':
        return await unifiedMediaEngine.addPersianSubtitles({
          inputPath: params.inputPath || params.path,
          subtitles: params.subtitles || [],
          fontName: params.fontName || 'Arial',
          fontSize: params.fontSize || 24,
          name: params.name
        });

      case 'media_change_aspect':
        return await unifiedMediaEngine.changeAspectRatio({
          inputPath: params.inputPath || params.path,
          targetRatio: params.targetRatio || params.ratio || '9:16',
          mode: params.mode || 'pad',
          name: params.name
        });

      case 'media_enhance_audio':
        return await unifiedMediaEngine.enhanceAudio({
          inputPath: params.inputPath || params.path,
          normalize: params.normalize !== false,
          name: params.name
        });

      case 'media_export_capcut':
        return await unifiedMediaEngine.exportCapCutDraft({
          projectName: params.projectName || params.name,
          videoPath: params.videoPath || params.path,
          subtitles: params.subtitles || [],
          durationSec: params.durationSec
        });

      case 'media_project_manager':
        if (params.action === 'save') return unifiedMediaEngine.saveProject(params.project);
        if (params.action === 'load') return unifiedMediaEngine.loadProject(params.projectId || params.id);
        return { success: true, projects: unifiedMediaEngine.listProjects() };

      case 'media_merge_clips':
        return await unifiedMediaEngine.mergeClips({
          clipPaths: params.clipPaths || params.clips || [],
          name: params.name
        });

      case 'media_export_preset':
        return await unifiedMediaEngine.exportPreset({
          inputPath: params.inputPath || params.path,
          preset: params.preset || 'instagram_reel',
          name: params.name
        });

      case 'social_discover_trends':
        return await socialIntelligence.discoverTrends(params);

      case 'social_competitor_analysis':
        return await socialIntelligence.analyzeCompetitor(params);

      case 'social_content_intelligence':
        if (params.hook) return socialIntelligence.analyzeHook(params.hook);
        if (params.transcript) return socialIntelligence.analyzeTranscript(params.transcript);
        return { success: false, error: 'پارامتر hook یا transcript مشخص نشده است.' };

      case 'social_analytics_report':
        return await socialIntelligence.getAnalytics(params);

      case 'social_prepare_publication':
        return await socialIntelligence.preparePublication(params);

      case 'social_execute_publish':
        return await socialIntelligence.executePublish(params);

      case 'treg_catalog_search':
        return await tregAdapter.searchCatalog(params);

      case 'treg_call_tool':
        return await tregAdapter.callTool(params);

      default:
        throw new Error(`منطق پیاده‌سازی ابزار ${toolName} یافت نشد.`);
    }
  }
}

module.exports = new ToolManager();
