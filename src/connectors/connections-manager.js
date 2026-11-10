/**
 * HesaTech Stage E Integration Architecture — Connections Topology Manager
 * Probes real providers, local services, and system subsystems without hardcoded statuses.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const ConfigManager = require('../core/config');
const ToolManager = require('../core/tools');
const webTools = require('../core/web-tools');
const serviceIntegrations = require('./service-integrations');

const VAULT_DIR = path.resolve(process.env.HEZTECH_DATA_DIR || 'C:\\Users\\Green\\openclaw\\vault');

class ConnectionsManager {
  constructor() {
    this.lastTopology = null;
    this.lastProbed = null;
  }

  /**
   * Probes real system, AI model, local bridge, and vault connections.
   * Returns truthful operational statuses.
   */
  async getTopology() {
    const cfg = ConfigManager.load() || {};
    const timestamp = new Date().toISOString();

    // 1. Probe AI Models (Cloud Gemini & Local Brain)
    let aiStatus = 'disconnected';
    let aiLatency = 0;
    try {
      const modelCheck = await ToolManager.testModelConnection('gemini-3.5-flash-lite');
      if (modelCheck && modelCheck.success) {
        aiStatus = 'connected';
        aiLatency = modelCheck.latencyMs;
      } else {
        aiStatus = 'configured_offline';
      }
    } catch (e) {
      aiStatus = 'error';
    }

    // 1b. Probe Live Internet Connectivity (WebTools)
    let inetStatus = 'disconnected';
    let inetLatency = 0;
    try {
      const inetCheck = await webTools.checkInternetConnectivity(2500);
      inetStatus = inetCheck.online ? 'connected' : 'disconnected';
      inetLatency = inetCheck.latencyMs || 0;
    } catch {
      inetStatus = 'disconnected';
    }

    // 2. Probe Windows Subsystem
    const winStatus = os.platform() === 'win32' ? 'connected' : 'unsupported_os';

    // 3. Probe Vault Storage Subsystem
    let vaultStatus = 'disconnected';
    try {
      if (fs.existsSync(VAULT_DIR)) {
        // Verify write access
        const probeFile = path.join(VAULT_DIR, '.probe');
        fs.writeFileSync(probeFile, 'health', 'utf-8');
        fs.unlinkSync(probeFile);
        vaultStatus = 'connected';
      }
    } catch (e) {
      vaultStatus = 'error';
    }

    // 4. Probe Local Web Server / Bridge Port (18790)
    let webStatus = 'disconnected';
    try {
      const res = await fetch('http://127.0.0.1:18790', {
        method: 'GET',
        signal: AbortSignal.timeout(1500)
      });
      if (res.ok || res.status === 404) webStatus = 'connected';
    } catch (e) {
      webStatus = 'disconnected';
    }

    // 5. Probe n8n Email & Cloud Webhook
    let emailCloudStatus = 'disconnected';
    if (cfg.n8nUrl) {
      try {
        const res = await fetch(`${cfg.n8nUrl}/healthz`, {
          method: 'GET',
          signal: AbortSignal.timeout(1500)
        });
        emailCloudStatus = res.ok ? 'connected' : 'needs_setup';
      } catch (e) {
        emailCloudStatus = 'needs_setup'; // Unreachable / pending setup
      }
    } else {
      emailCloudStatus = 'needs_setup';
    }

    // 6. External Services (Google, Telegram, Instagram, YouTube) & Permission Gate
    const services = await serviceIntegrations.probeAllServices();

    // 7. Probe CapCut Bridge & Desktop
    let capcutStatus = 'disconnected';
    let capcutDetails = 'قرارداد پل ارتباطی CapCut پاسخ نداده است';
    try {
      const capcutConnector = require('./capcut-bridge-connector');
      const cc = await capcutConnector.getStatus();
      if (cc && cc.success && cc.bridgeConnected) {
        capcutStatus = 'connected';
        capcutDetails = cc.statusText;
      }
    } catch {
      capcutStatus = 'disconnected';
    }

    const topology = {
      timestamp,
      core: {
        id: 'heztech_core',
        name: 'HezTech Core (هسته هستک)',
        status: 'connected',
        color: '#00e5ff',
        details: 'Local Electron Executive Runtime'
      },
      nodes: {
        ai_models: {
          id: 'gemini-3.5-flash-lite',
          name: 'مدل‌های هوش مصنوعی هستک (Gemini Cloud)',
          provider: 'Google GenAI (Gemini 3.5 Flash-Lite)',
          status: aiStatus,
          latencyMs: aiLatency,
          color: aiStatus === 'connected' ? '#10b981' : '#f59e0b',
          details: aiStatus === 'connected' ? `Live Cloud (${aiLatency}ms)` : 'Offline Fallback Active'
        },
        windows_os: {
          id: 'windows_os',
          name: 'Windows Subsystem',
          provider: 'Microsoft Windows x64',
          status: winStatus,
          color: '#10b981',
          details: `OS: ${os.platform()} ${os.release()} (${os.arch()})`
        },
        projects_vault: {
          id: 'projects_vault',
          name: 'Vault Projects',
          provider: 'Local Obsidian Vault',
          status: vaultStatus,
          color: vaultStatus === 'connected' ? '#10b981' : '#ef4444',
          details: `Path: ${VAULT_DIR}`
        },
        websites: {
          id: 'websites',
          name: 'اینترنت زنده و وب (Live Internet)',
          provider: 'Real Internet Access (WebTools)',
          status: inetStatus,
          latencyMs: inetLatency,
          color: inetStatus === 'connected' ? '#10b981' : '#ef4444',
          details: inetStatus === 'connected' ? `آنلاین (${inetLatency}ms)` : 'آفلاین'
        },
        capcut_bridge: {
          id: 'capcut_bridge',
          name: 'استودیو تدوین CapCut (Bridge Kit)',
          provider: 'CapCut Bridge contract (local)',
          status: capcutStatus,
          color: capcutStatus === 'connected' ? '#10b981' : '#ef4444',
          details: capcutDetails
        },
        permission_gate: {
          id: 'permission_gate',
          name: services.permission_gate.name,
          provider: services.permission_gate.provider,
          status: services.permission_gate.status,
          color: '#10b981',
          details: services.permission_gate.details
        },
        google_account: {
          id: 'google_account',
          name: services.google.name,
          provider: services.google.provider,
          status: services.google.status,
          color: services.google.status === 'connected' ? '#10b981' : '#f59e0b',
          details: services.google.details
        },
        telegram: {
          id: 'telegram',
          name: services.telegram.name,
          provider: services.telegram.provider,
          status: services.telegram.status,
          color: services.telegram.status === 'connected' ? '#10b981' : '#f59e0b',
          details: services.telegram.details
        },
        instagram: {
          id: 'instagram',
          name: services.instagram.name,
          provider: services.instagram.provider,
          status: services.instagram.status,
          color: services.instagram.status === 'connected' ? '#10b981' : '#f59e0b',
          details: services.instagram.details
        },
        youtube: {
          id: 'youtube',
          name: services.youtube.name,
          provider: services.youtube.provider,
          status: services.youtube.status,
          color: services.youtube.status === 'connected' ? '#10b981' : '#f59e0b',
          details: services.youtube.details
        },
        email_cloud: {
          id: 'email_cloud',
          name: 'Email & Cloud (n8n Automation)',
          provider: cfg.n8nUrl || 'n8n Webhooks',
          status: emailCloudStatus,
          color: emailCloudStatus === 'connected' ? '#10b981' : '#f59e0b',
          details: emailCloudStatus === 'connected' ? 'سرور اتوماسیون محلی فعال است' : 'نیازمند راه‌اندازی سرور محلی n8n'
        }
      }
    };

    this.lastTopology = topology;
    this.lastProbed = timestamp;
    return topology;
  }
}

module.exports = new ConnectionsManager();
