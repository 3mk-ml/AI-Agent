import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const files = readdirSync('workflows').filter(f => f.endsWith('.json'));
for (const file of files) test('Workflow structure: ' + file, () => {
 const w = JSON.parse(readFileSync('workflows/' + file, 'utf8'));
 assert.ok(w.name.startsWith('AF-')); assert.ok(w.nodes.length >= 2); assert.equal(w.active, false); assert.deepEqual(w.pinData, {});
 const names = new Set(w.nodes.map(n => n.name)); assert.equal(names.size, w.nodes.length);
 const ids = new Set(w.nodes.map(n => n.id)); assert.equal(ids.size, w.nodes.length);
 for (const [source, outputs] of Object.entries(w.connections)) { assert.ok(names.has(source)); for (const groups of Object.values(outputs)) for (const group of groups) for (const edge of group) assert.ok(names.has(edge.node)); }
 for (const n of w.nodes) { assert.ok(n.typeVersion); if (n.type === 'n8n-nodes-base.webhook') assert.equal(n.parameters.authentication, 'headerAuth'); if (n.parameters.url) assert.ok(n.parameters.url.startsWith('http://127.0.0.1:3000/api/')); }
});
test('Shared agent contains real model, memory and six authorized tools', () => {
 const w = JSON.parse(readFileSync('workflows/AF-01-customer-agent.json', 'utf8'));
 assert.ok(w.nodes.some(n => n.type === '@n8n/n8n-nodes-langchain.agent'));
 assert.ok(w.nodes.some(n => n.type === '@n8n/n8n-nodes-langchain.memoryPostgresChat'));
 const tools = w.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequestTool'); assert.equal(tools.length, 6);
 for (const tool of tools) { assert.ok(tool.parameters.jsonBody.includes('contextToken')); assert.ok(tool.parameters.jsonBody.includes("$('Customer message').first()")); assert.equal(tool.parameters.genericAuthType, 'httpHeaderAuth'); }
});
