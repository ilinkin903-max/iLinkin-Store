module.exports = async function handler(req, res) {
  const backend = String(process.env.PTERODACTYL_BACKEND_URL || '').replace(/\/+$/, '');
  if (!backend) return res.status(503).json({ ok: false, error: 'BACKEND_NOT_CONFIGURED' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const upstream = await fetch(`${backend}/health`, { signal: controller.signal });
    const data = await upstream.json().catch(() => ({ ok: false }));
    return res.status(upstream.ok ? 200 : 502).json({ gateway: 'vercel', backend: data });
  } catch (error) {
    return res.status(502).json({ ok: false, gateway: 'vercel', error: 'BACKEND_UNREACHABLE' });
  } finally {
    clearTimeout(timer);
  }
};
