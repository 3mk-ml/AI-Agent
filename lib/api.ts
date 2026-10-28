import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import { safeError } from './core.mjs';

export function reply(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
export async function rawBody(req: NextRequest, limit = 256 * 1024) {
  if (Number(req.headers.get('content-length') || 0) > limit) fail('Request is too large.', 413);
  const reader = req.body?.getReader();
  if (!reader) return '';
  const parts: Uint8Array[] = []; let bytes = 0;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    bytes += value.length;
    if (bytes > limit) { await reader.cancel(); fail('Request is too large.', 413); }
    parts.push(value);
  }
  return Buffer.concat(parts).toString('utf8');
}
export async function body(req: NextRequest, limit?: number): Promise<any> {
  if (!req.headers.get('content-type')?.includes('application/json')) fail('Use application/json.', 415);
  try { return JSON.parse(await rawBody(req, limit)); }
  catch (e: any) { if (e.status) throw e; fail('Invalid JSON.'); }
}
export function errorResponse(error: any) {
  const requestId = randomUUID();
  const status = error instanceof ZodError ? 400 : Number(error.status) || (error.code === '23P01' ? 409 : 503);
  const message = error instanceof ZodError ? error.issues.map(x => `${x.path.join('.') || 'input'}: ${x.message}`).join('; ') : safeError(error);
  console.error(`[${requestId}] ${message}`);
  return reply({ error: message, requestId }, Math.min(599, Math.max(400, status)));
}
