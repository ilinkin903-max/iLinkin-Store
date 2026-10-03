# iLink Auto Order v2.3.1 — Vercel Dashboard

Deploy ke project Vercel yang sama dengan versi sebelumnya.

## Environment
```env
PTERODACTYL_BACKEND_URL=http://legal-private.jhonaleystore.id:PORT_SERVER
VPS_PROXY_SECRET=SECRET_YANG_SAMA_DENGAN_VPS
GATEWAY_TIMEOUT_MS=50000
```

Tidak ada BOT_TOKEN, API key supplier, API key AutoGoPay, atau database di Vercel.

## Update
Root project harus berisi:
```text
index.html
app.js
app.css
vercel.json
api/
```

v2.3.1 menambahkan cache-busting pada `app.js/app.css`, section Pembayaran & QRIS yang jelas, pilihan metrik sidebar, dan diagnostik koneksi Telegram.
