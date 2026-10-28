import './env';
import { settings } from '../lib/config';
import { telegram } from '../lib/providers';
import { normalizeTelegram, sessionKey, safeError } from '../lib/core.mjs';
import { ingest } from '../lib/gateway';
import { query, closeDb } from '../lib/db';
let stop = false; process.on('SIGINT', () => { stop = true; }); process.on('SIGTERM', () => { stop = true; });
try {
  if ((settings().TELEGRAM_MODE || 'polling') !== 'polling') throw new Error('Set Telegram mode to polling before running this process.');
  const me = await telegram('getMe', {}); const account = String(me.id);
  const info = await telegram('getWebhookInfo', {}); if (info.url) throw new Error('A webhook is active. Use Settings > Telegram > Enable polling, then restart this process. Pending updates will not be deleted.');
  const key = `telegram:${account}:offset`; const [saved] = await query('SELECT value FROM agentflow.runtime_state WHERE key=$1', [key]); let offset = Number(saved?.value?.offset || 0);
  console.log(`Polling @${me.username}. Only private customer chats are processed.`);
  while (!stop) {
    try {
      const updates = await telegram('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, 35000);
      for (const update of updates) {
        const e = normalizeTelegram(update); if (e) { e.account = account; e.externalKey = sessionKey('telegram', account, e.target.chat_id); await ingest(e); }
        offset = update.update_id + 1; await query('INSERT INTO agentflow.runtime_state(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()', [key, { offset }]);
      }
    } catch (e: any) { console.error(safeError(e)); await new Promise(r => setTimeout(r, Math.max(3000, Number(e.retryAfter || 0) * 1000))); }
  }
} catch (e) { console.error(safeError(e)); process.exitCode = 1; } finally { await closeDb(); }
