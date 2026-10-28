import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { db, query } from './db';
import { settings, required } from './config';
import { remoteJson } from './http';
import { safeError } from './core.mjs';

export async function migrate() {
  const client = await db().connect(); const applied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('agentflow:migrations'))");
    for (const file of readdirSync(path.join(process.cwd(), 'database')).filter(x => /^\d+.*\.sql$/.test(x)).sort()) {
      const id = file.replace(/\.sql$/, '');
      const { rows: [exists] } = await client.query("SELECT to_regclass('agentflow.migrations') AS table_name");
      if (exists.table_name && (await client.query('SELECT 1 FROM agentflow.migrations WHERE id=$1', [id])).rowCount) continue;
      await client.query(readFileSync(path.join(process.cwd(), 'database', file), 'utf8'));
      applied.push(file);
    }
    return { applied, message: applied.length ? 'Database migrations applied.' : 'Database is up to date.' };
  } finally {
    try { await client.query('ROLLBACK'); await client.query("SELECT pg_advisory_unlock(hashtext('agentflow:migrations'))"); }
    finally { client.release(); }
  }
}
export async function overview() {
  const [counts] = await query(`SELECT
    (SELECT count(*)::int FROM agentflow.leads) AS leads,
    (SELECT count(*)::int FROM agentflow.leads WHERE stage='qualified') AS qualified,
    (SELECT count(*)::int FROM agentflow.appointments WHERE status='confirmed' AND starts_at>=now()) AS appointments,
    (SELECT count(*)::int FROM agentflow.conversations) AS conversations,
    (SELECT count(*)::int FROM agentflow.handoffs WHERE status='open') AS handoffs,
    (SELECT count(*)::int FROM agentflow.workflow_runs WHERE status='success') AS successful,
    (SELECT count(*)::int FROM agentflow.workflow_runs WHERE status='failed') AS failed,
    (SELECT count(*)::int FROM agentflow.knowledge_documents WHERE status='ready') AS knowledge`);
  const [activity, channels, series, stages, upcoming, heartbeat] = await Promise.all([
    query('SELECT * FROM agentflow.activity ORDER BY created_at DESC LIMIT 8'),
    query('SELECT channel,count(*)::int AS count FROM agentflow.conversations GROUP BY channel'),
    query(`SELECT d::date::text AS day, (SELECT count(*)::int FROM agentflow.messages m WHERE m.created_at>=d AND m.created_at<d+interval '1 day') AS messages FROM generate_series(date_trunc('day',now())-interval '6 days',date_trunc('day',now()),interval '1 day') d`),
    query('SELECT stage,count(*)::int AS count FROM agentflow.leads GROUP BY stage'),
    query("SELECT a.*,l.name FROM agentflow.appointments a JOIN agentflow.leads l ON l.id=a.lead_id WHERE a.status='confirmed' AND a.starts_at>=now() ORDER BY a.starts_at LIMIT 4"),
    query("SELECT updated_at FROM agentflow.runtime_state WHERE key='worker:heartbeat'")
  ]);
  return { counts, activity, channels, series, stages, upcoming, workerLastSeen: heartbeat[0]?.updated_at || null };
}
export async function diagnostics() {
  const c = settings(); const checks: Record<string, any> = {};
  async function check(name: string, configured: boolean, fn: () => Promise<unknown>) {
    if (!configured) { checks[name] = { status: 'not_configured' }; return; }
    try { await fn(); checks[name] = { status: 'reachable', checkedAt: new Date().toISOString() }; }
    catch (e) { checks[name] = { status: 'error', error: safeError(e) }; }
  }
  await Promise.all([
    check('database', Boolean(c.DATABASE_URL), () => query('SELECT 1 FROM agentflow.migrations LIMIT 1')),
    check('gemini', Boolean(c.GEMINI_API_KEY), () => remoteJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': required('GEMINI_API_KEY') } }, 15000)),
    check('n8n', Boolean(c.N8N_URL), async () => { const r = await fetch(new URL('/healthz', c.N8N_URL), { signal: AbortSignal.timeout(10000), redirect: 'error' }); if (!r.ok) throw new Error(`n8n health returned ${r.status}`); }),
    check('telegram', Boolean(c.TELEGRAM_BOT_TOKEN), async () => { const { telegram } = await import('./providers'); await telegram('getMe', {}); }),
    check('slack', Boolean(c.SLACK_BOT_TOKEN), async () => { const { slack } = await import('./providers'); const r = await slack('auth.test', {}); if (c.SLACK_TEAM_ID && r.team_id !== c.SLACK_TEAM_ID) throw new Error('Token belongs to a different Slack workspace.'); }),
    check('whatsapp', Boolean(c.WHATSAPP_ACCESS_TOKEN && c.WHATSAPP_PHONE_NUMBER_ID && c.META_GRAPH_VERSION), () => remoteJson(`https://graph.facebook.com/${encodeURIComponent(c.META_GRAPH_VERSION)}/${encodeURIComponent(c.WHATSAPP_PHONE_NUMBER_ID)}?fields=id,display_phone_number`, { headers: { Authorization: `Bearer ${c.WHATSAPP_ACCESS_TOKEN}` } }, 15000))
  ]);
  return { checks, note: 'Reachable verifies authentication/connectivity only. It does not prove live message delivery, model quota or workflow execution.' };
}
