import './env';
import { settings } from '../lib/config';
import { telegram } from '../lib/providers';
import { normalizeTelegram, sessionKey, safeError } from '../lib/core.mjs';
import { ingest } from '../lib/gateway';
import { db, query, closeDb } from '../lib/db';
import type { PoolClient } from 'pg';
let stop = false;
process.on('SIGINT', () => { stop = true; }); process.on('SIGTERM', () => { stop = true; });
let lease: PoolClient | undefined;
try {
  if ((settings().TELEGRAM_MODE || 'polling') !== 'polling') throw new Error('Set Telegram mode to polling before running this process.');
  const me = await telegram('getMe', {}), account = String(me.id);
  lease = await db().connect();
  const { rows: [lock] } = await lease.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', ['telegram:poller:' + account]);
  if (!lock.ok) throw new Error('Another Telegram poller is running for this bot/database.');
  lease.on('error', () => { stop = true; });
  const info = await telegram('getWebhookInfo', {});
  if (info.url) throw new Error('A webhook is active. Use Settings > Prepare Telegram for polling, then restart. Pending updates are preserved.');
  const key = `telegram:${account}:offset`; const [saved] = await query('SELECT value FROM agentflow.runtime_state WHERE key=$1', [key]); let offset = Number(saved?.value?.offset || 0);
  console.log(`Polling @${me.username}. Only private customer chats are processed.`);
  while (!stop) {
    try {
      const updates = await telegram('getUpdates', { offset, timeout: 25, allowed_updates: ['message','callback_query'] }, 35000);
      for (const update of updates) {
        const e = normalizeTelegram(update);
        if (e) { e.account = account; e.externalKey = sessionKey('telegram', account, e.target.chat_id); await ingest(e); }
        if (update.callback_query?.id) { try { await telegram('answerCallbackQuery', { callback_query_id: update.callback_query.id }); } catch {} }
        offset = update.update_id + 1;
        await query('INSERT INTO agentflow.runtime_state(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()', [key, { offset }]);
      }
    } catch (e: any) { console.error(safeError(e)); await new Promise(r => setTimeout(r, Math.max(3000, Number(e.retryAfter || 0) * 1000))); }
  }
} catch (e) { console.error(safeError(e)); process.exitCode = 1; }
finally { if (lease) { try { await lease.query('SELECT pg_advisory_unlock_all()'); } catch {} lease.release(); } await closeDb(); }
