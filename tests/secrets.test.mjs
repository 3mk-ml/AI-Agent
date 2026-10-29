import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, createDecipheriv } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const script = resolve('scripts/generate-shared-secrets.mjs');
const keys = ['N8N_WEBHOOK_SECRET', 'TOOL_SECRET', 'INGEST_SECRET', 'TELEGRAM_WEBHOOK_SECRET', 'WHATSAPP_VERIFY_TOKEN'];

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'agentflow-secrets-'));
  mkdirSync(join(dir, '.runtime'));
  const master = randomBytes(32);
  writeFileSync(join(dir, '.runtime', 'master.key'), master);
  const run = (action, env = {}) => spawnSync(process.execPath, [script, action], {
    cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH || '', ...env },
  });
  const read = () => {
    const payload = JSON.parse(readFileSync(join(dir, '.runtime', 'settings.enc'), 'utf8'));
    const decipher = createDecipheriv('aes-256-gcm', master, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]).toString('utf8'));
  };
  return { dir, run, read, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('generation creates five independent encrypted secrets without printing them', () => {
  const f = fixture();
  try {
    const result = f.run('generate');
    assert.equal(result.status, 0, result.stderr);
    const data = f.read();
    assert.equal(new Set(keys.map(k => data[k])).size, keys.length);
    for (const key of keys) {
      assert.match(data[key], /^[a-f0-9]{64}$/);
      assert.equal(result.stdout.includes(data[key]), false);
    }
    const encrypted = readFileSync(join(f.dir, '.runtime', 'settings.enc'), 'utf8');
    for (const key of keys) assert.equal(encrypted.includes(data[key]), false);
  } finally { f.cleanup(); }
});

test('generation is idempotent and preserves all existing encrypted settings', () => {
  const f = fixture();
  try {
    assert.equal(f.run('generate').status, 0);
    const original = f.read();
    const next = f.run('generate');
    assert.equal(next.status, 0, next.stderr);
    assert.deepEqual(f.read(), original);
  } finally { f.cleanup(); }
});

test('generation does not overwrite higher-priority env values', () => {
  const f = fixture();
  try {
    const preexisting = 'existing-environment-only-secret';
    const result = f.run('generate', { TOOL_SECRET: preexisting });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(f.read().TOOL_SECRET, undefined);
    const shown = f.run('show-n8n', { TOOL_SECRET: preexisting });
    assert.equal(shown.status, 0, shown.stderr);
    assert.ok(shown.stdout.includes(preexisting));
    assert.ok(shown.stdout.includes('X-AgentFlow-Tool-Secret'));
  } finally { f.cleanup(); }
});

test('fails closed when the encrypted settings cannot be decrypted', () => {
  const f = fixture();
  try {
    assert.equal(f.run('generate').status, 0);
    const settings = join(f.dir, '.runtime', 'settings.enc');
    const old = readFileSync(settings, 'utf8');
    const payload = JSON.parse(old);
    payload.tag = randomBytes(16).toString('base64');
    writeFileSync(settings, JSON.stringify(payload));
    const res = f.run('generate');
    assert.notEqual(res.status, 0);
    assert.equal(readFileSync(settings, 'utf8'), JSON.stringify(payload));
  } finally { f.cleanup(); }
});
