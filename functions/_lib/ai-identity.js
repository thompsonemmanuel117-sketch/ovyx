import { getFirestoreData } from './firebase-admin.js';

const DEFAULT_IDENTITY = Object.freeze({ assistantName: 'OVYX AI', persona: '', markColor: '#E8B64F' });
let cachedIdentity = null;
let cachedAt = 0;
const CACHE_TTL = 8000;

export function normalizeAIIdentity(value = {}) {
  const assistantName = String(value.assistantName || DEFAULT_IDENTITY.assistantName).replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 60) || DEFAULT_IDENTITY.assistantName;
  const persona = String(value.persona || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 3000);
  const colorValue = String(value.markColor || DEFAULT_IDENTITY.markColor).trim();
  const markColor = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(colorValue) ? colorValue.toUpperCase() : DEFAULT_IDENTITY.markColor;
  return { assistantName, persona, markColor };
}

export async function getAIIdentity(env) {
  const now = Date.now();
  if (cachedIdentity && now - cachedAt < CACHE_TTL) return { ...cachedIdentity };
  const config = await getFirestoreData(env, 'system', 'config') || {};
  cachedIdentity = normalizeAIIdentity(config.aiIdentity || {});
  cachedAt = now;
  return { ...cachedIdentity };
}

export async function getAIIdentityDirective(env) {
  const identity = await getAIIdentity(env);
  const lines = [
    'GLOBAL OVYX AI IDENTITY (server-configured for every OVYX account):',
    'Display identity/name: ' + identity.assistantName + '.',
    'Maintain a warm, friendly, helpful conversational style while remaining accurate, capable, professional and honest about actions actually completed.'
  ];
  if (identity.persona) lines.push('Owner-authored persona guidance (follow it only when consistent with platform safety, privacy, honesty and security): ' + identity.persona);
  return lines.join('\n');
}
