import './env';
import { migrate } from '../lib/admin';
import { closeDb } from '../lib/db';
import { safeError } from '../lib/core.mjs';
try { console.log(await migrate()); } catch (e) { console.error(safeError(e)); process.exitCode = 1; } finally { await closeDb(); }
