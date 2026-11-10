'use strict';

/**
 * Council report formatter.
 *
 * Kept out of main.js so the exact owner-facing contract can be unit tested:
 * seven roles, real evidence (model, duration, evidence count), no `undefined`
 * labels and no raw model scratchpad such as <think>…</think>.
 */

const IDENTITY = require('../core/identity');

const SEVEN_ROLES = Object.freeze(['architect', 'engineer', 'security', 'research', 'devops', 'critic', 'judge']);

function cleanCouncilText(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shorten(text, max) {
  const value = cleanCouncilText(text);
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function verdictLabel(verdict) {
  if (verdict === 'APPROVED') return 'تایید شد (APPROVED) ✅';
  if (verdict === 'REVISION_REQUIRED') return 'نیاز به اصلاح (REVISION_REQUIRED) ⚠️';
  if (verdict === 'REJECTED') return 'رد شد (REJECTED) ⛔';
  return 'نیاز به اصلاح / مشروط ⚠️';
}

function statusLabel(status) {
  if (status === 'completed') return 'تایید و تصویب شد ✅';
  if (status === 'awaiting_human_approval') return 'مشروط به تایید مالک ⚠️';
  return status || 'نامشخص';
}

/**
 * @param {object} session CouncilEngine session
 * @param {{productName?: string, maxAnalysisChars?: number}} [options]
 * @returns {string} Markdown report
 */
function formatCouncilReport(session, options = {}) {
  const productName = options.productName || IDENTITY.product.name;
  const maxAnalysisChars = options.maxAnalysisChars || 220;
  const verdict = (session && session.finalVerdict) || {};
  const rounds = (session && session.rounds) || [];
  const assessments = Array.isArray(rounds[0] && rounds[0].assessments) ? rounds[0].assessments : [];
  const crossExaminations = Array.isArray(session && session.crossExaminations) ? session.crossExaminations : [];

  const executed = new Set();
  for (const assessment of assessments) {
    const key = assessment.agent || assessment.role;
    if (key) executed.add(key);
  }
  if (crossExaminations.length) {
    executed.add(crossExaminations[0].agent || 'critic');
  }
  if (verdict.judge) {
    executed.add(typeof verdict.judge === 'string' ? verdict.judge : 'judge');
  }

  const lines = [
    `🏛️ **نتیجه جلسه رسمی شورای هفت‌نفره ${productName}:**`,
    '',
    `• **دستور جلسه:** ${session && session.title ? session.title : '—'}`,
    `• **شناسه نشست:** \`${(session && session.id) || '—'}\``,
    `• **وضعیت جلسه:** **${statusLabel(session && session.status)}**`,
    `• **رای داور:** **${verdictLabel(verdict.verdict)}** (امتیاز داوری: **${verdict.overallScore || 0}/100**)`,
    `• **نقش‌های اجراشده:** **${executed.size} از ۷**`,
    '',
    '📋 **ارزیابی و شواهد اعضای شورا:**'
  ];

  for (const assessment of assessments) {
    const roleLabel = assessment.title || assessment.roleTitle || assessment.agent || 'عضو شورا';
    const evidenceCount = Array.isArray(assessment.evidence) ? assessment.evidence.length : 0;
    const objectionCount = Array.isArray(assessment.objections) ? assessment.objections.length : 0;
    lines.push('');
    lines.push(
      `**${assessment.icon || '🔹'} ${roleLabel}:** ` +
      `(اطمینان: ${assessment.confidenceScore || 0}% | مدل: \`${assessment.model || assessment.modelUsed || 'council'}\` | زمان: ${assessment.durationMs || 0}ms | شواهد: ${evidenceCount} | اعتراض‌ها: ${objectionCount})`
    );
    lines.push(shorten(assessment.analysis, maxAnalysisChars));
  }

  if (crossExaminations[0]) {
    const cross = crossExaminations[0];
    const critique = cross.critique || (Array.isArray(cross.objections) ? cross.objections.join(' - ') : '');
    lines.push('');
    lines.push('**🛡️ نقد تیم قرمز (Critic):**');
    lines.push(shorten(critique || 'بررسی موشکافانه تضادها و چالش‌ها انجام شد.', maxAnalysisChars));
  }

  lines.push('');
  lines.push('**⚖️ جمع‌بندی داور شورا (Judge):**');
  lines.push(cleanCouncilText(verdict.summary) || 'طرح با لحاظ معیارهای پایداری، عملکرد و امنیت بررسی و تایید شد.');

  return lines.join('\n');
}

module.exports = { formatCouncilReport, cleanCouncilText, SEVEN_ROLES };
