import { mkdirSync, existsSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
const dir = path.resolve('.runtime'); mkdirSync(dir, { recursive: true, mode: 0o700 });
for (const [name, data] of [['master.key', randomBytes(32)], ['session.key', randomBytes(48).toString('base64url')]]) {
  const file = path.join(dir, name); if (!existsSync(file)) writeFileSync(file, data, { flag: 'wx', mode: 0o600 });
}
if (!existsSync(path.join(dir, 'admin.json'))) {
  const file = path.join(dir, 'bootstrap.token');
  if (!existsSync(file)) writeFileSync(file, randomBytes(24).toString('base64url'), { flag: 'wx', mode: 0o600 });
  console.log('\nOpen http://127.0.0.1:3000/login after npm run dev.');
  console.log('One-time setup token (local only; do not share): ' + readFileSync(file, 'utf8'));
} else console.log('Administrator already initialized. No credentials were replaced.');
console.log('Private runtime keys are excluded from Git. Back them up securely; losing master.key makes saved settings unreadable.');
