/**
 * JARVIS Scientific Agent Skills Connector
 * Interfaces with K-Dense-AI scientific tools in C:\Users\Green\.gemini\config\plugins\science\skills via uv run.
 */

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const SKILLS_BASE = path.resolve('C:\\Users\\Green\\.gemini\\config\\plugins\\science\\skills');
const TEMP_DIR = path.join(process.env.HEZTECH_DATA_DIR || path.join(require('os').homedir(), 'openclaw', 'stack', 'data', 'heztech-workspace'), 'temp');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

class ScienceConnector {
  constructor() {
    this.skillsPath = SKILLS_BASE;
  }

  /**
   * Search scientific literature on arXiv using search_arxiv.py
   */
  async searchArxiv(query, maxResults = 5) {
    const script = path.join(this.skillsPath, 'literature_search_arxiv', 'scripts', 'search_arxiv.py');
    if (!fs.existsSync(script)) {
      return { success: false, error: 'اسکریپت arXiv در سیستم یافت نشد.' };
    }

    const safeQuery = query.replace(/["']/g, '');
    const cmd = `uv run "${script}" --query "${safeQuery}" --max_results ${maxResults}`;

    return new Promise((resolve) => {
      exec(cmd, { timeout: 25000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          return resolve({ success: false, error: stderr || err.message });
        }
        try {
          const json = JSON.parse(stdout);
          resolve({ success: true, count: json.length, results: json });
        } catch (e) {
          resolve({ success: true, raw: stdout });
        }
      });
    });
  }

  /**
   * Resolve chemical name or compound to CID and SMILES using pubchem_api.py
   */
  async resolveChemical(name) {
    const script = path.join(this.skillsPath, 'pubchem_database', 'scripts', 'pubchem_api.py');
    if (!fs.existsSync(script)) {
      return { success: false, error: 'اسکریپت PubChem در سیستم یافت نشد.' };
    }

    const safeName = name.replace(/["']/g, '');
    const outPath = path.join(TEMP_DIR, `pubchem_${Date.now()}.json`);
    const cmd = `uv run "${script}" resolve --name "${safeName}" --output "${outPath}"`;

    return new Promise((resolve) => {
      exec(cmd, { timeout: 25000 }, (err, stdout, stderr) => {
        if (err && !fs.existsSync(outPath)) {
          return resolve({ success: false, error: stderr || err.message });
        }
        try {
          if (fs.existsSync(outPath)) {
            const data = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
            fs.unlinkSync(outPath); // Clean up
            return resolve({ success: true, data });
          }
          resolve({ success: false, error: 'داده‌ای از PubChem دریافت نشد' });
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      });
    });
  }

  /**
   * Search proteins in UniProt using uniprot_tools.py
   */
  async searchProtein(query, limit = 5) {
    const script = path.join(this.skillsPath, 'uniprot_database', 'scripts', 'uniprot_tools.py');
    if (!fs.existsSync(script)) {
      return { success: false, error: 'اسکریپت UniProt در سیستم یافت نشد.' };
    }

    const safeQuery = query.replace(/["']/g, '');
    const cmd = `uv run "${script}" search "${safeQuery}" --limit ${limit}`;

    return new Promise((resolve) => {
      exec(cmd, { timeout: 25000, maxBuffer: 1024 * 1024 * 2 }, (err, stdout, stderr) => {
        if (err) {
          return resolve({ success: false, error: stderr || err.message });
        }
        try {
          const json = JSON.parse(stdout);
          resolve({ success: true, results: json.results || json });
        } catch (e) {
          resolve({ success: true, raw: stdout.slice(0, 2000) });
        }
      });
    });
  }

  /**
   * Get specific protein entry by UniProt Accession ID (e.g. P04637)
   */
  async getProtein(accession) {
    const script = path.join(this.skillsPath, 'uniprot_database', 'scripts', 'uniprot_tools.py');
    if (!fs.existsSync(script)) {
      return { success: false, error: 'اسکریپت UniProt در سیستم یافت نشد.' };
    }

    const safeId = accession.trim().replace(/["']/g, '');
    const cmd = `uv run "${script}" get "${safeId}"`;

    return new Promise((resolve) => {
      exec(cmd, { timeout: 25000, maxBuffer: 1024 * 1024 * 2 }, (err, stdout, stderr) => {
        if (err) {
          return resolve({ success: false, error: stderr || err.message });
        }
        try {
          const json = JSON.parse(stdout);
          resolve({ success: true, data: json });
        } catch (e) {
          resolve({ success: true, raw: stdout.slice(0, 2000) });
        }
      });
    });
  }

  /**
   * Status of available scientific modules.
   */
  getSkillsInventory() {
    try {
      if (fs.existsSync(this.skillsPath)) {
        const list = fs.readdirSync(this.skillsPath, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);
        return {
          totalSkills: list.length,
          skills: list,
          uvAvailable: true
        };
      }
    } catch (e) {}
    return { totalSkills: 0, skills: [], uvAvailable: false };
  }
}

module.exports = new ScienceConnector();
