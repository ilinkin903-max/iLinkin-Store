# iLink Auto Order v2.3.0 — Vercel Dashboard

Deploy ke project Vercel yang sama dengan versi sebelumnya.

## Environment
```env
PTERODACTYL_BACKEND_URL=http://legal-private.jhonaleystore.id:PORT_SERVER
VPS_PROXY_SECRET=SECRET_YANG_SAMA_DENGAN_VPS
GATEWAY_TIMEOUT_MS=50000
```

Tidak ada BOT_TOKEN, API key supplier, API key AutoGoPay, atau database di Vercel.

## Update
Upload/deploy seluruh isi ZIP v2.3.0 ke project Vercel yang sama. Root project harus berisi:
```text
index.html
app.js
app.css
vercel.json
api/
```

Sesudah deploy cek:
- `/`
- `/dashboard`
- `/api/health`

## Media VPS
Media `vps://...` ditampilkan melalui `/api/media` yang meneruskan file dari Pterodactyl menggunakan shared secret. Pengguna tidak perlu mengetahui URL backend Pterodactyl.
