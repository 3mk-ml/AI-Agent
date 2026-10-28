import { NextRequest, NextResponse } from 'next/server';
import { required, settings } from './config';
import { rawBody, reply, fail } from './api';
import { equalSecret, verifyMeta, verifySlack, normalizeTelegram, normalizeSlack, normalizeWhatsApp, sessionKey } from './core.mjs';
import { ingest, deliveryEvents } from './gateway';

export async function webhook(req: NextRequest, channel?: string) {
  if (!['telegram','slack','whatsapp'].includes(channel || '')) fail('Unknown channel.', 404);
  if (channel === 'whatsapp' && req.method === 'GET') {
    const p = req.nextUrl.searchParams;
    if (p.get('hub.mode') !== 'subscribe' || !equalSecret(p.get('hub.verify_token'), required('WHATSAPP_VERIFY_TOKEN'))) fail('Invalid verification token.', 403);
    return new NextResponse(p.get('hub.challenge') || '', { headers: { 'Content-Type': 'text/plain' } });
  }
  if (req.method !== 'POST') fail('Use POST.', 405);
  const raw = await rawBody(req, 1024 * 1024); const c = settings();
  if (channel === 'whatsapp' && !verifyMeta(raw, req.headers.get('x-hub-signature-256'), required('WHATSAPP_APP_SECRET'))) fail('Invalid Meta signature.', 401);
  if (channel === 'slack' && !verifySlack(raw, req.headers.get('x-slack-request-timestamp'), req.headers.get('x-slack-signature'), required('SLACK_SIGNING_SECRET'))) fail('Invalid Slack signature or timestamp.', 401);
  if (channel === 'telegram' && !equalSecret(req.headers.get('x-telegram-bot-api-secret-token'), required('TELEGRAM_WEBHOOK_SECRET'))) fail('Invalid Telegram webhook secret.', 401);
  let data: any; try { data = JSON.parse(raw); } catch { fail('Invalid JSON.'); }
  if (channel === 'slack' && data.type === 'url_verification') return reply({ challenge: data.challenge });
  if (channel === 'telegram') {
    if ((c.TELEGRAM_MODE || 'polling') !== 'webhook') fail('Telegram is configured for polling, not webhooks.', 409);
    const event = normalizeTelegram(data);
    if (event) { event.account = required('TELEGRAM_BOT_TOKEN').split(':')[0]; event.externalKey = sessionKey('telegram', event.account, event.target.chat_id); await ingest(event); }
  }
  if (channel === 'slack') { if ((c.SLACK_MODE || 'socket') !== 'webhook') fail('Slack is configured for Socket Mode.', 409); const e = normalizeSlack(data, required('SLACK_TEAM_ID')); if (e) await ingest(e); }
  if (channel === 'whatsapp') { for (const e of normalizeWhatsApp(data, required('WHATSAPP_PHONE_NUMBER_ID'))) await ingest(e); await deliveryEvents(data, required('WHATSAPP_PHONE_NUMBER_ID')); }
  // Acknowledge only after durable ingestion. The worker performs slow AI calls.
  return reply({ ok: true });
}
