import './env';
import { tick } from '../lib/worker';
import { db, query, closeDb } from '../lib/db';
import { safeError } from '../lib/core.mjs';
let stopping = false; for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { stopping = true; });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let lease: Awaited<ReturnType<ReturnType<typeof db>['connect']>> | undefined;
try {
  lease = await db().connect();
  const { rows: [lock] } = await lease.query("SELECT pg_try_advisory_lock(hashtext('agentflow:worker')) AS ok");
  if (!lock.ok) throw new Error('Another AgentFlow worker is already running for this database.');
  // Never automatically resend an outbound job interrupted after possible provider acceptance.
  await query("UPDATE agentflow.messages SET status='unknown' WHERE id IN (SELECT (payload->>'messageId')::uuid FROM agentflow.jobs WHERE kind='outbound' AND status='running')");
  await query("UPDATE agentflow.jobs SET status=CASE WHEN kind='outbound' THEN 'unknown' ELSE 'pending' END,error='Worker restarted; reconcile unknown deliveries before retrying.' WHERE status='running'");
  lease.on('error', () => { console.error('Worker lease lost. Stopping to avoid concurrent processing.'); stopping = true; });
  console.log('AgentFlow worker started. Press Ctrl+C to stop gracefully.');
  let heartbeat = 0;
  while (!stopping) {
    try {
      if (Date.now() - heartbeat > 15000) { await query("INSERT INTO agentflow.runtime_state(key,value) VALUES('worker:heartbeat','{}') ON CONFLICT(key) DO UPDATE SET updated_at=now()"); heartbeat = Date.now(); }
      if (!await tick()) await sleep(700);
    } catch (e) { console.error(safeError(e)); await sleep(3000); }
  }
} catch (e) { console.error(safeError(e)); process.exitCode = 1; }
finally { if (lease) { try { await lease.query("SELECT pg_advisory_unlock(hashtext('agentflow:worker'))"); } catch {} lease.release(); } await closeDb(); }
