import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { reply, errorResponse } from '@/lib/api';
import { assertOrigin, authLimit, customer, cookie, secret } from '@/lib/security';
import { sign } from '@/lib/core.mjs';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    assertOrigin(req);
    authLimit('customer-sessions');
    try {
      const session = customer(req);
      const [existing] = await query("SELECT id FROM agentflow.conversations WHERE id=$1 AND channel='website'", [session.conversationId]);
      if (existing) return reply({ conversationId: existing.id });
    } catch (error: any) {
      if (error.status !== 401) throw error;
    }
    const conversationId = randomUUID();
    // The UUID primary key and text provider key need separate parameter types.
    // Reusing an uncast $1 in both columns makes PostgreSQL reject the statement.
    await query("INSERT INTO agentflow.conversations(id,channel,external_key,display_name) VALUES($1::uuid,'website',$2::text,'Website visitor')", [conversationId, conversationId]);
    return cookie(reply({ conversationId }), 'af_customer', sign({ purpose: 'customer', conversationId }, secret(), 7 * 86400), 7 * 86400);
  } catch (error) { return errorResponse(error); }
}
