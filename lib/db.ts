import pg, { type PoolClient } from 'pg';
import { readFileSync } from 'node:fs';
import { required, settings } from './config';
let pool: pg.Pool | undefined;
let configuredUrl = '';
export function db() {
  const value = required('DATABASE_URL');
  if (!pool || configuredUrl !== value) {
    if (pool) void pool.end();
    const url = new URL(value);
    const local = ['localhost','127.0.0.1','::1'].includes(url.hostname);
    // pg connection URL SSL options otherwise silently override explicit SSL configuration.
    for (const key of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(key);
    const ca = settings().DATABASE_CA_FILE;
    pool = new pg.Pool({ connectionString: url.toString(), max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000, statement_timeout: 20000, ssl: local ? false : { rejectUnauthorized: true, ...(ca ? { ca: readFileSync(ca,'utf8') } : {}) } });
    pool.on('error', () => console.error('Database pool error; run npm run doctor.'));
    configuredUrl = value;
  }
  return pool;
}
export async function query<T = Record<string,any>>(sql: string, values: unknown[] = []): Promise<T[]> { return (await db().query(sql,values)).rows as T[]; }
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const c = await db().connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
export async function closeDb() { await pool?.end(); pool = undefined; }
export async function rateLimit(key: string, limit = 60, seconds = 60) {
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const [r] = await query('INSERT INTO agentflow.rate_limits (key,bucket,count) VALUES ($1,$2,1) ON CONFLICT(key,bucket) DO UPDATE SET count=agentflow.rate_limits.count+1 RETURNING count',[key,bucket]);
  if (r.count > limit) throw Object.assign(new Error('Too many requests. Please try again shortly.'), { status: 429 });
}
