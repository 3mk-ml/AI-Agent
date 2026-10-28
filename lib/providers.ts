import { required, settings } from './config';
import { remoteJson, RemoteError, jsonHeaders } from './http';
import { withinWindow } from './core.mjs';

export async function telegram(method: string, payload: any, timeout = 30000) {
  const d = await remoteJson(`https://api.telegram.org/bot${required('TELEGRAM_BOT_TOKEN')}/${method}`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(payload) }, timeout);
  if (!d.ok) throw new RemoteError('Telegram: ' + String(d.description || 'request rejected'), d.error_code || 400, d.parameters?.retry_after || 0);
  return d.result;
}
export async function slack(method: string, payload: any) {
  const d = await remoteJson('https://slack.com/api/' + method, { method: 'POST', headers: jsonHeaders(required('SLACK_BOT_TOKEN')), body: JSON.stringify(payload) });
  if (!d.ok) throw new RemoteError('Slack: ' + String(d.error || 'request rejected'), d.error === 'ratelimited' ? 429 : 400);
  return d;
}
function graph() { const v = required('META_GRAPH_VERSION'); if (!/^v\d+\.\d+$/.test(v)) throw new Error('Set META_GRAPH_VERSION to a supported Graph API version from your Meta app.'); return `https://graph.facebook.com/${v}`; }
export async function sendMessage(conv: any, text: string, template?: any) {
  if (conv.channel === 'website') return { id: undefined, status: 'available' };
  if (conv.channel === 'telegram') {
    const menu = conv.target.showMenu ? { reply_markup: { inline_keyboard: [[{ text: 'Our services', callback_data: '/services' }, { text: 'Book a call', callback_data: '/book' }], [{ text: 'Speak to a human', callback_data: '/human' }]] } } : {};
    const d = await telegram('sendMessage', { chat_id: conv.target.chat_id, text, link_preview_options: { is_disabled: true }, ...menu });
    return { id: String(d.message_id), status: 'sent' };
  }
  if (conv.channel === 'slack') {
    const d = await slack('chat.postMessage', { channel: conv.target.channel, thread_ts: conv.target.thread_ts || undefined, text: text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), mrkdwn: false, unfurl_links: false, unfurl_media: false });
    return { id: d.ts, status: 'sent' };
  }
  if (conv.channel === 'whatsapp') {
    if (!template && !withinWindow(new Date(conv.last_inbound_at).toISOString())) throw new RemoteError('WhatsApp customer-service window closed. Use an approved template with recorded consent.', 400);
    const payload = template ? { type: 'template', template: { name: template.name, language: { code: template.language }, ...(template.parameters?.length ? { components: [{ type: 'body', parameters: template.parameters.map((text: string) => ({ type: 'text', text })) }] } : {}) } } : { type: 'text', text: { preview_url: false, body: text } };
    const d = await remoteJson(`${graph()}/${required('WHATSAPP_PHONE_NUMBER_ID')}/messages`, { method: 'POST', headers: jsonHeaders(required('WHATSAPP_ACCESS_TOKEN')), body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: conv.target.to, ...payload }) });
    if (!d.messages?.[0]?.id) throw new RemoteError('WhatsApp did not return a message ID.', 502, 0, true);
    return { id: d.messages[0].id, status: 'sent' };
  }
  throw new Error('Unsupported messaging channel');
}
export async function notify(message: string) {
  const c = settings();
  if (c.SLACK_HANDOFF_CHANNEL && c.SLACK_BOT_TOKEN) await slack('chat.postMessage', { channel: c.SLACK_HANDOFF_CHANNEL, text: message, mrkdwn: false });
  if (c.SMTP_HOST && c.ALERT_EMAIL) {
    const { default: nodemailer } = await import('nodemailer');
    const transport = nodemailer.createTransport({ host: c.SMTP_HOST, port: Number(c.SMTP_PORT || 587), secure: Number(c.SMTP_PORT || 587) === 465, requireTLS: Number(c.SMTP_PORT || 587) !== 465, auth: { user: c.SMTP_USER, pass: c.SMTP_PASSWORD } });
    await transport.sendMail({ from: c.SMTP_FROM, to: c.ALERT_EMAIL, subject: 'AgentFlow operations alert', text: message });
  }
}
export async function mediaBytes(channel: string, media: any) {
  const limit = 8 * 1024 * 1024;
  if (media.size && media.size > limit) throw new Error('Attachment exceeds 8 MB.');
  let url = '', headers: Record<string, string> = {}, mime = media.mime || '';
  if (channel === 'telegram') {
    const f = await telegram('getFile', { file_id: media.id });
    if (f.file_size > limit) throw new Error('Attachment exceeds 8 MB.');
    if (!/^[a-zA-Z0-9_./-]+$/.test(f.file_path) || f.file_path.includes('..')) throw new Error('Invalid Telegram file path');
    url = `https://api.telegram.org/file/bot${required('TELEGRAM_BOT_TOKEN')}/${f.file_path}`;
  } else if (channel === 'whatsapp') {
    const f = await remoteJson(`${graph()}/${encodeURIComponent(media.id)}`, { headers: { Authorization: `Bearer ${required('WHATSAPP_ACCESS_TOKEN')}` } });
    url = f.url; mime = f.mime_type || mime; const u = new URL(url);
    if (u.protocol !== 'https:' || !['.facebook.com','.fbsbx.com'].some(h => u.hostname.endsWith(h))) throw new Error('Unexpected Meta media host');
    headers.Authorization = `Bearer ${required('WHATSAPP_ACCESS_TOKEN')}`;
  } else if (channel === 'slack') {
    url = media.url; const u = new URL(url);
    if (u.protocol !== 'https:' || !u.hostname.endsWith('.slack.com')) throw new Error('Unexpected Slack media host');
    headers.Authorization = `Bearer ${required('SLACK_BOT_TOKEN')}`;
  } else throw new Error('Unsupported media channel');
  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok || Number(response.headers.get('content-length') || 0) > limit) throw new Error('Media download failed or exceeded 8 MB');
  const reader = response.body?.getReader(); if (!reader) throw new Error('No attachment body');
  const chunks: Uint8Array[] = []; let count = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; count += value.length; if (count > limit) { await reader.cancel(); throw new Error('Attachment exceeds 8 MB'); } chunks.push(value); }
  mime = mime || response.headers.get('content-type')?.split(';')[0] || '';
  if (!/^(image\/(jpeg|png|webp)|audio\/(mpeg|mp3|ogg|wav|mp4|webm)|application\/pdf)$/.test(mime)) throw new Error('Unsupported attachment format. Send text, a PDF, an image or supported audio.');
  return { inlineData: { mimeType: mime, data: Buffer.concat(chunks).toString('base64') } };
}
