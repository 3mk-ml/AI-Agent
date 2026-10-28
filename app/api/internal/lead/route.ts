import { NextRequest } from 'next/server';
import { body, reply, errorResponse } from '@/lib/api';
import { requireToken } from '@/lib/security';
import { required } from '@/lib/config';
import { captureLead } from '@/lib/services';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try { requireToken(req, 'x-agentflow-tool-secret', required('TOOL_SECRET')); return reply(await captureLead(await body(req)), 201); }
  catch (e) { return errorResponse(e); }
}
