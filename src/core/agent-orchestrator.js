/**
 * HesaTech Agent Orchestrator
 * Autonomous Executive Multi-Turn Agent Loop with Full Windows System Access & Gemini Function Calling
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { GoogleGenAI } = require('@google/genai');
const IDENTITY = require('./identity');
const ConfigManager = require('./config');
const { SecurityManager } = require('./security');
const instagramSkills = require('./instagram-skills');
const webTools = require('./web-tools');
const mcpBrowserClient = require('./mcp-browser-client');
const CouncilEngine = require('../council/council-engine');
const serviceIntegrations = require('../connectors/service-integrations');

const VAULT_DIR = path.resolve(process.env.HEZTECH_DATA_DIR || 'C:\\Users\\Green\\openclaw\\vault');
const TASKS_FILE = path.join(VAULT_DIR, 'tasks.json');
const SEC_MGR = SecurityManager;

// Function Declarations for Gemini Tools
const AGENT_FUNCTION_DECLARATIONS = [
  {
    name: 'run_command',
    description: 'Execute a command in Windows PowerShell or CMD. Use for inspecting system state, directory operations, network checks, compiling, and running tools.',
    parameters: {
      type: 'OBJECT',
      properties: {
        command: { type: 'STRING', description: 'The exact command line string to execute in Windows shell.' },
        cwd: { type: 'STRING', description: 'Optional working directory. Defaults to C:\\Users\\Green\\openclaw\\jarvis-command-center' }
      },
      required: ['command']
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file on the local Windows filesystem.',
    parameters: {
      type: 'OBJECT',
      properties: {
        filePath: { type: 'STRING', description: 'Absolute or relative path to the file to read.' },
        startLine: { type: 'INTEGER', description: 'Optional 1-based start line.' },
        endLine: { type: 'INTEGER', description: 'Optional 1-based end line.' }
      },
      required: ['filePath']
    }
  },
  {
    name: 'write_file',
    description: 'Create a new file or overwrite an existing file on the local Windows filesystem.',
    parameters: {
      type: 'OBJECT',
      properties: {
        filePath: { type: 'STRING', description: 'Absolute or relative path to the target file.' },
        content: { type: 'STRING', description: 'Text content to write into the file.' }
      },
      required: ['filePath', 'content']
    }
  },
  {
    name: 'edit_file',
    description: 'Edit a file by replacing a unique target substring with new replacement text.',
    parameters: {
      type: 'OBJECT',
      properties: {
        filePath: { type: 'STRING', description: 'Path to the file to modify.' },
        target: { type: 'STRING', description: 'The exact character sequence to replace.' },
        replacement: { type: 'STRING', description: 'The new replacement text.' }
      },
      required: ['filePath', 'target', 'replacement']
    }
  },
  {
    name: 'list_directory',
    description: 'List contents of a directory on the local Windows filesystem.',
    parameters: {
      type: 'OBJECT',
      properties: {
        dirPath: { type: 'STRING', description: 'Directory path to list. Defaults to current directory.' },
        maxItems: { type: 'INTEGER', description: 'Maximum number of entries to return (default 50).' }
      }
    }
  },
  {
    name: 'get_system_telemetry',
    description: 'Get real-time Windows system metrics: CPU model and utilization, RAM total and free, and drive C storage.',
    parameters: {
      type: 'OBJECT',
      properties: {
        detailLevel: {
          type: 'STRING',
          description: 'Level of detail: standard or full',
          enum: ['standard', 'full']
        }
      }
    }
  },
  {
    name: 'manage_vault_tasks',
    description: 'Manage tasks and missions stored in the local Obsidian Vault.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: { type: 'STRING', enum: ['list', 'add', 'toggle', 'delete'], description: 'Action to perform on tasks.' },
        title: { type: 'STRING', description: 'Task title for adding.' },
        id: { type: 'STRING', description: 'Task ID for toggle or delete.' },
        priority: { type: 'STRING', enum: ['high', 'medium', 'low'], description: 'Priority for new task.' }
      },
      required: ['action']
    }
  },
  {
    name: 'launch_app',
    description: 'Launch an approved Windows desktop application (calc, notepad, explorer, taskmgr).',
    parameters: {
      type: 'OBJECT',
      properties: {
        appName: { type: 'STRING', description: 'Application identifier, e.g. calc, notepad, taskmgr, explorer' }
      },
      required: ['appName']
    }
  },
  {
    name: 'web_search',
    description: 'Search the live internet and web for articles, market data, news, current facts, and real-time information. Returns real titles, clean direct URLs, snippets, and retrieval timestamp.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'The search query to look up on the live web.' },
        limit: { type: 'INTEGER', description: 'Maximum number of results to return (default 5).' }
      },
      required: ['query']
    }
  },
  {
    name: 'web_fetch',
    description: 'Fetch and extract the readable plain text content of any public URL or webpage on the internet with SSRF protection.',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: { type: 'STRING', description: 'The public web URL to fetch content from.' },
        maxChars: { type: 'INTEGER', description: 'Maximum characters of text to extract (default 8000).' }
      },
      required: ['url']
    }
  },
  {
    name: 'browse_page',
    description: 'Browse and render a public webpage using an isolated browser session to extract dynamic JavaScript-rendered content with SSRF protection.',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: { type: 'STRING', description: 'The public web URL to browse and render.' },
        maxChars: { type: 'INTEGER', description: 'Maximum characters of text to extract (default 8000).' }
      },
      required: ['url']
    }
  },
  {
    name: 'search_web',
    description: 'Search the live internet and web (alias for web_search).',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'The search query to look up on the live web.' },
        limit: { type: 'INTEGER', description: 'Maximum number of results to return (default 5).' }
      },
      required: ['query']
    }
  },
  {
    name: 'fetch_web_content',
    description: 'Fetch the text content of any public URL or webpage on the internet (alias for web_fetch).',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: { type: 'STRING', description: 'The web URL to fetch content from.' }
      },
      required: ['url']
    }
  },
  {
    name: 'instagram_intel',
    description: 'Instagram and social media assistant: research viral trends, generate optimized captions, carousels, and hashtag strategies.',
    parameters: {
      type: 'OBJECT',
      properties: {
        topic: { type: 'STRING', description: 'Topic or niche for Instagram content analysis or post generation.' },
        format: { type: 'STRING', enum: ['post', 'reel_script', 'carousel', 'hashtags', 'trends'], description: 'Format to produce.' }
      },
      required: ['topic']
    }
  },
  {
    name: 'instagram_reels_script',
    description: 'Generate high-retention Instagram Reels script with 26 scored viral hook formulas, second-by-second storyboard, B-roll text, audio cues, and CTA.',
    parameters: {
      type: 'OBJECT',
      properties: {
        topic: { type: 'STRING', description: 'Topic of the Reel.' },
        targetAudience: { type: 'STRING', description: 'Target audience.' },
        tone: { type: 'STRING', description: 'Tone of voice.' }
      },
      required: ['topic']
    }
  },
  {
    name: 'instagram_caption_linter',
    description: 'Lint and humanize Instagram captions. Strips AI clichés, optimizes line breaks, drafts scroll-stopping hook lines, and adds converting CTAs.',
    parameters: {
      type: 'OBJECT',
      properties: {
        draftCaption: { type: 'STRING', description: 'The draft caption text to clean and elevate.' },
        goal: { type: 'STRING', description: 'Goal of the caption (e.g. sales, engagement, save).' }
      },
      required: ['draftCaption']
    }
  },
  {
    name: 'instagram_viral_research',
    description: 'Analyze viral patterns, top-performing hooks, video angles, and audio trends in a specific Instagram niche.',
    parameters: {
      type: 'OBJECT',
      properties: {
        niche: { type: 'STRING', description: 'Industry or niche to research.' }
      },
      required: ['niche']
    }
  },
  {
    name: 'instagram_content_plan',
    description: 'Generate a strategic 7-day Instagram content matrix calendar with formats, themes, hooks, and story synergy.',
    parameters: {
      type: 'OBJECT',
      properties: {
        niche: { type: 'STRING', description: 'The business niche or topic.' },
        primaryGoal: { type: 'STRING', description: 'Primary goal: follower growth, authority, or direct sales.' }
      },
      required: ['niche']
    }
  },
  {
    name: 'instagram_profile_optimizer',
    description: 'Audit and optimize an Instagram profile/bio for maximum visitor-to-follower conversion (SEO name, 4-line bio, highlights).',
    parameters: {
      type: 'OBJECT',
      properties: {
        username: { type: 'STRING', description: 'Instagram handle or page name.' },
        currentBio: { type: 'STRING', description: 'Current bio text.' },
        niche: { type: 'STRING', description: 'Niche of the account.' }
      },
      required: ['niche']
    }
  },
  {
    name: 'instagram_repurpose_content',
    description: 'Repurpose existing long-form content, blog articles, or rough notes into Instagram Reels scripts, carousel slides, or story sequences.',
    parameters: {
      type: 'OBJECT',
      properties: {
        sourceText: { type: 'STRING', description: 'The original content to repurpose.' },
        targetFormat: { type: 'STRING', enum: ['کاروسل اسلایدی', 'سناریوی ریلز', 'استوری زنجیره‌ای'], description: 'Target format.' }
      },
      required: ['sourceText']
    }
  },
  {
    name: 'instagram_dm_comment_drafter',
    description: 'Draft smart, personalized responses for Instagram DMs and comments that convert followers to leads without sounding robotic.',
    parameters: {
      type: 'OBJECT',
      properties: {
        incomingText: { type: 'STRING', description: 'The incoming comment or direct message.' },
        context: { type: 'STRING', description: 'Context: sales, customer support, casual engagement.' }
      },
      required: ['incomingText']
    }
  },
  {
    name: 'instagram_carousel_architect',
    description: 'Design a high-save multi-slide Instagram carousel post with hook slide, retention indicators, and CTA slide.',
    parameters: {
      type: 'OBJECT',
      properties: {
        topic: { type: 'STRING', description: 'Topic of the carousel.' },
        slideCount: { type: 'INTEGER', description: 'Number of slides (default 7).' }
      },
      required: ['topic']
    }
  },
  // --- Microsoft Playwright MCP Browser Tools ---
  {
    name: 'browser_navigate',
    description: 'Navigate the real Microsoft Playwright browser to a public web URL. Validates against SSRF (blocks localhost and private IPs) and returns page title and status.',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: { type: 'STRING', description: 'The public web URL to navigate to.' }
      },
      required: ['url']
    }
  },
  {
    name: 'browser_snapshot',
    description: 'Capture textual snapshot and accessibility tree of the currently loaded page in the Playwright browser.',
    parameters: {
      type: 'OBJECT',
      properties: {
        target: { type: 'STRING', description: 'Optional target element reference or selector.' }
      }
    }
  },
  {
    name: 'browser_click',
    description: 'Click an element or link on the active page in the Playwright browser by selector or snapshot target.',
    parameters: {
      type: 'OBJECT',
      properties: {
        selector: { type: 'STRING', description: 'Target element selector or reference to click.' }
      },
      required: ['selector']
    }
  },
  {
    name: 'browser_type',
    description: 'Type text into an input field or textarea on the active page in the Playwright browser.',
    parameters: {
      type: 'OBJECT',
      properties: {
        selector: { type: 'STRING', description: 'Target element selector or reference.' },
        text: { type: 'STRING', description: 'Text to type into the element.' }
      },
      required: ['selector', 'text']
    }
  },
  {
    name: 'browser_take_screenshot',
    description: 'Take a screenshot of the currently loaded page in the Playwright browser and save to disk.',
    parameters: {
      type: 'OBJECT',
      properties: {
        filename: { type: 'STRING', description: 'Optional filename for the screenshot (e.g. screenshot.png).' }
      }
    }
  },
  {
    name: 'browser_console_messages',
    description: 'Retrieve logged console messages and runtime errors from the active browser session.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'browser_network_requests',
    description: 'Retrieve logged network HTTP requests and responses from the active browser session.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'browser_close',
    description: 'Close the Playwright browser session cleanly and terminate background processes.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  // --- HezTech Specialized Council Agents ---
  {
    name: 'consult_specialized_agent',
    description: 'Consult one of the 7 specialized council agents of HezTech (هستک) for deep domain analysis, technical assessment, security review, research, or operational execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        agentId: {
          type: 'STRING',
          enum: ['architect', 'engineer', 'security', 'research', 'devops', 'critic', 'judge', 'analytics', 'operations'],
          description: 'Identifier of the specialized council agent to consult.'
        },
        query: { type: 'STRING', description: 'The specific prompt, technical question, or task for the specialist agent.' }
      },
      required: ['agentId', 'query']
    }
  },
  {
    name: 'deliberate_council',
    description: 'Convene the HezTech Council of 7 specialized AI agents for formal multi-turn deliberation, cross-examination, and weighted judge verdict.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Title or objective of the deliberation.' },
        description: { type: 'STRING', description: 'Full description and context for the deliberation.' },
        mode: { type: 'STRING', enum: ['QUICK', 'DEEP', 'CRITICAL'], description: 'Deliberation depth (QUICK: 3 agents, DEEP: 7 agents, CRITICAL: 7 agents with strict security).' }
      },
      required: ['title', 'description']
    }
  },
  {
    name: 'list_specialized_agents',
    description: 'List all 7 specialized agents in the HezTech Council, their domains, focuses, models, and real-time operational status.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  // --- External Services & Human-in-the-Loop Permissions («با اجازه خودم») ---
  {
    name: 'service_integrations_status',
    description: 'Check truthful connection status of external services: Gmail, Google Account, Telegram, Instagram, YouTube, and the Owner Permission Gate.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'draft_external_action',
    description: 'Draft an external action (message for Telegram, email for Gmail, post for Instagram/YouTube) with strict Human-in-the-Loop approval («با اجازه خودم»). Generates a preview and an approvalId for the owner to review.',
    parameters: {
      type: 'OBJECT',
      properties: {
        platform: { type: 'STRING', enum: ['telegram', 'gmail', 'instagram', 'youtube'], description: 'Target platform.' },
        action: { type: 'STRING', enum: ['send_message', 'send_email', 'publish_post', 'upload_video'], description: 'Action type.' },
        recipient: { type: 'STRING', description: 'Recipient address, channel ID, or chat ID.' },
        title: { type: 'STRING', description: 'Subject or title.' },
        content: { type: 'STRING', description: 'Full body text or message content.' }
      },
      required: ['platform', 'action', 'content']
    }
  },
  {
    name: 'list_pending_approvals',
    description: 'List all actions currently waiting for the owner\'s explicit approval («با اجازه خودم»).',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'capcut_status',
    description: 'Probe the project-local CapCut Bridge contract and inspect the CapCut process. Process presence does not prove live editing.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'capcut_list_drafts',
    description: 'List all actual video editing drafts in CapCut Desktop with duration, tracks, and metadata.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'capcut_inspect_draft',
    description: 'Inspect a specific CapCut project draft to view timeline tracks, video materials, and text/subtitles.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Exact name of the CapCut draft (e.g. "تاب اورس در بحران قسمت اول فاینال1" or "1021").' }
      },
      required: ['name']
    }
  },
  {
    name: 'recall_memory',
    description: 'Recall previous conversations, owner instructions, recent chat history, notes, and stored knowledge from HezTech memory and vault. Use when asked what was previously discussed, what the owner said, or to search past dialogue.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Optional search keyword or topic (e.g. "capcut", "tasks", "previous conversation"). If omitted, returns recent dialogue turns.' },
        limit: { type: 'INTEGER', description: 'Maximum number of conversation turns or knowledge items to retrieve (default 10).' }
      }
    }
  }
];

class AgentOrchestrator {
  constructor() {
    this.defaultCwd = path.resolve('C:\\Users\\Green\\openclaw\\jarvis-command-center');
    this.tools = AGENT_FUNCTION_DECLARATIONS;
    this.activeAgentId = 'master';
  }

  /**
   * Execute a single tool call on the local Windows machine
   */
  async executeTool(name, args = {}) {
    console.log(`[AgentOrchestrator] Invoking tool: ${name} with args:`, JSON.stringify(args));
    try {
      if (name === 'run_command') {
        const cmd = args.command;

        // Security check
        const evalResult = SEC_MGR.evaluateCommand(cmd);
        if (!evalResult.allowed) {
          return { error: `Security Policy Violation: ${evalResult.reason}` };
        }

        // The working directory is part of the authorization surface: an allowlisted
        // listing command must not become a way to enumerate arbitrary directories.
        const cwdTarget = SecurityManager.normalizeTarget(this.defaultCwd, args.cwd || '.');
        if (!cwdTarget.ok) {
          return { blocked: true, error: `BLOCKED: ${cwdTarget.reason}` };
        }
        const cwd = cwdTarget.resolvedPath;

        return await new Promise((resolve) => {
          exec(cmd, { cwd, timeout: 30000, maxBuffer: 1024 * 1024 * 4 }, (err, stdout, stderr) => {
            const out = SecurityManager.sanitizeSecrets(stdout || '');
            const errOut = SecurityManager.sanitizeSecrets(stderr || '');
            resolve({
              stdout: out.length > 5000 ? out.substring(0, 5000) + '... [TRUNCATED]' : out,
              stderr: errOut.length > 2000 ? errOut.substring(0, 2000) + '... [TRUNCATED]' : errOut,
              exitCode: err ? (err.code || 1) : 0
            });
          });
        });
      }

      if (name === 'read_file') {
        const target = SecurityManager.normalizeTarget(this.defaultCwd, args.filePath);
        if (!target.ok) {
          return { blocked: true, error: `BLOCKED: ${target.reason}` };
        }
        const filePath = target.resolvedPath;
        if (!fs.existsSync(filePath)) {
          return { error: `File not found: ${filePath}` };
        }
        const text = fs.readFileSync(filePath, 'utf-8');
        const lines = text.split(/\r?\n/);
        const start = Math.max(1, args.startLine || 1);
        const end = Math.min(lines.length, args.endLine || lines.length);
        const sliced = lines.slice(start - 1, end).join('\n');
        return {
          filePath,
          totalLines: lines.length,
          startLine: start,
          endLine: end,
          content: sliced.length > 10000 ? sliced.substring(0, 10000) + '... [TRUNCATED]' : sliced
        };
      }

      if (name === 'write_file') {
        const target = SecurityManager.normalizeTarget(this.defaultCwd, args.filePath);
        if (!target.ok) {
          return { blocked: true, error: `BLOCKED: ${target.reason}` };
        }

        const filePath = target.resolvedPath;
        const params = { filePath, content: String(args.content ?? '') };
        const approval = SecurityManager.consumeApproval({ tool: 'write_file', params });

        if (!approval.ok) {
          const binding = SecurityManager.hashBinding('write_file', params);
          const record = SecurityManager.findPendingByBinding(binding) ||
            SecurityManager.createApproval({ type: 'TOOL_WRITE_FILE', tool: 'write_file', params, riskLevel: 'HIGH' });
          return {
            blocked: true,
            requiresApproval: true,
            approvalId: record.id,
            reason: 'نوشتن فایل نیازمند تأیید صریح مالک است. عملیات تا صدور مجوز اجرا نشد.'
          };
        }

        const parentDir = path.dirname(filePath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(filePath, params.content, 'utf-8');
        return { success: true, filePath, bytesWritten: Buffer.byteLength(params.content), approvalId: approval.id };
      }

      if (name === 'edit_file') {
        const target = SecurityManager.normalizeTarget(this.defaultCwd, args.filePath);
        if (!target.ok) {
          return { blocked: true, error: `BLOCKED: ${target.reason}` };
        }

        const filePath = target.resolvedPath;
        if (!fs.existsSync(filePath)) {
          return { error: `File not found: ${filePath}` };
        }

        const params = {
          filePath,
          target: String(args.target ?? ''),
          replacement: String(args.replacement ?? '')
        };
        const approval = SecurityManager.consumeApproval({ tool: 'edit_file', params });

        if (!approval.ok) {
          const binding = SecurityManager.hashBinding('edit_file', params);
          const record = SecurityManager.findPendingByBinding(binding) ||
            SecurityManager.createApproval({ type: 'TOOL_EDIT_FILE', tool: 'edit_file', params, riskLevel: 'HIGH' });
          return {
            blocked: true,
            requiresApproval: true,
            approvalId: record.id,
            reason: 'ویرایش فایل نیازمند تأیید صریح مالک است. عملیات تا صدور مجوز اجرا نشد.'
          };
        }

        // Re-read after authorization so the approved payload is what actually lands.
        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content.includes(params.target)) {
          return { error: 'Target string not found in file.' };
        }
        const updated = content.replace(params.target, params.replacement);
        fs.writeFileSync(filePath, updated, 'utf-8');
        return { success: true, filePath, approvalId: approval.id };
      }

      if (name === 'list_directory') {
        const target = SecurityManager.normalizeTarget(this.defaultCwd, args.dirPath || '.');
        if (!target.ok) {
          return { blocked: true, error: `BLOCKED: ${target.reason}` };
        }
        const dirPath = target.resolvedPath;
        if (!fs.existsSync(dirPath)) {
          return { error: `Directory not found: ${dirPath}` };
        }
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const max = args.maxItems || 50;
        const results = entries.slice(0, max).map(e => {
          let size = 0;
          try {
            const stat = fs.statSync(path.join(dirPath, e.name));
            size = stat.size;
          } catch(e){}
          return {
            name: e.name,
            isDirectory: e.isDirectory(),
            size
          };
        });
        return { dirPath, totalEntries: entries.length, entries: results };
      }

      if (name === 'get_system_telemetry') {
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        let disk = { totalGB: '0', freeGB: '0', percent: 0 };
        try {
          const stat = fs.statfsSync('C:\\');
          const total = stat.bsize * stat.blocks;
          const free = stat.bsize * stat.bfree;
          disk = {
            totalGB: (total / (1024**3)).toFixed(1),
            freeGB: (free / (1024**3)).toFixed(1),
            percent: Math.round(((total - free) / total) * 100)
          };
        } catch(e){}
        return {
          cpuModel: cpus[0]?.model || 'Processor',
          cpuCores: cpus.length,
          totalMemGB: (totalMem / (1024**3)).toFixed(1),
          usedMemPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
          disk,
          platform: `${os.type()} ${os.release()} (${os.arch()})`,
          uptimeHours: (os.uptime() / 3600).toFixed(1)
        };
      }

      if (name === 'manage_vault_tasks') {
        let tasks = [];
        if (fs.existsSync(TASKS_FILE)) {
          try { tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8')); } catch(e){}
        }
        if (args.action === 'list') {
          return { tasks };
        }
        if (args.action === 'add') {
          const newTask = {
            id: 'task_' + Date.now().toString(36),
            title: args.title || 'Untitled Mission',
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            priority: args.priority || 'medium',
            completed: false
          };
          tasks.unshift(newTask);
          fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
          return { success: true, task: newTask };
        }
        if (args.action === 'toggle') {
          const t = tasks.find(x => x.id === args.id);
          if (t) {
            t.completed = !t.completed;
            fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
            return { success: true, completed: t.completed };
          }
          return { error: 'Task ID not found' };
        }
        if (args.action === 'delete') {
          tasks = tasks.filter(x => x.id !== args.id);
          fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
          return { success: true };
        }
      }

      if (name === 'launch_app') {
        const apps = {
          'calc': 'calc.exe',
          'notepad': 'notepad.exe',
          'taskmgr': 'taskmgr.exe',
          'explorer': `explorer.exe "${this.defaultCwd}"`
        };
        const cmd = apps[String(args.appName || '').toLowerCase()];
        if (!cmd) return { error: 'Application is not on the approved launch list.' };
        exec(cmd);
        return { success: true, launched: args.appName };
      }

      if (name === 'web_search' || name === 'search_web') {
        const query = args.query;
        const limit = args.limit || 5;
        return await webTools.webSearch(query, limit);
      }

      if (name === 'web_fetch' || name === 'fetch_web_content') {
        const url = args.url;
        const maxChars = args.maxChars || 8000;
        return await webTools.webFetch(url, maxChars);
      }

      if (name === 'browse_page') {
        const url = args.url;
        const maxChars = args.maxChars || 8000;
        return await webTools.browsePage(url, maxChars);
      }

      if (name === 'instagram_intel') {
        const topic = args.topic;
        const format = args.format || 'post';
        const searchRes = await this.executeTool('search_web', { query: `instagram ${topic} viral trends content` });
        return {
          topic,
          format,
          recentWebIntel: searchRes.results || [],
          recommendations: 'Generate high-engagement Persian & English caption, hook, core value points, call-to-action and 15 targeted hashtags.'
        };
      }

      if (name === 'instagram_reels_script') {
        return await instagramSkills.generateReelsScript(args);
      }
      if (name === 'instagram_caption_linter') {
        return await instagramSkills.lintAndHumanizeCaption(args);
      }
      if (name === 'instagram_viral_research') {
        return await instagramSkills.researchViralPatterns(args);
      }
      if (name === 'instagram_content_plan') {
        return await instagramSkills.generateWeeklyPlan(args);
      }
      if (name === 'instagram_profile_optimizer') {
        return await instagramSkills.auditProfileBio(args);
      }
      if (name === 'instagram_repurpose_content') {
        return await instagramSkills.repurposeContent(args);
      }
      if (name === 'instagram_dm_comment_drafter') {
        return await instagramSkills.draftReplies(args);
      }
      if (name === 'instagram_carousel_architect') {
        return await instagramSkills.buildCarouselPost(args);
      }

      // --- Microsoft Playwright MCP Browser Tools Execution ---
      if (name === 'browser_navigate') {
        return await mcpBrowserClient.navigate(args.url, this.activeAgentId || 'master');
      }
      if (name === 'browser_snapshot') {
        return await mcpBrowserClient.snapshot(this.activeAgentId || 'master');
      }
      if (name === 'browser_click') {
        return await mcpBrowserClient.click(args.selector || args.target, this.activeAgentId || 'master');
      }
      if (name === 'browser_type') {
        return await mcpBrowserClient.type(args.selector || args.target, args.text, this.activeAgentId || 'master');
      }
      if (name === 'browser_take_screenshot') {
        return await mcpBrowserClient.takeScreenshot(args.filename, this.activeAgentId || 'master');
      }
      if (name === 'browser_console_messages') {
        return await mcpBrowserClient.getConsoleMessages(this.activeAgentId || 'master');
      }
      if (name === 'browser_network_requests') {
        return await mcpBrowserClient.getNetworkRequests(this.activeAgentId || 'master');
      }
      if (name === 'browser_close') {
        return await mcpBrowserClient.close(this.activeAgentId || 'master');
      }

      // --- HezTech Specialized Council Delegation ---
      if (name === 'consult_specialized_agent') {
        return await CouncilEngine.consultAgent(args.agentId, args.query);
      }
      if (name === 'deliberate_council') {
        return await CouncilEngine.deliberate({
          title: args.title,
          description: args.description,
          mode: args.mode || 'DEEP'
        });
      }
      if (name === 'list_specialized_agents') {
        return { agents: CouncilEngine.getRoles() };
      }

      // --- External Services & Human Approval Gate ---
      if (name === 'service_integrations_status') {
        return await serviceIntegrations.probeAllServices();
      }
      if (name === 'draft_external_action') {
        return await serviceIntegrations.requestActionApproval(args);
      }
      if (name === 'list_pending_approvals') {
        return { pending: SecurityManager.getPendingApprovals() };
      }
      if (name === 'capcut_status') {
        const capcut = require('../connectors/capcut-bridge-connector');
        return await capcut.getStatus();
      }
      if (name === 'capcut_list_drafts') {
        const capcut = require('../connectors/capcut-bridge-connector');
        return await capcut.listDrafts();
      }
      if (name === 'capcut_inspect_draft') {
        const capcut = require('../connectors/capcut-bridge-connector');
        return await capcut.inspectDraft(args.name);
      }
      if (name === 'recall_memory') {
        const memoryMgr = require('./memory');
        const limit = args.limit || 10;
        if (args.query && args.query.trim()) {
          const results = memoryMgr.searchConversations(args.query.trim(), limit);
          const knowledgeResults = memoryMgr.searchKnowledge(args.query.trim());
          return {
            success: true,
            query: args.query,
            totalFound: results.length + knowledgeResults.length,
            conversations: results,
            knowledge: knowledgeResults
          };
        } else {
          const recent = memoryMgr.getRecentHistory(limit);
          const notes = memoryMgr.getNotes().slice(0, 1000);
          return {
            success: true,
            recentConversationTurns: recent,
            vaultNotesPreview: notes
          };
        }
      }

      return { error: `Unknown tool: ${name}` };
    } catch(err) {
      return { error: err.message };
    }
  }

  buildSystemInstruction(agentId = 'master') {
    const isSpecialist = agentId && agentId !== 'master';
    const specialistContext = isSpecialist
      ? `You are currently acting in the role of or directly representing the «${agentId}» specialized agent within the 7-member HezTech Council.\n`
      : '';

    return specialistContext +
      `${IDENTITY.assistant.systemInstruction}\n` +
      `CRITICAL IDENTITY RULE: Your name is strictly ${IDENTITY.assistant.name} (${IDENTITY.assistant.nameFa}). ${IDENTITY.product.name} is the application product name. Even if older turns in the conversation history refer to a legacy name like 'HesaTech Assistant' or 'HezTech Assistant', you MUST always identify as ${IDENTITY.assistant.name} (${IDENTITY.assistant.nameFa}) and never as HezTech Assistant.\n` +
      'Tool names below describe capabilities that may be available. Do not infer access from this list; check the tools provided to the current request and report missing or failed tools honestly.\n' +
      '1. Real Playwright Browser: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_take_screenshot`, `browser_console_messages`, `browser_network_requests`, `browser_close`.\n' +
      '2. Live Internet Web Search & Fetch: `web_search`, `web_fetch`, `browse_page`.\n' +
      '3. Specialized Council Agents: `consult_specialized_agent`, `deliberate_council`, `list_specialized_agents` (Architect, Engineer, Security, Research, DevOps, Critic, Judge).\n' +
      '4. Windows System Telemetry & Control: `get_system_telemetry`, files, shell commands, vault missions.\n' +
      '5. External Integrations with Owner Permission Gate («با اجازه خودم»): use integration tools only when they are actually registered and enabled. Any implemented external action is strictly subject to explicit Human-in-the-Loop approval. You CANNOT approve external actions yourself—approval can ONLY be granted by the human owner via the UI security gate. Never claim an unsupported provider or operation is available.\n' +
      '6. CapCut Bridge & Video Studio: `capcut_status`, `capcut_list_drafts`, `capcut_inspect_draft`. Probe `capcut_status` before claiming connection. A running process or on-disk draft is not verified live timeline editing. Report unavailable operations honestly. For project requests, call the read-only listing or inspection tool and report its actual result.\n' +
      '7. Memory & Dialogue Recall: do not access or modify OpenClaw Vault or private conversations. Use only in-scope context available in the current HezTech session; do not claim memory or prior context that is not available.\n' +
      'CRITICAL - BROWSER AUTOMATION: When browser tools are available and the user asks to navigate or inspect a website, use the relevant tool and report its actual result. If tools are unavailable or fail, say so; never fabricate a visit or result.\n' +
      'CRITICAL - SPECIALIZED AGENTS: Preserve the seven-member Council. Consult a specialist only when available and justified; report unavailable agents honestly.\n' +
      'CRITICAL - LIVE INTERNET & WEB: Use web tools only when available. Cite source links and retrieval times only for sources actually retrieved; otherwise report the limitation.\n' +
      'CRITICAL - SYSTEM & HARDWARE: Use telemetry or file tools only when available and authorized. Report observed results only; never claim access or measurements you did not obtain.\n' +
      'SAFETY & SSRF: Never access localhost, loopback (127.0.0.1), private internal IP subnets, or metadata services. Never send private vault files or credentials to external websites.\n' +
      'Respond accurately, fluently, and helpfully in Persian (or English if the user prompts in English). Always explain clearly what actions were performed.';
  }

  /**
   * Run the full multi-turn autonomous agent loop with Gemini Function Calling
   */
  async runAgentLoop({ query, model = 'gemini-3.5-flash-lite', history = [], onToolCall = null, signal, agentId = 'master' }) {
    this.activeAgentId = agentId || 'master';
    const apiKey = ConfigManager.getDecryptedApiKey() || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key is not configured.');
    }

    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = this.buildSystemInstruction(agentId);
      'CRITICAL - SYSTEM & HARDWARE: Use telemetry or file tools only when available and authorized. Report observed results only; never claim access or measurements you did not obtain.\n' +
      'SAFETY & SSRF: Never access localhost, loopback (127.0.0.1), private internal IP subnets, or metadata services. Never send private vault files or credentials to external websites.\n' +
      'Respond accurately, fluently, and helpfully in Persian (or English if the user prompts in English). Always explain clearly what actions were performed.';

    // Construct contents from history (legacy self-identifications neutralised at prompt time only)
    const contents = [];
    for (const m of IDENTITY.sanitizeHistory(history).slice(-10)) {
      if (m.content) {
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        });
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: query }]
    });

    const currentModel = model;
    const executedToolsList = [];

    // Max 5 tool execution turns to prevent infinite loops
    for (let step = 0; step < 5; step++) {
      signal?.throwIfAborted();
      try {
        const candidateModels = [
          currentModel,
          'gemini-3.8-flash',
          'gemini-2.5-flash',
          'gemini-3.1-flash-lite',
          'gemini-3.5-flash-lite'
        ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

        let res = null;
        let lastErr = null;
        let successfulModel = currentModel;

        for (const targetModel of candidateModels) {
          try {
            res = await ai.models.generateContent({
              model: targetModel,
              contents,
              config: {
                abortSignal: signal,
                systemInstruction,
                tools: [{ functionDeclarations: AGENT_FUNCTION_DECLARATIONS }]
              }
            });
            successfulModel = targetModel;
            break;
          } catch (callErr) {
            lastErr = callErr;
            console.warn(`[AgentOrchestrator] Model ${targetModel} error (${callErr.message}), trying next in cascade...`);
          }
        }

        if (!res) throw lastErr;

        const candidate = res.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        const functionCalls = parts.filter(p => !!p.functionCall).map(p => p.functionCall);

        // If no function call, return final answer
        if (!functionCalls.length) {
          if (!res.text || !res.text.trim()) throw new Error('Selected model returned an empty response.');
          return {
            reply: res.text,
            toolsExecuted: executedToolsList,
            model: successfulModel,
            provider: 'gemini-agent'
          };
        }

        // Add model's functionCall turn to contents
        contents.push(candidate.content);

        // Execute each tool and collect responses
        const responseParts = [];
        for (const fc of functionCalls) {
          signal?.throwIfAborted();
          if (onToolCall) onToolCall(fc.name, fc.args);
          const toolResult = await this.executeTool(fc.name, fc.args);
          executedToolsList.push({ name: fc.name, args: fc.args, result: toolResult });
          responseParts.push({
            functionResponse: {
              name: fc.name,
              response: { result: toolResult }
            }
          });
        }

        // Add user functionResponse turn to contents
        contents.push({
          role: 'user',
          parts: responseParts
        });

      } catch (err) {
        console.warn(`[AgentOrchestrator] Turn error on ${currentModel}:`, err.message);
        throw err;
      }
    }

    throw new Error('Agent reached its tool-turn limit without a final answer. Some tools may already have run.');
  }
}

module.exports = new AgentOrchestrator();
