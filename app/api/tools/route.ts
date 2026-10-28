import { NextRequest } from 'next/server';
import { z } from 'zod';
import { body, reply, fail, errorResponse } from '@/lib/api';
import { requireToken, secret } from '@/lib/security';
import { required } from '@/lib/config';
import { verify } from '@/lib/core.mjs';
import { query } from '@/lib/db';
import { runTool, uuid } from '@/lib/services';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    requireToken(req, 'x-agentflow-tool-secret', required('TOOL_SECRET'));
    const p = z.object({ action: z.string().min(1).max(100), contextToken: z.string().min(1).max(4000), args: z.record(z.string(), z.unknown()).default({}) }).parse(await body(req));
    const ctx = verify(p.contextToken, secret(), 'tool'); if (!ctx) fail('Invalid or expired conversation authorization.', 401);
    const [conv] = await query('SELECT version,mode FROM agentflow.conversations WHERE id=$1', [uuid.parse(ctx.conversationId)]);
    if (!conv || conv.version !== ctx.version) fail('Conversation authority has changed.', 409);
    return reply(await runTool(p.action, p.args, { conversationId: ctx.conversationId, version: ctx.version }));
  } catch (e) { return errorResponse(e); }
}
