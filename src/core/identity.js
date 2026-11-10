'use strict';

/**
 * Authoritative Identity Configuration for HezTech / ARTA
 *
 * Single Source of Truth across:
 * - Electron Main Process & Window title
 * - Renderer UI & Navigation labels
 * - Chat, Voice, Models, System Prompts, Fallbacks
 * - Seven-Agent Council Engine
 *
 * The owner-facing rule is simple: the product is HezTech, the assistant is
 * ARTA (اَرتا). Nothing else may introduce itself as the assistant.
 */

/**
 * Names the assistant used to answer with in older builds. They are kept here
 * for one reason only: to neutralise them at prompt-build time. Stored
 * conversation history is never rewritten on disk.
 */
const LEGACY_ASSISTANT_NAMES = Object.freeze([
  'HezTech Assistant',
  'HesaTech Assistant',
  'Hesatech Assistant',
  'HEZTECH ASSISTANT',
  'هساتک اسیستانت',
  'دستیار هساتک',
  'دستیار هستک'
]);

const ASSISTANT = Object.freeze({
  name: 'ARTA',
  nameFa: 'اَرتا',
  displayName: 'ARTA (اَرتا)',
  description: 'دستیار هوشمند درون برنامهٔ HezTech',
  descriptionEn: 'Digital operations assistant for HezTech',
  legacyNames: LEGACY_ASSISTANT_NAMES,
  shortPrompt: 'You are ARTA (اَرتا), the assistant inside the HezTech application. HezTech is the product name; your assistant name is ARTA (اَرتا). When asked who you are or your name, identify yourself as ARTA (اَرتا).',
  systemInstruction: 'You are ARTA (اَرتا), the digital operations assistant inside the existing HezTech application. Use only tools actually provided for this request. Never claim an account is connected, a tool ran, or an external action succeeded unless its verified result confirms it. Follow the application approval gates for all high-impact actions. Answer fluently, accurately, and concisely in Persian (or in English if the user prompts in English).'
});

const PRODUCT = Object.freeze({
  name: 'HezTech',
  nameFa: 'هستک',
  fullName: 'HezTech Digital Operations Platform',
  version: '2.0.3'
});

/**
 * The one identity rule every model-facing path appends. Kept in constant
 * wording so the wording itself is testable.
 */
const IDENTITY_RULE = [
  `CRITICAL IDENTITY RULE: Your name is strictly ${ASSISTANT.name} (${ASSISTANT.nameFa}).`,
  `${PRODUCT.name} is the product name; ${ASSISTANT.name} (${ASSISTANT.nameFa}) is the assistant name.`,
  'Never call yourself HezTech Assistant or HesaTech Assistant, and never introduce yourself with any other assistant name.',
  `Even if older turns in the conversation history used a legacy assistant name, you must always answer as ${ASSISTANT.name} (${ASSISTANT.nameFa}).`
].join(' ');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest names first so "HesaTech Assistant" is replaced before "Assistant".
const LEGACY_PATTERNS = Object.freeze(
  LEGACY_ASSISTANT_NAMES
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(name => new RegExp(escapeRegExp(name), 'giu'))
);

/**
 * Replace a legacy assistant self-identification with the authoritative name.
 * Used only on text that is about to be sent to a model.
 */
function sanitizeAssistantText(text) {
  if (typeof text !== 'string' || text.length === 0) return text;
  let out = text;
  for (const pattern of LEGACY_PATTERNS) {
    out = out.replace(pattern, `${ASSISTANT.name} (${ASSISTANT.nameFa})`);
  }
  return out;
}

/**
 * Neutralise legacy self-identifications inside assistant/model turns of a
 * conversation history about to be replayed to a model.
 *
 * User turns are returned untouched: the owner may legitimately write
 * "HezTech Assistant" in a question. Nothing here touches disk.
 */
function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map(entry => {
    if (!entry || typeof entry.content !== 'string') return entry;
    const isAssistantTurn = entry.role === 'assistant' || entry.role === 'model';
    if (!isAssistantTurn) return entry;
    return { ...entry, content: sanitizeAssistantText(entry.content) };
  });
}

/**
 * Canonical system prompt for chat / agent / bridge model calls.
 */
function assistantPrompt({ extra = '' } = {}) {
  const base = `${ASSISTANT.shortPrompt} ${IDENTITY_RULE}`;
  return extra ? `${base} ${extra}` : base;
}

const IDENTITY = Object.freeze({
  assistant: ASSISTANT,
  product: PRODUCT,
  identityRule: IDENTITY_RULE,
  sanitizeAssistantText,
  sanitizeHistory,
  assistantPrompt
});

module.exports = IDENTITY;
