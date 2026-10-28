import { readFileSync, existsSync } from 'node:fs';
import { createDecipheriv } from 'node:crypto';
import path from 'node:path';

export const fields = ['DATABASE_URL','DATABASE_CA_FILE','GEMINI_API_KEY','GEMINI_MODEL','GEMINI_EMBEDDING_MODEL','N8N_URL','N8N_WEBHOOK_URL','N8N_API_KEY','N8N_WEBHOOK_SECRET','TOOL_SECRET','INGEST_SECRET','TELEGRAM_BOT_TOKEN','TELEGRAM_WEBHOOK_SECRET','TELEGRAM_MODE','SLACK_BOT_TOKEN','SLACK_SIGNING_SECRET','SLACK_APP_TOKEN','SLACK_TEAM_ID','SLACK_MODE','SLACK_HANDOFF_CHANNEL','WHATSAPP_ACCESS_TOKEN','WHATSAPP_APP_SECRET','WHATSAPP_VERIFY_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_WABA_ID','META_GRAPH_VERSION','AIRTABLE_TOKEN','AIRTABLE_BASE_ID','AIRTABLE_TABLE_ID','GOOGLE_SERVICE_ACCOUNT_JSON','GOOGLE_SHEET_ID','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','SMTP_FROM','ALERT_EMAIL'] as const;
export type ConfigKey = typeof fields[number];
export function settings(): Record<string,string> {
  const result: Record<string,string> = {};
  // Local encrypted settings are created only by the authenticated settings endpoint.
  const file = path.join(process.cwd(), '.runtime', 'settings.enc');
  if (existsSync(file)) {
    const key = readFileSync(path.join(process.cwd(), '.runtime', 'master.key'));
    const v = JSON.parse(readFileSync(file,'utf8'));
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(v.iv,'base64'));
    d.setAuthTag(Buffer.from(v.tag,'base64'));
    Object.assign(result, JSON.parse(Buffer.concat([d.update(Buffer.from(v.data,'base64')),d.final()]).toString()));
  }
  // Environment wins, including values loaded by Next.js from .env.local.
  for (const field of fields) if (process.env[field]) result[field] = process.env[field]!;
  return result;
}
export function required(key: string) { const v = settings()[key] || process.env[key]; if (!v) throw new Error(`${key} is not configured`); return v; }
export function appUrl() { return process.env.APP_URL || 'http://127.0.0.1:3000'; }
export function publicConfig() {
  const c = settings();
  return { configured: Object.fromEntries(fields.map(k => [k,Boolean(c[k])])), models: { chat: c.GEMINI_MODEL || '', embedding: c.GEMINI_EMBEDDING_MODEL || '' }, modes: { telegram: c.TELEGRAM_MODE || 'polling', slack: c.SLACK_MODE || 'socket' }, appUrl: appUrl(), timezone: process.env.BUSINESS_TIMEZONE || 'Asia/Aden' };
}
