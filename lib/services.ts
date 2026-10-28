import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { query, transaction } from './db';
import { scoreLead } from './core.mjs';
import { retrieve } from './ai';

export const uuid = z.string().uuid();
export const leadInput = z.object({
  name: z.string().trim().min(1).max(160), email: z.union([z.string().email().max(254), z.literal('')]).optional().default(''),
  phone: z.string().max(40).optional().default(''), company: z.string().max(200).optional().default(''),
  interest: z.string().max(1500).optional().default(''), budget: z.string().max(120).optional().default(''),
  timeline: z.string().max(120).optional().default(''), consent: z.boolean().optional().default(false)
});
async function saveLead(c: PoolClient, data: unknown, conversationId?: string, source = 'operator') {
  const l = leadInput.parse(data), score = scoreLead(l);
  const { rows: [lead] } = await c.query(`INSERT INTO agentflow.leads(conversation_id,name,email,phone,company,interest,budget,timeline,consent,source,score,score_factors,stage)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT(conversation_id) DO UPDATE SET name=excluded.name,email=COALESCE(NULLIF(excluded.email,''),leads.email),phone=COALESCE(NULLIF(excluded.phone,''),leads.phone),company=excluded.company,interest=excluded.interest,budget=excluded.budget,timeline=excluded.timeline,consent=excluded.consent,score=excluded.score,score_factors=excluded.score_factors,stage=CASE WHEN leads.stage IN ('new','qualified') THEN excluded.stage ELSE leads.stage END,last_activity=now() RETURNING *`,
    [conversationId || null,l.name,l.email,l.phone,l.company,l.interest,l.budget,l.timeline,l.consent,source,score.score,score.factors,score.score >= 60 ? 'qualified' : 'new']);
  await c.query('INSERT INTO agentflow.activity(conversation_id,kind,detail) VALUES($1,$2,$3)', [conversationId || null,'lead','Lead saved: ' + l.name]);
  const fingerprint = createHash('sha256').update(JSON.stringify({ interest: l.interest, company: l.company, budget: l.budget, timeline: l.timeline })).digest('hex').slice(0,24);
  await c.query('INSERT INTO agentflow.jobs(kind,payload,dedup_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', ['lead_enrichment', { leadId: lead.id }, `enrich:${lead.id}:${fingerprint}`]);
  return lead;
}
export async function upsertLead(data: unknown, conversationId?: string, source = 'operator') {
  return transaction(c => saveLead(c, data, conversationId, source));
}
export async function captureLead(input: unknown) {
  const p = z.object({ eventId: z.string().min(1).max(300), source: z.enum(['form','email','ads']), lead: leadInput }).parse(input);
  return transaction(async c => {
    const key = p.source + ':' + p.eventId;
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['intake:' + key]);
    const { rows: [seen] } = await c.query('SELECT lead_id FROM agentflow.intake_events WHERE event_key=$1', [key]);
    if (seen) return { id: seen.lead_id, duplicate: true };
    const lead = await saveLead(c, p.lead, undefined, p.source);
    await c.query('INSERT INTO agentflow.intake_events(event_key,lead_id) VALUES($1,$2)', [key, lead.id]);
    return lead;
  });
}
function businessTime(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: process.env.BUSINESS_TIMEZONE || 'Asia/Aden', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}
export function validSlot(start: string, now = Date.now()) {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(start)) throw new Error('Appointment must include an explicit timezone offset.');
  const d = new Date(start), ms = d.getTime();
  if (!Number.isFinite(ms) || ms <= now || ms > now + 90 * 86400000) throw new Error('Choose a future slot within 90 days.');
  const p = businessTime(d), minute = Number(p.minute), hour = Number(p.hour);
  if (['Fri','Sat'].includes(p.weekday) || hour < 9 || hour >= 17 || ![0,30].includes(minute) || d.getUTCSeconds() !== 0 || d.getUTCMilliseconds() !== 0) throw new Error('Choose a 30-minute slot, Sunday to Thursday, 09:00-17:00 in the business timezone.');
  return { start: d.toISOString(), end: new Date(ms + 1800000).toISOString() };
}
export async function availability(date: string) {
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date);
  const midnight = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0,10) !== date) throw new Error('Invalid calendar date');
  const booked = await query("SELECT starts_at,ends_at FROM agentflow.appointments WHERE resource='consultant-1' AND status='confirmed' AND starts_at BETWEEN $1 AND $2", [new Date(midnight - 86400000), new Date(midnight + 2 * 86400000)]);
  const slots = [];
  for (let t = midnight - 86400000; t < midnight + 2 * 86400000; t += 1800000) {
    const d = new Date(t), p = businessTime(d); if (`${p.year}-${p.month}-${p.day}` !== date) continue;
    try { const s = validSlot(d.toISOString()); if (!booked.some(b => new Date(b.starts_at).getTime() < t + 1800000 && new Date(b.ends_at).getTime() > t)) slots.push(s); } catch {}
  }
  return { timezone: process.env.BUSINESS_TIMEZONE || 'Asia/Aden', durationMinutes: 30, slots };
}
async function saveBooking(c: PoolClient, data: unknown, conversationId?: string) {
  const b = z.object({ leadId: uuid, startsAt: z.string(), confirmed: z.literal(true), title: z.string().max(160).default('Discovery call') }).parse(data);
  const { rows: [lead] } = await c.query('SELECT * FROM agentflow.leads WHERE id=$1', [b.leadId]);
  if (!lead || conversationId && lead.conversation_id !== conversationId) throw Object.assign(new Error('Lead is not available to this conversation.'), { status: 403 });
  const slot = validSlot(b.startsAt), key = `booking:${b.leadId}:${slot.start}`;
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
  const { rows: [existing] } = await c.query('SELECT * FROM agentflow.appointments WHERE idempotency_key=$1', [key]);
  if (existing) { if (existing.status !== 'confirmed') throw Object.assign(new Error('A previous booking for this time was closed. Choose another slot or ask an operator.'), { status: 409 }); return existing; }
  const { rows: [result] } = await c.query('INSERT INTO agentflow.appointments(lead_id,conversation_id,starts_at,ends_at,title,idempotency_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [b.leadId, conversationId || lead.conversation_id, slot.start, slot.end, b.title, key]);
  await c.query("INSERT INTO agentflow.activity(conversation_id,kind,detail) VALUES($1,'booking',$2)", [conversationId || lead.conversation_id, 'Appointment confirmed for ' + slot.start]);
  return result;
}
export async function book(data: unknown, conversationId?: string) {
  try { return await transaction(c => saveBooking(c, data, conversationId)); }
  catch (e: any) { if (e.code === '23P01') throw Object.assign(new Error('This slot was just booked. Select another available time.'), { status: 409 }); throw e; }
}
async function saveHandoff(c: PoolClient, id: string, reason: string) {
  const { rows: [conv] } = await c.query('SELECT id,mode FROM agentflow.conversations WHERE id=$1 FOR UPDATE', [id]);
  if (!conv) throw Object.assign(new Error('Conversation not found.'), { status: 404 });
  if (conv.mode !== 'human') await c.query("UPDATE agentflow.conversations SET mode='human',version=version+1,updated_at=now() WHERE id=$1", [id]);
  const { rows: [handoff] } = await c.query("INSERT INTO agentflow.handoffs(conversation_id,reason) VALUES($1,$2) ON CONFLICT(conversation_id) WHERE status='open' DO UPDATE SET reason=excluded.reason RETURNING *", [id, reason.slice(0,1000)]);
  await c.query('INSERT INTO agentflow.jobs(kind,payload,dedup_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', ['alert', { conversationId: id, message: 'Human handoff requested. Review the unified inbox.' }, 'handoff:' + handoff.id]);
  return handoff;
}
export async function handoff(id: string, reason: string) { return transaction(c => saveHandoff(c, id, reason)); }
export async function runTool(action: string, args: any, ctx: { conversationId: string; version?: number }) {
  const id = uuid.parse(ctx.conversationId);
  // Read-only knowledge/availability calls never accept arbitrary SQL or another user's ID.
  if (action === 'search_knowledge_base') return retrieve(z.string().min(1).max(2000).parse(args.query));
  if (action === 'check_appointment_availability') return availability(args.date);
  try {
    return await transaction(async c => {
      const { rows: [conv] } = await c.query('SELECT * FROM agentflow.conversations WHERE id=$1 FOR UPDATE', [id]);
      if (!conv) throw new Error('Unknown conversation');
      if (ctx.version !== undefined && conv.version !== ctx.version) throw Object.assign(new Error('Conversation authorization changed.'), { status: 409 });
      if (action === 'request_human_handoff') return saveHandoff(c, id, z.string().min(1).max(1000).parse(args.reason));
      if (conv.mode !== 'ai') throw new Error('Conversation is under human control. Automated changes are paused.');
      const { rows: [lead] } = await c.query('SELECT * FROM agentflow.leads WHERE conversation_id=$1', [id]);
      if (action === 'create_or_update_lead') return saveLead(c, { ...lead, ...args }, id, conv.channel);
      if (action === 'get_lead_status') return { lead: lead || null };
      if (action === 'book_appointment') { if (!lead) throw new Error('Collect the customer name and create their lead first.'); return saveBooking(c, { ...args, leadId: lead.id }, id); }
      throw new Error('Unsupported tool action');
    });
  } catch (e: any) { if (e.code === '23P01') throw Object.assign(new Error('This slot was just booked. Select another available time.'), { status: 409 }); throw e; }
}
