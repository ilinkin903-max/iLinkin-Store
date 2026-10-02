# iLink Auto Order v2.2.0 — Vercel Dashboard

Dashboard Owner neo-brutalism + secure gateway ke Pterodactyl. Database, bot, pembayaran, supplier, dan credential rahasia tetap berada di Pterodactyl.

## Fitur revisi v2.2.0

- Pesanan: tombol **Detail** untuk melihat produk, varian, qty, harga, pembayaran, deskripsi/SNK, dan stok/akun yang dikirim.
- Laporan: tipe **Harian / Bulanan / Tahunan** dengan pemilih periode yang menyesuaikan tipe.
- Pengaturan: dipisah menjadi Toko & Owner, Status Integrasi, serta Backup & Restore.
- Backup: manual backup, download, upload `.sqlite`, restore, hapus, serta jadwal otomatis dari dashboard.
- Bot & Notifikasi: Bot Telegram, Link & Notifikasi, Broadcast, Status Sistem, Command Owner, dan Riwayat Broadcast ditata per bagian.
- User: perbaikan render dan aksi Saldo / Chat / Hapus.
- Routing Vercel `NOT_FOUND` tetap menggunakan fallback SPA yang sudah diperbaiki sejak v2.1.1.

## Pengaturan project Vercel

- Framework Preset: **Other**
- Root Directory: folder yang langsung berisi `index.html`, `app.js`, `app.css`, dan `vercel.json`
- Build Command: **kosong**
- Output Directory: **kosong**

Environment Variables:

```env
PTERODACTYL_BACKEND_URL=http://legal-private.jhonaleystore.id:PORT_BACKEND
VPS_PROXY_SECRET=SECRET_YANG_SAMA_DENGAN_PTERODACTYL
GATEWAY_TIMEOUT_MS=50000
```

## Upgrade

Deploy ZIP Vercel v2.2.0 ke **project Vercel yang sama**. Environment Variable tidak perlu diubah. Setelah deployment selesai, cek `/api/health`, lalu buka `/`.
