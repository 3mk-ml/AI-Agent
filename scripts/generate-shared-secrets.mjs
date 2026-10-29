import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Local-only setup utility. Never send values to GitHub, n8n, or a remote endpoint.
const n8nKeys = ['N8N_WEBHOOK_SECRET', 'TOOL_SECRET', 'INGEST_SECRET'];
const providerKeys = ['TELEGRAM_WEBHOOK_SECRET', 'WHATSAPP_VERIFY_TOKEN'];
const keys = [...n8nKeys, ...providerKeys];
const headers = {
  N8N_WEBHOOK_SECRET: 'X-AgentFlow-Webhook-Secret',
  TOOL_SECRET: 'X-AgentFlow-Tool-Secret',
  INGEST_SECRET: 'X-AgentFlow-Ingest-Secret',
};
const action = process.argv[2] || 'generate';
if (!['generate', 'show-n8n', 'show-providers'].includes(action)) {
  console.error('Usage: node scripts/generate-shared-secrets.mjs [generate|show-n8n|show-providers]');
  process.exit(2);
}

const runtime = path.resolve('.runtime');
const masterFile = path.join(runtime, 'master.key');
const settingsFile = path.join(runtime, 'settings.enc');
if (!existsSync(masterFile)) {
  console.error('Missing local encryption key. Run `npm run setup` first.');
  process.exit(1);
}
const master = readFileSync(masterFile);
if (master.length !== 32) throw new Error('Invalid local settings key length. Restore your original runtime key.');

function readEncryptedSettings() {
  if (!existsSync(settingsFile)) return {};
  const payload = JSON.parse(readFileSync(settingsFile, 'utf8'));
  const decipher = createDecipheriv('aes-256-gcm', master, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  const settings = JSON.parse(plaintext);
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('Local settings must be a JSON object.');
  }
  return settings;
}

function writeEncryptedSettings(settings) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', master, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(settings)), cipher.final()]);
  const payload = JSON.stringify({
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64'),
  });
  const temp = `${settingsFile}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  writeFileSync(temp, payload, { flag: 'wx', mode: 0o600 });
  try { renameSync(temp, settingsFile); }
  catch (error) { try { unlinkSync(temp); } catch { /* no temp file to remove */ } throw error; }
}

// Respect the same higher-priority environment/local file overrides as the app.
function localEnvironment() {
  const values = {};
  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      let value = match[2];
      if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
        value = value.slice(1, -1);
      } else {
        value = value.replace(/\s+#.*$/, '').trim();
      }
      values[match[1]] = value;
    }
  }
  return values;
}

const stored = readEncryptedSettings();
const files = localEnvironment();
const effective = key => process.env[key] || files[key] || stored[key] || '';

if (action === 'generate') {
  const added = [];
  for (const key of keys) {
    if (effective(key)) continue;
    stored[key] = randomBytes(32).toString('hex');
    added.push(key);
  }
  if (added.length) writeEncryptedSettings(stored);
  for (const key of keys) {
    const status = added.includes(key) ? 'generated in encrypted local settings' : 'already configured; left unchanged';
    console.log(`${key}: ${status}`);
  }
  console.log('No secret values were printed or added to Git.');
  console.log('To copy these values into the n8n Header Auth credentials, run `npm run secrets:show-n8n` locally.');
  console.log('For optional Telegram/WhatsApp webhook verification tokens, run `npm run secrets:show-providers` locally.');
} else {
  const selected = action === 'show-n8n' ? n8nKeys : providerKeys;
  const missing = selected.filter(key => !effective(key));
  if (missing.length) {
    console.error(`Missing ${missing.join(', ')}. Run npm run secrets:generate first.`);
    process.exit(1);
  }
  console.log('PRIVATE LOCAL OUTPUT - do not share, screenshot, or commit this terminal text.');
  if (action === 'show-n8n') {
    console.log('Copy each Name/Value pair into its matching n8n HTTP Header Auth credential.');
  } else {
    console.log('Copy TELEGRAM_WEBHOOK_SECRET to Telegram webhook configuration and WHATSAPP_VERIFY_TOKEN to Meta webhook verification.');
  }
  for (const key of selected) {
    console.log(action === 'show-n8n'
      ? `\n${key}\n  Name: ${headers[key]}\n  Value: ${effective(key)}`
      : `\n${key}\n  Value: ${effective(key)}`);
  }
}
