import { createHmac, timingSafeEqual, randomBytes, scryptSync } from 'node:crypto';

export function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function sign(payload, secret, ttl = 3600, now = Date.now()) {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(now / 1000) + ttl })).toString('base64url');
  return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
}
export function verify(token, secret, purpose, now = Date.now()) {
  if (!secret || !token || typeof token !== 'string' || token.length > 12000) return null;
  const [body, signature, extra] = token.split('.');
  if (extra || !body || !signature) return null;
  if (!equalSecret(signature, createHmac('sha256', secret).update(body).digest('base64url'))) return null;
  try {
    const value = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (value.purpose !== purpose || !Number.isFinite(value.exp) || value.exp <= now / 1000) return null;
    return value;
  } catch { return null; }
}
export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new Error('Use 12 to 1024 characters');
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function checkPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 1024 || !encoded) return false;
  const [salt, expected] = encoded.split(':');
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(expected || '')) return false;
  return equalSecret(scryptSync(password, salt, 64).toString('hex'), expected);
}
export function verifySlack(raw, timestamp, signature, secret, now = Date.now()) {
  if (!secret || !/^\d+$/.test(timestamp || '') || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  return equalSecret(signature, 'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${raw}`).digest('hex'));
}
export function verifyMeta(raw, signature, secret) {
  return Boolean(secret) && equalSecret(signature, 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex'));
}
export function sessionKey(channel, account, user, thread = '') {
  return [channel, account, user, thread].map(x => encodeURIComponent(String(x))).join(':');
}
export function chunkText(text, size = 1200, overlap = 180) {
  if (size <= overlap || overlap < 0) throw new Error('Invalid chunk size');
  const clean = String(text).replace(/\r\n/g, '\n').trim();
  const result = [];
  for (let i = 0; i < clean.length; i += size - overlap) { result.push(clean.slice(i, i + size)); if (i + size >= clean.length) break; }
  return result;
}
export function unitVector(values, dimension = 768) {
  if (!Array.isArray(values) || values.length !== dimension || values.some(x => !Number.isFinite(x))) throw new Error('Invalid embedding dimensions');
  const norm = Math.sqrt(values.reduce((s, x) => s + x * x, 0));
  if (!norm || !Number.isFinite(norm)) throw new Error('Invalid embedding norm');
  return values.map(x => x / norm);
}
export function scoreLead(lead) {
  const factors = { contact: lead.email ? 20 : 0, need: lead.interest ? 25 : 0, company: lead.company ? 15 : 0, budget: lead.budget ? 20 : 0, timeline: lead.timeline ? 20 : 0 };
  return { score: Object.values(factors).reduce((a, b) => a + b, 0), factors };
}
export function backoff(attempt, random = Math.random()) { return Math.min(300000, 2000 * 2 ** Math.max(0, attempt - 1)) + Math.floor(random * 1000); }
export function withinWindow(lastInbound, now = Date.now()) { return Number.isFinite(Date.parse(lastInbound)) && now - Date.parse(lastInbound) >= 0 && now - Date.parse(lastInbound) < 24 * 3600000; }
export function safeError(error) {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/postgres(?:ql)?:\/\/\S+/gi, '[database connection redacted]').replace(/(Bearer\s+)[^\s]+/gi, '$1[redacted]').replace(/bot\d+:[\w-]+/g, 'bot[redacted]').replace(/AIza[\w-]+/g, '[key redacted]').replace(/xox[baprs]-[\w-]+/g, '[Slack token redacted]').slice(0, 500);
}
const commands = { '/start': 'Please introduce your business and how you can help.', '/help': 'What can you help me with? Please mention how I can request a human.', '/services': 'What business services do you offer?', '/book': 'I would like to book a discovery call.', '/status': 'What is the status of my own lead?', '/human': '/human' };
export function normalizeTelegram(update) {
  const callback = update.callback_query;
  const m = callback ? { ...callback.message, from: callback.from, text: commands[callback.data] ? callback.data : '', date: Math.floor(Date.now() / 1000) } : update.message;
  if (!m || !m.from || m.from.is_bot || m.chat?.type !== 'private' || !Number.isFinite(m.date)) return null;
  if (callback && !commands[callback.data]) return null;
  const attachment = m.document || m.voice || m.audio || m.photo?.at(-1);
  const mime = attachment?.mime_type || (m.voice ? 'audio/ogg' : m.photo ? 'image/jpeg' : m.audio ? 'audio/mpeg' : undefined);
  const command = String(m.text || '').split(/\s/)[0];
  return { channel: 'telegram', account: 'bot', externalKey: sessionKey('telegram', 'bot', m.chat.id), eventId: String(update.update_id), displayName: [m.from.first_name, m.from.last_name].filter(Boolean).join(' ') || 'Telegram customer', text: commands[command] || m.text || m.caption || '[Customer sent an attachment]', target: { chat_id: m.chat.id, showMenu: command === '/start' || command === '/help' }, receivedAt: new Date(m.date * 1000).toISOString(), ...(attachment ? { media: { id: attachment.file_id, mime, size: attachment.file_size } } : {}) };
}
export function normalizeSlack(body, teamId) {
  const e = body.event;
  if (!e || e.bot_id || (e.subtype && e.subtype !== 'file_share') || !e.user || !teamId || body.team_id !== teamId || !Number.isFinite(Number(e.ts))) return null;
  if (e.type !== 'app_mention' && !(e.type === 'message' && e.channel_type === 'im')) return null;
  const thread = e.thread_ts || (e.channel_type === 'im' ? '' : e.ts);
  const file = e.files?.[0];
  return { channel: 'slack', account: teamId, externalKey: sessionKey('slack', teamId, e.user, `${e.channel}:${thread}`), eventId: body.event_id, displayName: e.user, text: String(e.text || '').replace(/<@[^>]+>/g, '').trim() || '[Customer sent an attachment]', target: { channel: e.channel, thread_ts: thread || undefined, user: e.user }, receivedAt: new Date(Number(e.ts) * 1000).toISOString(), ...(file ? { media: { id: file.id, url: file.url_private_download || file.url_private, mime: file.mimetype, size: file.size } } : {}) };
}
export function normalizeWhatsApp(body, phoneId) {
  const result = [];
  for (const entry of body.entry || []) for (const change of entry.changes || []) {
    const v = change.value;
    if (v?.metadata?.phone_number_id !== phoneId) continue;
    for (const m of v.messages || []) {
      if (!Number.isFinite(Number(m.timestamp))) continue;
      const media = m.image || m.audio || m.document;
      result.push({ channel: 'whatsapp', account: phoneId, externalKey: sessionKey('whatsapp', phoneId, m.from), eventId: m.id, displayName: v.contacts?.find(c => c.wa_id === m.from)?.profile?.name || m.from, text: m.text?.body || m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || media?.caption || '[Customer sent an attachment]', target: { to: m.from }, receivedAt: new Date(Number(m.timestamp) * 1000).toISOString(), ...(media ? { media: { id: media.id, mime: media.mime_type } } : {}) });
    }
  }
  return result;
}
