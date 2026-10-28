import { z } from 'zod';
import { query, transaction } from './db';
export const inboundSchema = z.object({ channel: z.enum(['website','telegram','slack','whatsapp']), account: z.string().min(1).max(200), externalKey: z.string().min(1).max(600), eventId: z.string().min(1).max(300), displayName: z.string().max(200), text: z.string().min(1).max(12000), target: z.record(z.string(),z.unknown()), receivedAt: z.string(), media: z.object({ id: z.string().max(500), mime: z.string().max(100).optional(), url: z.string().max(2000).optional(), size: z.number().optional() }).optional() });
export async function ingest(input: unknown) {
  const e = inboundSchema.parse(input), timestamp = Math.min(Date.now(), Date.parse(e.receivedAt));
  if (!Number.isFinite(timestamp)) throw new Error('Invalid event timestamp');
  return transaction(async c => {
    const { rows: [conv] } = await c.query('INSERT INTO agentflow.conversations(channel,account,external_key,display_name,target) VALUES($1,$2,$3,$4,$5) ON CONFLICT(channel,external_key) DO UPDATE SET external_key=excluded.external_key RETURNING *', [e.channel,e.account,e.externalKey,e.displayName,e.target]);
    const { rows } = await c.query('INSERT INTO agentflow.messages(conversation_id,direction,author,text,provider_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id', [conv.id,'in','customer',e.text,'in:' + e.eventId]);
    if (!rows.length) return { conversationId: conv.id, duplicate: true };
    await c.query("UPDATE agentflow.conversations SET last_message=$2,last_inbound_at=GREATEST(last_inbound_at,$3),target=$4,updated_at=now(),mode=CASE WHEN mode='resolved' THEN 'ai' ELSE mode END WHERE id=$1", [conv.id,e.text.slice(0,180),new Date(timestamp),e.target]);
    // A returning customer's actual message resets inactivity; delayed old events cannot move it backwards.
    await c.query('UPDATE agentflow.leads SET last_activity=GREATEST(last_activity,$2) WHERE conversation_id=$1', [conv.id,new Date(timestamp)]);
    await c.query('INSERT INTO agentflow.jobs(kind,payload,dedup_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', ['inbound',{ conversationId: conv.id,messageId: rows[0].id,text:e.text,media:e.media },`in:${e.channel}:${e.account}:${e.eventId}`]);
    await c.query('INSERT INTO agentflow.channel_status(channel,last_inbound) VALUES($1,now()) ON CONFLICT(channel) DO UPDATE SET last_inbound=now()', [e.channel]);
    return { conversationId: conv.id,messageId: rows[0].id,duplicate: false };
  });
}
export async function queueReply(conversationId: string, text: string, author: 'agent'|'operator'|'system', key: string, version?: number, template?: any) {
  if (!text.trim() || text.length > 16000) throw new Error('Reply must contain 1 to 16000 characters');
  return transaction(async c => {
    const { rows: [conv] } = await c.query('SELECT * FROM agentflow.conversations WHERE id=$1 FOR UPDATE', [conversationId]);
    if (!conv) throw new Error('Conversation not found');
    if (author === 'agent' && (conv.mode !== 'ai' || conv.version !== version)) return { suppressed: true };
    if (author === 'operator' && conv.mode !== 'human') throw new Error('Take over the conversation before replying.');
    const chunks = Array.from(text).reduce((acc: string[], letter, index) => { const n = Math.floor(index / 3000); acc[n] = (acc[n] || '') + letter; return acc; }, []);
    if (template && chunks.length > 1) throw new Error('Template preview is too long');
    for (let i = 0; i < chunks.length; i++) {
      const dedup = `out:${key}:${i}`;
      const { rows: [job] } = await c.query('INSERT INTO agentflow.jobs(kind,payload,dedup_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id', ['outbound',{},dedup]); if (!job) continue;
      const { rows: [m] } = await c.query("INSERT INTO agentflow.messages(conversation_id,direction,author,text,status) VALUES($1,'out',$2,$3,'queued') RETURNING id", [conversationId,author,chunks[i]]);
      await c.query('UPDATE agentflow.jobs SET payload=$2 WHERE id=$1', [job.id,{ conversationId,messageId:m.id,version,template }]);
    }
    return { queued: true };
  });
}
export async function enqueue(kind: string, payload: unknown, key: string) { return (await query('INSERT INTO agentflow.jobs(kind,payload,dedup_key) VALUES($1,$2,$3) ON CONFLICT(dedup_key) DO UPDATE SET dedup_key=excluded.dedup_key RETURNING id', [kind,payload,key]))[0]; }
export async function deliveryEvents(body: any, phoneId: string) {
  for (const entry of body.entry || []) for (const change of entry.changes || []) {
    const value = change.value; if (value?.metadata?.phone_number_id !== phoneId) continue;
    for (const status of value.statuses || []) {
      if (!['sent','delivered','read','failed'].includes(status.status)) continue;
      await query("UPDATE agentflow.messages m SET status=CASE WHEN m.status='read' THEN 'read' WHEN m.status='delivered' AND $2='sent' THEN 'delivered' ELSE $2 END FROM agentflow.conversations c WHERE m.conversation_id=c.id AND c.channel='whatsapp' AND c.account=$3 AND m.provider_id=$1", [status.id,status.status,phoneId]);
    }
  }
}
