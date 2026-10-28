const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'private, no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  const backend = String(process.env.PTERODACTYL_BACKEND_URL || '').replace(/\/+$/, '');
  const secret = String(process.env.VPS_PROXY_SECRET || '');
  const rawPath = String(req.query?.path || '');
  if (!backend || !secret) return res.status(503).json({ ok: false, error: 'GATEWAY_NOT_CONFIGURED', message: 'PTERODACTYL_BACKEND_URL / VPS_PROXY_SECRET belum diisi di Vercel.' });
  if (!rawPath.startsWith('/api/admin/') && !rawPath.startsWith('/api/reseller/')) return res.status(400).json({ ok: false, error: 'INVALID_GATEWAY_PATH' });
  const controller = new AbortController();
  const configuredTimeout = Number(process.env.GATEWAY_TIMEOUT_MS || 50000);
  const timeoutMs = Number.isFinite(configuredTimeout) ? Math.max(5000, Math.min(55000, configuredTimeout)) : 50000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const headers = { 'x-ilink-proxy-secret': secret, 'x-forwarded-for': String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '') };
    if (req.headers.authorization) headers.authorization = req.headers.authorization;
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
    let body;
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (Buffer.isBuffer(req.body) || typeof req.body === 'string') body = req.body;
      else if (req.body != null) { body = JSON.stringify(req.body); headers['content-type'] ||= 'application/json'; }
    }
    const upstream = await fetch(`${backend}${rawPath}`, { method: req.method, headers, body, signal: controller.signal });
    res.setHeader('Server-Timing', `backend;dur=${(performance.now() - started).toFixed(1)}`);
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/octet-stream');
    const disposition = upstream.headers.get('content-disposition');
    if (disposition) res.setHeader('content-disposition', disposition);
    res.status(upstream.status);
    if (req.method === 'HEAD' || !upstream.body || [204, 304].includes(upstream.status)) { await upstream.body?.cancel(); return res.end(); }
    // Fetch decodes gzip, so do not forward upstream length/encoding headers.
    await pipeline(Readable.fromWeb(upstream.body), res, { signal: controller.signal });
  } catch (error) {
    if (res.headersSent || res.destroyed) { if (!res.destroyed) res.destroy(error); return; }
    const timedOut = controller.signal.aborted || error?.name === 'AbortError';
    return res.status(timedOut ? 504 : 502).json({ ok: false, error: timedOut ? 'BACKEND_TIMEOUT' : 'BACKEND_UNREACHABLE', message: timedOut ? 'Backend Pterodactyl terlalu lama merespons.' : 'Vercel tidak dapat terhubung ke backend Pterodactyl.' });
  } finally { clearTimeout(timer); }
};
