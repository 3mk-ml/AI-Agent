import './env';
import { SocketModeClient } from '@slack/socket-mode';
import { settings, required } from '../lib/config';
import { normalizeSlack, safeError } from '../lib/core.mjs';
import { ingest } from '../lib/gateway';
import { closeDb } from '../lib/db';
if ((settings().SLACK_MODE || 'socket') !== 'socket') throw new Error('Set Slack mode to socket before running this process.');
const client = new SocketModeClient({ appToken: required('SLACK_APP_TOKEN') });
client.on('events_api', async ({ body, ack }: any) => {
  try { const event = normalizeSlack(body, required('SLACK_TEAM_ID')); if (event) await ingest(event); await ack(); }
  catch (e) { console.error(safeError(e)); }
});
client.on('error', (e: unknown) => console.error(safeError(e)));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, async () => { await client.disconnect(); await closeDb(); process.exit(0); });
await client.start(); console.log('Slack Socket Mode connected. AI processing is performed by npm run worker.');
