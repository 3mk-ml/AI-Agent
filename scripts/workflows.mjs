import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const origin = new URL(process.env.APP_URL || 'http://127.0.0.1:3000').origin;
const destination = path.resolve('.runtime/workflows'); mkdirSync(destination, { recursive: true });
for (const file of readdirSync('workflows').filter(f => f.endsWith('.json'))) {
  const workflow = JSON.parse(readFileSync(path.join('workflows', file), 'utf8'));
  if (!workflow.name || !Array.isArray(workflow.nodes) || !workflow.connections) throw new Error('Invalid workflow ' + file);
  const names = new Set(workflow.nodes.map(n => n.name));
  for (const [name, output] of Object.entries(workflow.connections)) {
    if (!names.has(name)) throw new Error('Missing source node: ' + name);
    for (const groups of Object.values(output)) for (const group of groups) for (const edge of group) if (!names.has(edge.node)) throw new Error('Missing target node: ' + edge.node);
  }
  for (const node of workflow.nodes) {
    if (node.parameters?.url?.startsWith('http://127.0.0.1:3000/')) node.parameters.url = origin + new URL(node.parameters.url).pathname;
    if (node.type === '@n8n/n8n-nodes-langchain.lmChatGoogleGemini' && process.env.GEMINI_MODEL) node.parameters.modelName = 'models/' + process.env.GEMINI_MODEL.replace(/^models\//, '');
  }
  writeFileSync(path.join(destination, file), JSON.stringify(workflow, null, 2) + '\n');
  console.log('Validated and prepared: ' + file);
}
console.log('Prepared exports are in .runtime/workflows. This checks structure, NOT successful n8n execution.');
