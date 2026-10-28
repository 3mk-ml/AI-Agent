import './env';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { required, settings, appUrl } from '../lib/config';
import { remoteJson } from '../lib/http';
import { safeError } from '../lib/core.mjs';
// Creates drafts only. Credentials must be bound and workflows published in the n8n editor.
try {
  const base = required('N8N_URL'); const headers = { 'Content-Type': 'application/json', 'X-N8N-API-KEY': required('N8N_API_KEY') };
  const existing: any[] = []; let cursor = '';
  do { const page = await remoteJson(new URL('/api/v1/workflows?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), base).toString(), { headers }); existing.push(...(page.data || [])); cursor = page.nextCursor || ''; } while (cursor);
  const records: any[] = [];
  const files = readdirSync('workflows').filter(f => f.endsWith('.json')).sort((a, b) => Number(b.startsWith('AF-99')) - Number(a.startsWith('AF-99')) || a.localeCompare(b));
  let errorWorkflowId = existing.find(w => w.name === 'AF-99 Error Monitoring')?.id;
  for (const file of files) {
    const w = JSON.parse(readFileSync('workflows/' + file, 'utf8'));
    const found = existing.find(x => x.name === w.name);
    if (found) { console.log('Preserved existing workflow: ' + w.name); records.push({ name: w.name, id: found.id, status: 'preserved' }); continue; }
    for (const node of w.nodes) {
      if (node.parameters?.url?.startsWith('http://127.0.0.1:3000/')) node.parameters.url = new URL(node.parameters.url).pathname.startsWith('/api/') ? new URL(new URL(node.parameters.url).pathname, appUrl()).toString() : node.parameters.url;
      if (node.type === '@n8n/n8n-nodes-langchain.lmChatGoogleGemini' && settings().GEMINI_MODEL) node.parameters.modelName = 'models/' + settings().GEMINI_MODEL.replace(/^models\//, '');
      // Credential labels are instructions, not real credential IDs. Leave nodes unbound on import.
      delete node.credentials;
    }
    const workflowSettings = { ...w.settings, ...(errorWorkflowId && !file.startsWith('AF-99') ? { errorWorkflow: errorWorkflowId } : {}) };
    const created = await remoteJson(new URL('/api/v1/workflows', base).toString(), { method: 'POST', headers, body: JSON.stringify({ name: w.name, nodes: w.nodes, connections: w.connections, settings: workflowSettings }) });
    if (file.startsWith('AF-99')) errorWorkflowId = created.id;
    records.push({ name: w.name, id: created.id, status: 'draft' }); console.log('Created draft: ' + w.name);
  }
  mkdirSync('.runtime', { recursive: true }); writeFileSync('.runtime/imported-workflows.json', JSON.stringify(records, null, 2));
  console.log('Open n8n and bind credentials. No workflow was activated and no external message was sent.');
} catch (e) { console.error(safeError(e)); process.exitCode = 1; }
