import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { body, rawBody, reply, fail, errorResponse } from '@/lib/api';
import { adminExists, assertOrigin, operator, customer, cookie, login, setupAdmin, saveSettings, authLimit, requireToken, secret } from '@/lib/security';
import { sign, verify, equalSecret, normalizeTelegram, normalizeSlack, normalizeWhatsApp } from '@/lib/core.mjs';
import { query, transaction, rateLimit } from '@/lib/db';
import { settings, publicConfig, required } from '@/lib/config';
import { overview, diagnostics, migrate } from '@/lib/admin';
import { leadInput, upsertLead, book, availability, handoff, runTool, uuid } from '@/lib/services';
import { ingest, queueReply, enqueue } from '@/lib/gateway';
import { retrieve } from '@/lib/ai';
import { exportItem } from '@/lib/automations';
import { remoteJson } from '@/lib/http';
import { webhook } from '@/lib/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
const text = (n = 2000) => z.string().trim().min(1).max(n);
const id = (s?: string) => uuid.parse(s);
async function handle(req: NextRequest, context: Context) {
  try {
    const parts = (await context.params).path; const route = parts.join('/'); const method = req.method;
    if (route === 'health' && method === 'GET') return reply({ service: 'AgentFlow', status: 'online' });
    if (parts[0] === 'hooks') return await webhook(req, parts[1]);
    if (route === 'auth/status' && method === 'GET') {
      let authenticated = false; try { operator(req); authenticated = true; } catch {}
      return reply({ initialized: adminExists(), authenticated });
    }
    if (parts[0] === 'auth' && method === 'POST') {
      assertOrigin(req); authLimit('operator-login'); const input = await body(req, 8000);
      if (parts[1] === 'setup') { const p = z.object({ token: text(200), password: z.string().min(12).max(1024) }).parse(input); setupAdmin(p.token, p.password); return cookie(reply({ ok: true }), 'af_operator', login(p.password), 28800); }
      if (parts[1] === 'login') return cookie(reply({ ok: true }), 'af_operator', login(z.string().max(1024).parse(input.password)), 28800);
      if (parts[1] === 'logout') return cookie(reply({ ok: true }), 'af_operator', '', 0);
      fail('Unknown authentication action.', 404);
    }
    if (parts[0] === 'chat') {
      if (method !== 'GET') assertOrigin(req);
      if (route === 'chat/session' && method === 'POST') {
        authLimit('customer-sessions');
        try { const c = customer(req); const [existing] = await query('SELECT id FROM agentflow.conversations WHERE id=$1 AND channel=$2', [c.conversationId, 'website']); if (existing) return reply({ conversationId: existing.id }); } catch (e: any) { if (e.status !== 401) throw e; }
        const conversationId = randomUUID(); await query("INSERT INTO agentflow.conversations(id,channel,external_key,display_name) VALUES($1,'website',$1,'Website visitor')", [conversationId]);
        return cookie(reply({ conversationId }), 'af_customer', sign({ purpose: 'customer', conversationId }, secret(), 7 * 86400), 7 * 86400);
      }
      const c = customer(req); await rateLimit('chat:' + c.conversationId, method === 'GET' ? 90 : 20);
      const [conv] = await query("SELECT id,mode FROM agentflow.conversations WHERE id=$1 AND channel='website'", [c.conversationId]); if (!conv) fail('Start a new session.', 401);
      if (method === 'GET') return reply({ conversation: conv, messages: await query("SELECT id,direction,author,text,status,created_at FROM agentflow.messages WHERE conversation_id=$1 AND (direction='in' OR status IN ('available','sent','delivered','read')) ORDER BY created_at,id LIMIT 500", [conv.id]) });
      if (method === 'POST') {
        const p = z.object({ message: text(12000), clientId: uuid }).parse(await body(req));
        return reply(await ingest({ channel: 'website', account: 'local', externalKey: conv.id, eventId: p.clientId, displayName: 'Website visitor', text: p.message, target: {}, receivedAt: new Date().toISOString() }), 202);
      }
      fail('Unsupported method.', 405);
    }
    if (route === 'tools' && method === 'POST') {
      requireToken(req, 'x-agentflow-tool-secret', required('TOOL_SECRET'));
      const p = z.object({ action: text(100), contextToken: text(4000), args: z.record(z.string(), z.unknown()).default({}) }).parse(await body(req));
      const ctx = verify(p.contextToken, secret(), 'tool'); if (!ctx) fail('Invalid or expired conversation authorization.', 401);
      const [conv] = await query('SELECT version,mode FROM agentflow.conversations WHERE id=$1', [id(ctx.conversationId)]);
      if (!conv || (conv.version !== ctx.version && p.action !== 'request_human_handoff')) fail('Conversation authority has changed.', 409);
      return reply(await runTool(p.action, p.args, { conversationId: ctx.conversationId }));
    }
    if (parts[0] === 'internal') {
      if (method !== 'POST') fail('Use POST.', 405);
      requireToken(req, 'x-agentflow-tool-secret', required('TOOL_SECRET'));
      const p = await body(req, 12 * 1024 * 1024);
      if (parts[1] === 'ingest') return reply(await ingest(p), 202);
      if (parts[1] === 'followups') return reply(await enqueue('followups', {}, 'followups:' + new Date().toISOString().slice(0, 13)), 202);
      if (parts[1] === 'error') {
        const e = z.object({ workflow: text(200), executionId: z.string().max(200).optional(), reason: text(2000) }).parse(p);
        const { safeError } = await import('@/lib/core.mjs');
        await query("INSERT INTO agentflow.workflow_runs(workflow,n8n_execution_id,status,error) VALUES($1,$2,'failed',$3)", [e.workflow, e.executionId || null, safeError(e.reason)]);
        await enqueue('alert', { message: `${e.workflow} failed. Execution: ${e.executionId || 'unavailable'}. ${safeError(e.reason)}` }, 'error:' + (e.executionId || randomUUID())); return reply({ recorded: true });
      }
      if (parts[1] === 'automation') return await createAutomation(p);
      if (parts[1] === 'lead') {
        const eventKey = text(300).parse(p.eventId); const [seen] = await query('SELECT lead_id FROM agentflow.intake_events WHERE event_key=$1', [eventKey]);
        if (seen) return reply({ id: seen.lead_id, duplicate: true });
        const l = await upsertLead(p.lead, undefined, z.enum(['form','email','ads']).parse(p.source));
        await query('INSERT INTO agentflow.intake_events(event_key,lead_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [eventKey, l.id]); return reply(l, 201);
      }
      fail('Unknown internal endpoint.', 404);
    }
    // All remaining routes belong to the authenticated operator, never to customers.
    operator(req); if (method !== 'GET') assertOrigin(req);
    if (route === 'overview' && method === 'GET') return reply(await overview());
    if (route === 'settings' && method === 'GET') return reply(publicConfig());
    if (route === 'settings' && method === 'POST') { saveSettings(await body(req, 128000)); return reply({ saved: true, message: 'Saved securely. Environment values take precedence; run diagnostics to verify.' }); }
    if (route === 'settings/diagnostics' && method === 'POST') return reply(await diagnostics());
    if (route === 'settings/migrate' && method === 'POST') return reply(await migrate());
    if (route === 'settings/telegram-polling' && method === 'POST') {
      const p = await body(req); if (p.confirm !== true) fail('Explicit confirmation is required.');
      const { telegram } = await import('@/lib/providers'); await telegram('deleteWebhook', { drop_pending_updates: false }); return reply({ message: 'Webhook removed without dropping pending updates. Start npm run telegram.' });
    }
    if (route === 'leads' && method === 'GET') return reply({ items: await query('SELECT * FROM agentflow.leads ORDER BY last_activity DESC LIMIT 500') });
    if (route === 'leads' && method === 'POST') return reply(await upsertLead(await body(req)), 201);
    if (parts[0] === 'leads' && parts.length === 2 && method === 'PATCH') {
      const p = z.object({ stage: z.enum(['new','qualified','contacted','won','lost']).optional(), consent: z.boolean().optional() }).strict().parse(await body(req));
      const [l] = await query('UPDATE agentflow.leads SET stage=COALESCE($2,stage),consent=COALESCE($3,consent),last_activity=now() WHERE id=$1 RETURNING *', [id(parts[1]), p.stage || null, p.consent ?? null]); if (!l) fail('Lead not found.', 404); return reply(l);
    }
    if (route === 'appointments' && method === 'GET') return reply({ items: await query('SELECT a.*,l.name,l.email FROM agentflow.appointments a JOIN agentflow.leads l ON a.lead_id=l.id ORDER BY a.starts_at DESC LIMIT 300') });
    if (route === 'appointments' && method === 'POST') return reply(await book(await body(req)), 201);
    if (route === 'availability' && method === 'GET') return reply(await availability(req.nextUrl.searchParams.get('date') || ''));
    if (parts[0] === 'appointments' && parts.length === 2 && method === 'PATCH') { const p = z.object({ status: z.enum(['cancelled','completed']) }).parse(await body(req)); return reply({ items: await query('UPDATE agentflow.appointments SET status=$2 WHERE id=$1 RETURNING *', [id(parts[1]), p.status]) }); }
    if (route === 'inbox' && method === 'GET') return reply({ items: await query('SELECT c.*,l.id AS lead_id,l.name AS lead_name,l.score FROM agentflow.conversations c LEFT JOIN agentflow.leads l ON l.conversation_id=c.id ORDER BY c.updated_at DESC LIMIT 300') });
    if (parts[0] === 'inbox' && parts.length >= 2) {
      const convId = id(parts[1]);
      if (method === 'GET') { const [conversation] = await query('SELECT * FROM agentflow.conversations WHERE id=$1', [convId]); if (!conversation) fail('Conversation not found.', 404); return reply({ conversation, messages: await query('SELECT * FROM agentflow.messages WHERE conversation_id=$1 ORDER BY created_at,id LIMIT 500', [convId]), notes: await query("SELECT * FROM agentflow.activity WHERE conversation_id=$1 AND kind='note' ORDER BY created_at DESC", [convId]) }); }
      const p = await body(req);
      if (parts[2] === 'mode' && method === 'POST') {
        const mode = z.enum(['ai','human','resolved']).parse(p.mode);
        if (mode === 'human') await handoff(convId, 'Operator took over the conversation.');
        else await transaction(async c => { await c.query('UPDATE agentflow.conversations SET mode=$2,version=version+1,updated_at=now() WHERE id=$1', [convId, mode]); await c.query("UPDATE agentflow.handoffs SET status='closed' WHERE conversation_id=$1 AND status='open'", [convId]); });
        return reply({ mode });
      }
      if (parts[2] === 'reply' && method === 'POST') {
        const p2 = z.object({ text: text(12000), clientId: uuid, template: z.object({ name: z.string().regex(/^[a-z0-9_]+$/), language: z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/), parameters: z.array(z.string().max(2000)).max(10).default([]) }).optional() }).parse(p);
        if (p2.template) { const [l] = await query('SELECT consent FROM agentflow.leads WHERE conversation_id=$1', [convId]); if (!l?.consent) fail('Record customer messaging consent before sending a template.', 403); }
        return reply(await queueReply(convId, p2.text, 'operator', p2.clientId, undefined, p2.template), 202);
      }
      if (parts[2] === 'note' && method === 'POST') { await query("INSERT INTO agentflow.activity(conversation_id,kind,detail) VALUES($1,'note',$2)", [convId, text(2000).parse(p.text)]); return reply({ saved: true }); }
    }
    if (route === 'knowledge' && method === 'GET') return reply({ items: await query('SELECT d.id,d.title,d.status,d.model,d.created_at,length(d.content) AS characters,(SELECT count(*)::int FROM agentflow.knowledge_chunks c WHERE c.document_id=d.id) AS chunks FROM agentflow.knowledge_documents d ORDER BY created_at DESC') });
    if (route === 'knowledge' && method === 'POST') {
      const p = z.object({ title: text(200), content: text(80000) }).parse(await body(req));
      const [doc] = await query('INSERT INTO agentflow.knowledge_documents(title,content,model) VALUES($1,$2,$3) RETURNING id', [p.title, p.content, settings().GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001']);
      await enqueue('knowledge', { id: doc.id }, 'knowledge:' + doc.id); return reply(doc, 202);
    }
    if (route === 'knowledge/search' && method === 'POST') return reply(await retrieve(text(2000).parse((await body(req)).query)));
    if (parts[0] === 'knowledge' && parts.length === 2 && method === 'DELETE') { await query('DELETE FROM agentflow.knowledge_documents WHERE id=$1', [id(parts[1])]); return reply({ deleted: true }); }
    if (route === 'automations' && method === 'GET') return reply({ items: await query('SELECT * FROM agentflow.automation_items ORDER BY created_at DESC LIMIT 200'), jobs: await query('SELECT id,kind,status,attempts,error,created_at FROM agentflow.jobs ORDER BY created_at DESC LIMIT 30') });
    if (route === 'automations' && method === 'POST') return await createAutomation(await body(req, 12 * 1024 * 1024));
    if (route === 'automations/followups' && method === 'POST') return reply(await enqueue('followups', {}, 'manual-followups:' + new Date().toISOString().slice(0, 13)), 202);
    if (parts[0] === 'automations' && parts[2] === 'export' && method === 'POST') {
      const destination = z.enum(['airtable','sheets']).parse((await body(req)).destination); const itemId = id(parts[1]);
      const [claim] = await query("UPDATE agentflow.automation_items SET export_status='sending' WHERE id=$1 AND export_status IS NULL RETURNING id", [itemId]); if (!claim) fail('Export is already sent or needs manual reconciliation. Do not blindly retry.', 409);
      try { await exportItem(itemId, destination); await query("UPDATE agentflow.automation_items SET export_status='sent',exported_to=$2 WHERE id=$1", [itemId, destination]); return reply({ exported: true }); }
      catch (e) { await query("UPDATE agentflow.automation_items SET export_status='unknown' WHERE id=$1", [itemId]); throw e; }
    }
    if (route === 'executions' && method === 'GET') {
      const [runs, jobs, channels] = await Promise.all([query('SELECT * FROM agentflow.workflow_runs ORDER BY created_at DESC LIMIT 200'), query('SELECT id,kind,status,attempts,error,locked_at,created_at FROM agentflow.jobs ORDER BY created_at DESC LIMIT 100'), query('SELECT * FROM agentflow.channel_status')]); return reply({ runs, jobs, channels });
    }
    if (route === 'executions/n8n' && method === 'GET') return reply(await remoteJson(new URL('/api/v1/executions?limit=50&includeData=false', required('N8N_URL')).toString(), { headers: { 'X-N8N-API-KEY': required('N8N_API_KEY') } }));
    fail('Endpoint not found.', 404);
  } catch (e) { return errorResponse(e); }
}
async function createAutomation(input: unknown) {
  const p = z.object({ kind: z.enum(['triage','document']), title: text(200), text: z.string().max(80000).optional(), base64: z.string().max(11200000).optional(), mime: z.enum(['application/pdf','image/png','image/jpeg','text/plain']).optional(), clientId: uuid.optional() }).parse(input);
  if (!p.text && !p.base64) fail('Supply text or a supported file.');
  if (p.base64 && (!p.mime || !/^[A-Za-z0-9+/]*={0,2}$/.test(p.base64) || Buffer.byteLength(p.base64, 'base64') > 8 * 1024 * 1024)) fail('Invalid file or file exceeds 8 MB.');
  const key = `automation:${p.clientId || randomUUID()}`;
  const [item] = await query("INSERT INTO agentflow.automation_items(kind,title,status,dedup_key) VALUES($1,$2,'processing',$3) ON CONFLICT(dedup_key) DO UPDATE SET dedup_key=excluded.dedup_key RETURNING id", [p.kind, p.title, key]);
  await enqueue('automation', { id: item.id, input: { text: p.text, base64: p.base64, mime: p.mime } }, key); return reply(item, 202);
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
