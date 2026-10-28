import http from 'node:http';
import { request } from 'node:http';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
const target = new URL(process.env.APP_URL || 'http://127.0.0.1:3000');
if (target.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(target.hostname)) throw new Error('Development ingress must proxy to a loopback HTTP application.');
const allowed = new Set(['/api/hooks/whatsapp','/api/hooks/telegram','/api/hooks/slack']);
http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (!allowed.has(url.pathname) || !['GET','POST'].includes(req.method || '')) { res.writeHead(404); res.end('Not found'); return; }
  if (Number(req.headers['content-length'] || 0) > 1024 * 1024) { res.writeHead(413); res.end(); return; }
  let size = 0; const chunks = [];
  req.on('data', chunk => { size += chunk.length; if (size > 1024 * 1024) { res.writeHead(413); res.end(); req.destroy(); } else chunks.push(chunk); });
  req.on('end', () => {
    if (res.writableEnded) return;
    const upstream = request(new URL(url.pathname + url.search, target), { method: req.method, headers: { ...req.headers, host: target.host, 'content-length': String(size) }, timeout: 15000 }, response => { res.writeHead(response.statusCode || 502, { 'content-type': response.headers['content-type'] || 'application/json', 'cache-control': 'no-store' }); response.pipe(res); });
    upstream.on('timeout', () => upstream.destroy(new Error('Upstream timeout')));
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Upstream unavailable'); });
    upstream.end(Buffer.concat(chunks));
  });
}).listen(3001, '127.0.0.1', () => console.log('Webhook-only ingress on 127.0.0.1:3001. Tunnel this port, NEVER the dashboard or n8n editor.'));
