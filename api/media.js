const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const backend = String(process.env.PTERODACTYL_BACKEND_URL || '').replace(/\/+$/, '');
  const secret = String(process.env.VPS_PROXY_SECRET || '');
  const name = String(req.query?.name || '').trim();
  if (!backend || !secret) return res.status(503).json({ ok: false, error: 'GATEWAY_NOT_CONFIGURED' });
  if (!/^[A-Za-z0-9._-]{1,180}$/.test(name)) return res.status(400).json({ ok: false, error: 'INVALID_MEDIA' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const upstream = await fetch(`${backend}/media/${encodeURIComponent(name)}`, { method: req.method === 'HEAD' ? 'HEAD' : 'GET', headers: { 'x-ilink-proxy-secret': secret }, signal: controller.signal });
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('x-content-type-options', 'nosniff');
    if (upstream.ok) res.setHeader('cache-control', 'public, max-age=3600');
    res.status(upstream.status);
    if (req.method === 'HEAD' || !upstream.body) { await upstream.body?.cancel(); return res.end(); }
    await pipeline(Readable.fromWeb(upstream.body), res, { signal: controller.signal });
  } catch (error) {
    if (res.headersSent || res.destroyed) { if (!res.destroyed) res.destroy(error); return; }
    return res.status(controller.signal.aborted || error?.name === 'AbortError' ? 504 : 502).json({ ok: false, error: 'MEDIA_BACKEND_UNREACHABLE' });
  } finally { clearTimeout(timer); }
};
