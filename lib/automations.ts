import { z } from 'zod';
import { query } from './db';
import { generateJSON, triageSchema, invoiceSchema } from './ai';
import { settings, required } from './config';
import { remoteJson, jsonHeaders } from './http';
import { createSign } from 'node:crypto';

export async function processAutomation(id: string, input: any) {
 const [item]=await query('SELECT * FROM agentflow.automation_items WHERE id=$1',[id]);if(!item)return;
 let data: unknown;
 if(item.kind==='triage')data=await generateJSON('Classify the email into sales/support/billing/other and low/normal/high urgency. Return {category,urgency,summary,draft,owner}, owner is sales/support/finance/operations. Draft only; do not send.',[{text:JSON.stringify(input)}],triageSchema);
 else if(item.kind==='document')data=await generateJSON('Extract invoice/form facts. Return {vendor,invoice_number,invoice_date,currency,subtotal,tax,total,items:[{description,quantity,amount}],warnings:[]}. Unknown scalar fields must be null. Never infer missing prices or identities. Warn about ambiguous values.',input.base64?[{inlineData:{mimeType:input.mime,data:input.base64}}]:[{text:input.text}],invoiceSchema);
 else throw new Error('Unsupported automation kind');
 await query("UPDATE agentflow.automation_items SET data=$2,status='review' WHERE id=$1",[id,data]);return data;
}
export async function followups() {
 const leads=await query("SELECT * FROM agentflow.leads WHERE stage IN ('new','qualified','contacted') AND consent=true AND last_activity<now()-interval '2 days' ORDER BY last_activity LIMIT 10");
 let created=0;for(const l of leads){const key=`followup:${l.id}:${new Date(l.last_activity).toISOString()}`;const [item]=await query("INSERT INTO agentflow.automation_items(kind,title,dedup_key,status,data) VALUES('followup',$1,$2,'processing',$3) ON CONFLICT DO NOTHING RETURNING id",['Follow up with '+l.name,key,{leadId:l.id}]);if(!item)continue;
  try{const draft=await generateJSON('Write a short non-pushy follow-up draft. Do not promise prices or services beyond the input. Return {subject,body}. This is a draft, not an outbound send.',[{text:JSON.stringify({name:l.name,company:l.company,interest:l.interest})}],z.object({subject:z.string().max(200),body:z.string().max(3000)}));await query("UPDATE agentflow.automation_items SET data=$2,status='draft' WHERE id=$1",[item.id,{leadId:l.id,...draft}]);created++;}catch(e){await query("UPDATE agentflow.automation_items SET status='failed' WHERE id=$1",[item.id]);throw e;}}
 return {created,policy:'Draft only. No external message has been sent.'};
}
function cell(x: unknown) {const s=typeof x==='string'?x:JSON.stringify(x??'');return /^[\s]*[=+\-@]/.test(s)?"'"+s:s;}
export async function exportItem(id: string, destination: 'airtable'|'sheets') {
 const [item]=await query('SELECT * FROM agentflow.automation_items WHERE id=$1',[id]);if(!item||!['review','draft'].includes(item.status))throw new Error('Select a processed item for review/export.');
 if(destination==='airtable') {
  const base=required('AIRTABLE_BASE_ID'),table=required('AIRTABLE_TABLE_ID');if(!/^app\w+$/.test(base)||!/^tbl\w+$/.test(table))throw new Error('Use Airtable base and table IDs.');
  return remoteJson(`https://api.airtable.com/v0/${base}/${table}`,{method:'POST',headers:jsonHeaders(required('AIRTABLE_TOKEN')),body:JSON.stringify({records:[{fields:{RecordID:item.id,Kind:item.kind,Title:cell(item.title),Payload:cell(item.data)}}]})});
 }
 const service=JSON.parse(required('GOOGLE_SERVICE_ACCOUNT_JSON'));const now=Math.floor(Date.now()/1000);const enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');const unsigned=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:service.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const signature=createSign('RSA-SHA256').update(unsigned).sign(service.private_key,'base64url');
 const auth=await remoteJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+signature})});
 const sheet=required('GOOGLE_SHEET_ID');if(!/^[a-zA-Z0-9_-]+$/.test(sheet))throw new Error('Invalid spreadsheet ID');
 return remoteJson(`https://sheets.googleapis.com/v4/spreadsheets/${sheet}/values/${encodeURIComponent('AgentFlow!A:E')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',headers:jsonHeaders(auth.access_token),body:JSON.stringify({values:[[item.id,item.kind,cell(item.title),cell(item.data),new Date(item.created_at).toISOString()]]})});
}
