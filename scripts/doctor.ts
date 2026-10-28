import './env';
import { diagnostics } from '../lib/admin';
import { closeDb } from '../lib/db';
try { console.log(JSON.stringify(await diagnostics(), null, 2)); } finally { await closeDb(); }
