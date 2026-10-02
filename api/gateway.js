module.exports = async function handler(req, res) {
  const backend = String(process.env.PTERODACTYL_BACKEND_URL || '').replace(/\/+$/, '');
  const secret = String(process.env.VPS_PROXY_SECRET || '');
  const rawPath = String(req.query && req.query.path || '');

  if (!backend || !secret) {
    return res.status(503).json({ ok: false, error: 'GATEWAY_NOT_CONFIGURED', message: 'PTERODACTYL_BACKEND_URL / VPS_PROXY_SECRET belum diisi di Vercel.' });
  }
  if (!rawPath.startsWith('/api/admin/')) {
    return res.status(400).json({ ok: false, error: 'INVALID_GATEWAY_PATH' });
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(5000, Math.min(55000, Number(process.env.GATEWAY_TIMEOUT_MS || 50000)));
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const target = `${backend}${rawPath}`;
    const headers = {
      'x-ilink-proxy-secret': secret,
      'x-forwarded-for': String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''),
    };
    if (req.headers.authorization) headers.authorization = req.headers.authorization;
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];

    let body;
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (Buffer.isBuffer(req.body)) body = req.body;
      else if (typeof req.body === 'string') body = req.body;
      else if (req.body != null) {
        body = JSON.stringify(req.body);
        headers['content-type'] = headers['content-type'] || 'application/json';
      }
    }

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
    });

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const disposition = upstream.headers.get('content-disposition');
    if (disposition) res.setHeader('content-disposition', disposition);
    res.setHeader('content-type', contentType);
    res.setHeader('cache-control', 'no-store, max-age=0');
    res.status(upstream.status);

    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.send(buffer);
  } catch (error) {
    const timedOut = error && error.name === 'AbortError';
    return res.status(timedOut ? 504 : 502).json({
      ok: false,
      error: timedOut ? 'BACKEND_TIMEOUT' : 'BACKEND_UNREACHABLE',
      message: timedOut ? 'Backend Pterodactyl terlalu lama merespons.' : 'Vercel tidak dapat terhubung ke backend Pterodactyl.'
    });
  } finally {
    clearTimeout(timer);
  }
};
