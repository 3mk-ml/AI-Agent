import { NextRequest } from 'next/server';
import { z } from 'zod';
import { operator, assertOrigin } from '@/lib/security';
import { body, reply, fail, errorResponse } from '@/lib/api';
import { query } from '@/lib/db';
import { exportItem, validateExportConfiguration } from '@/lib/automations';
import { RemoteError } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    operator(req); assertOrigin(req);
    const id = z.string().uuid().parse((await context.params).id);
    const destination = z.enum(['airtable','sheets']).parse((await body(req)).destination);
    // Validate before claiming the record, so missing local credentials cannot lock an export.
    validateExportConfiguration(destination);
    const [claim] = await query("UPDATE agentflow.automation_items SET export_status='sending' WHERE id=$1 AND export_status IS NULL AND status IN ('draft','review') RETURNING id", [id]);
    if (!claim) fail('Record is not ready, already exported, or requires delivery reconciliation.', 409);
    try {
      await exportItem(id, destination);
      await query("UPDATE agentflow.automation_items SET export_status='sent',exported_to=$2 WHERE id=$1", [id, destination]);
      return reply({ exported: true });
    } catch (e) {
      const rejected = e instanceof RemoteError && !e.ambiguous && e.status >= 400 && e.status < 500;
      await query('UPDATE agentflow.automation_items SET export_status=$2 WHERE id=$1', [id, rejected ? null : 'unknown']);
      throw e;
    }
  } catch (e) { return errorResponse(e); }
}
