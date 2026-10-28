import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { migrate } from '../lib/admin';
import { query, closeDb, rateLimit } from '../lib/db';
import { ingest, queueReply } from '../lib/gateway';
import { upsertLead, captureLead, book, availability, handoff, runTool, validSlot } from '../lib/services';
import { followups } from '../lib/automations';

// This suite is destructive to its dedicated test database. Never point it at a real workspace.
const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const enabled = process.env.AGENTFLOW_DATABASE_TESTS === '1';
if (enabled && (!url || !['127.0.0.1','localhost'].includes(url.hostname) || url.pathname !== '/agentflow_ci')) {
  throw new Error('Database tests are restricted to the local disposable agentflow_ci database.');
}
test('Native PostgreSQL business flows', { skip: !enabled }, async t => {
  try {
    await t.test('migrations create the schema and are repeatable', async () => {
      await migrate();
      const second = await migrate(); assert.equal(second.applied.length, 0);
      const [r] = await query("SELECT to_regclass('agentflow.appointments') AS appointments,to_regclass('agentflow.chat_memory') AS memory");
      assert.ok(r.appointments); assert.ok(r.memory);
    });
    const nonce = randomUUID();
    const event = (who: string) => ({ channel: 'telegram', account: 'ci-bot', externalKey: `ci:${nonce}:${who}`, eventId: `${nonce}:${who}:1`, displayName: who, text: 'Please help with automation.', target: { chat_id: who }, receivedAt: new Date().toISOString() });
    let a = '', b = '', leadA: any, leadB: any;
    await t.test('concurrent duplicate messages create one record and one inbound job', async () => {
      const results = await Promise.all([ingest(event('customer-a')),ingest(event('customer-a'))]);
      a = results[0].conversationId;
      assert.equal(results[1].conversationId,a);
      assert.equal(results.filter(r => r.duplicate).length,1);
      const [messages] = await query("SELECT count(*)::int AS n FROM agentflow.messages WHERE conversation_id=$1 AND direction='in'",[a]);
      const [jobs] = await query("SELECT count(*)::int AS n FROM agentflow.jobs WHERE kind='inbound' AND payload->>'conversationId'=$1",[a]);
      assert.equal(messages.n,1); assert.equal(jobs.n,1);
      b = (await ingest(event('customer-b'))).conversationId; assert.notEqual(a,b);
    });
    await t.test('lead updates preserve earlier facts and expose score factors', async () => {
      leadA = await runTool('create_or_update_lead',{name:'Alex CI',email:'alex@example.test',company:'Fictional Retail',interest:'Customer support automation'},{conversationId:a,version:0});
      assert.equal(leadA.score,60);
      leadA = await runTool('create_or_update_lead',{name:'Alex CI',budget:'Discuss on call'},{conversationId:a,version:0});
      assert.equal(leadA.company,'Fictional Retail'); assert.equal(leadA.email,'alex@example.test'); assert.equal(leadA.score,80);
      assert.equal(leadA.consent,false);
      leadB = await upsertLead({name:'Sam CI'},b,'telegram');
    });
    await t.test('lead tools cannot select another conversation through model arguments', async () => {
      const own = await runTool('get_lead_status',{leadId:leadA.id},{conversationId:b,version:0});
      assert.equal(own.lead.id,leadB.id); assert.notEqual(own.lead.id,leadA.id);
    });
    await t.test('source event intake is transactionally idempotent', async () => {
      const input={eventId:nonce,source:'form',lead:{name:'Intake CI',email:'intake@example.test'}};
      const values=await Promise.all([captureLead(input),captureLead(input)]);
      assert.equal(values[0].id,values[1].id);
      const [r]=await query('SELECT count(*)::int AS n FROM agentflow.intake_events WHERE event_key=$1',['form:'+nonce]);
      assert.equal(r.n,1);
    });
    let startsAt='';
    for(let offset=1;offset<8;offset++) {
      const date=new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
      try { startsAt=validSlot(date+'T09:00:00+03:00').start; break; } catch {}
    }
    assert.ok(startsAt,'A business slot should exist within the next week.');
    await t.test('a customer cannot book against another customer lead',async()=>{
      await assert.rejects(book({leadId:leadA.id,startsAt,confirmed:true},b),(e:any)=>e.status===403);
    });
    let winner: any;
    await t.test('simultaneous overlapping bookings permit exactly one reservation',async()=>{
      const results=await Promise.allSettled([
        book({leadId:leadA.id,startsAt,confirmed:true},a),
        book({leadId:leadB.id,startsAt,confirmed:true},b)
      ]);
      const successes=results.filter((r):r is PromiseFulfilledResult<any>=>r.status==='fulfilled');
      const failures=results.filter((r):r is PromiseRejectedResult=>r.status==='rejected');
      assert.equal(successes.length,1); assert.equal(failures.length,1); assert.equal(failures[0].reason.status,409);
      winner=successes[0].value;
    });
    await t.test('a repeated confirmed booking returns the original record',async()=>{
      const again=await book({leadId:winner.lead_id,startsAt,confirmed:true},winner.conversation_id);
      assert.equal(again.id,winner.id);
      const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Aden',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(startsAt));
      const slots=await availability(day); assert.equal(slots.slots.some(s=>s.start===startsAt),false);
    });
    await t.test('human takeover invalidates stale actions and suppresses queued AI replies',async()=>{
      const h1=await handoff(a,'CI operator takeover');
      const h2=await handoff(a,'CI repeated takeover'); assert.equal(h1.id,h2.id);
      await assert.rejects(runTool('create_or_update_lead',{name:'Should not change'},{conversationId:a,version:0}));
      const reply=await queueReply(a,'Stale AI answer','agent',nonce+':stale',0); assert.equal('suppressed' in reply && reply.suppressed,true);
      await queueReply(a,'Operator reply remains queued, never sent in CI.','operator',nonce+':operator');
      const [r]=await query("SELECT count(*)::int AS n FROM agentflow.messages WHERE conversation_id=$1 AND author='operator'",[a]); assert.equal(r.n,1);
    });
    await t.test('new customer activity resets follow-up inactivity',async()=>{
      await query("UPDATE agentflow.leads SET last_activity=now()-interval '5 days' WHERE id=$1",[leadB.id]);
      await ingest({...event('customer-b'),eventId:nonce+':b:2',text:'I am still interested.'});
      const [r]=await query("SELECT last_activity>now()-interval '1 minute' AS recent FROM agentflow.leads WHERE id=$1",[leadB.id]); assert.equal(r.recent,true);
      const result=await followups(); assert.equal(result.created,0); // No lead consented; no Gemini request is made.
    });
    await t.test('database rate limits reject excess requests',async()=>{
      await rateLimit(nonce,2); await rateLimit(nonce,2);
      await assert.rejects(rateLimit(nonce,2),(e:any)=>e.status===429);
    });
    await t.test('pgvector stores and compares 768-dimensional vectors',async()=>{
      const [d]=await query("INSERT INTO agentflow.knowledge_documents(title,content,model,status) VALUES('CI synthetic vector','Synthetic vector fixture, not Gemini output','ci-synthetic','ready') RETURNING id");
      const vector=Array.from({length:768},(_,i)=>i===0?1:0);
      await query('INSERT INTO agentflow.knowledge_chunks(document_id,ordinal,content,embedding) VALUES($1,0,$2,$3::vector)',[d.id,'Synthetic CI fixture',JSON.stringify(vector)]);
      const [r]=await query('SELECT 1-(embedding <=> $1::vector) AS similarity FROM agentflow.knowledge_chunks WHERE document_id=$2',[JSON.stringify(vector),d.id]);
      assert.equal(Number(r.similarity),1);
    });
  } finally { await closeDb(); }
});
