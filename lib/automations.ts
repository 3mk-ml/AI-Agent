import { z } from 'zod';
import { query } from './db';
import { generateJSON, triageSchema, invoiceSchema } from './ai';
import { required } from './config';
import { remoteJson, jsonHeaders } from './http';
import { createSign } from 'node:crypto';

export async function processAutomation(id: string, input: any) {
  const [item] = await query('SELECT * FROM agentflow.automation_items WHERE id=$1', [id]); if (!item) return;
  let data: unknown;
  if (item.kind === 'triage') data = await generateJSON('Classify the email into sales/support/billing/other and low/normal/high urgency. Return {category,urgency,summary,draft,owner}, owner is sales/support/finance/operations. Draft only; do not send.', [{ text: JSON.stringify(input) }], triageSchema);
  else if (item.kind === 'document') data = await generateJSON('Extract invoice/form facts. Return {vendor,invoice_number,invoice_date,currency,subtotal,tax,total,items:[{description,quantity,amount}],warnings:[]}. Unknown scalar fields must be null. Never infer missing prices or identities. Warn about ambiguous values.', input.base64 ? [{ inlineData: { mimeType: input.mime, data: input.base64 } }] : [{ text: input.text }], invoiceSchema);
  else throw new Error('Unsupported automation kind');
  await query("UPDATE agentflow.automation_items SET data=$2,status='review' WHERE id=$1", [id, data]); return data;
}
export async function followups() {
  // Completed drafts must not permanently occupy the first batch and starve newer leads.
  const leads = await query(`SELECT l.* FROM agentflow.leads l
    WHERE l.stage IN ('new','qualified','contacted') AND l.consent=true
      AND l.last_activity<now()-interval '2 days'
      AND NOT EXISTS (SELECT 1 FROM agentflow.appointments p WHERE p.lead_id=l.id AND p.status='confirmed' AND p.starts_at>=now())
      AND NOT EXISTS (SELECT 1 FROM agentflow.automation_items a WHERE a.kind='followup' AND a.data->>'leadId'=l.id::text AND a.status IN ('draft','review') AND a.created_at>=l.last_activity)
    ORDER BY l.last_activity LIMIT 10`);
  let created = 0;
  for (const l of leads) {
    const key = `followup:${l.id}:${new Date(l.last_activity).toISOString()}`;
    const [item] = await query(`INSERT INTO agentflow.automation_items(kind,title,dedup_key,status,data)
      VALUES('followup',$1,$2,'processing',$3)
      ON CONFLICT(dedup_key) DO UPDATE SET status='processing'
        WHERE automation_items.status IN ('failed','processing') RETURNING id`, ['Follow up with ' + l.name, key, { leadId: l.id }]);
    if (!item) continue;
    try {
      const draft = await generateJSON('Write a short non-pushy follow-up draft. Do not promise prices or services beyond the input. Return {subject,body}. This is a draft, not an outbound send.', [{ text: JSON.stringify({ name: l.name, company: l.company, interest: l.interest }) }], z.object({ subject: z.string().max(200), body: z.string().max(3000) }));
      await query("UPDATE agentflow.automation_items SET data=$2,status='draft' WHERE id=$1", [item.id, { leadId: l.id, ...draft }]); created++;
    } catch (e) { await query("UPDATE agentflow.automation_items SET status='failed' WHERE id=$1", [item.id]); throw e; }
  }
  return { created, policy: 'Draft only. No external message has been sent.' };
}
function cell(x: unknown) { const s = typeof x === 'string' ? x : JSON.stringify(x ?? ''); return /^[\s]*[=+\-@]/.test(s) ? "'" + s : s; }
export function validateExportConfiguration(destination: 'airtable' | 'sheets') {
  if (destination === 'airtable') {
    required('AIRTABLE_TOKEN');
    if (!/^app\w+$/.test(required('AIRTABLE_BASE_ID')) || !/^tbl\w+$/.test(required('AIRTABLE_TABLE_ID'))) throw new Error('Use Airtable base and table IDs.');
    return;
  }
  const service = JSON.parse(required('GOOGLE_SERVICE_ACCOUNT_JSON'));
  if (!service.client_email || !service.private_key) throw new Error('Google service-account email/private key is missing.');
  if (!/^[a-zA-Z0-9_-]+$/.test(required('GOOGLE_SHEET_ID'))) throw new Error('Invalid spreadsheet ID');
}
export async function exportItem(id: string, destination: 'airtable' | 'sheets') {
  const [item] = await query('SELECT * FROM agentflow.automation_items WHERE id=$1', [id]);
  if (!item || !['review','draft'].includes(item.status)) throw new Error('Select a processed item for review/export.');
  validateExportConfiguration(destination);
  if (destination === 'airtable') return remoteJson(`https://api.airtable.com/v0/${required('AIRTABLE_BASE_ID')}/${required('AIRTABLE_TABLE_ID')}`, { method: 'POST', headers: jsonHeaders(required('AIRTABLE_TOKEN')), body: JSON.stringify({ records: [{ fields: { RecordID: item.id, Kind: item.kind, Title: cell(item.title), Payload: cell(item.data) } }] }) });
  const service = JSON.parse(required('GOOGLE_SERVICE_ACCOUNT_JSON'));
  const now = Math.floor(Date.now() / 1000), enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const unsigned = enc({ alg: 'RS256', typ: 'JWT' }) + '.' + enc({ iss: service.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const signature = createSign('RSA-SHA256').update(unsigned).sign(service.private_key, 'base64url');
  const auth = await remoteJson('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + signature }) });
  return remoteJson(`https://sheets.googleapis.com/v4/spreadsheets/${required('GOOGLE_SHEET_ID')}/values/${encodeURIComponent('AgentFlow!A:E')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', headers: jsonHeaders(auth.access_token), body: JSON.stringify({ values: [[item.id, item.kind, cell(item.title), cell(item.data), new Date(item.created_at).toISOString()]] }) });
}
