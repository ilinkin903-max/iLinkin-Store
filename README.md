# iLink Auto Order v2.1.1 — Vercel Dashboard

Dashboard Owner neo-brutalism + secure gateway ke Pterodactyl. Database, bot, pembayaran, supplier, dan credential rahasia tetap berada di Pterodactyl.

## Fix NOT_FOUND v2.1.1

Versi ini menghapus kombinasi `cleanUrls: true` + rewrite `/index.html` yang menyebabkan route dashboard dapat 404 di Vercel. Semua route SPA sekarang fallback ke `index.html`, sementara file nyata dan Serverless Function API tetap diprioritaskan Vercel.

Route yang harus aktif setelah deploy:

```text
/
/dashboard
/admin
/api/health
```

## Pengaturan project Vercel

- Framework Preset: **Other**
- Root Directory: **.** / folder yang langsung berisi `index.html` dan `vercel.json`
- Build Command: **kosong**
- Output Directory: **kosong**

Environment Variables:

```env
PTERODACTYL_BACKEND_URL=http://legal-private.jhonaleystore.id:PORT_BACKEND
VPS_PROXY_SECRET=SECRET_YANG_SAMA_DENGAN_PTERODACTYL
GATEWAY_TIMEOUT_MS=50000
```

## Struktur Dashboard yang dipertahankan

- Dashboard: Omset Hari Ini, Profit Hari Ini, Total Order Hari Ini, Total Stok, Grafik 7 Hari, Produk Terlaris.
- Produk: katalog, tambah/edit produk, varian, Deskripsi dan SNK per produk/varian.
- Stok: tambah stok produk tunggal atau per varian.
- Kelola: lihat/edit/hapus stok satu per satu.
- Pesanan: card responsif tanpa tabel horizontal.
- User: satu menu gabungan data user Telegram, saldo, referral, status, chat, dan hapus.
- Laporan, Kupon, Pengaturan, Bot & Notifikasi tetap tersedia.

## Upgrade

Deploy ZIP Vercel v2.1.1 ke **project Vercel yang sama**. Environment Variable tidak perlu diubah. Setelah deployment selesai, buka `/api/health` lalu `/`.

Jika masih muncul Vercel `NOT_FOUND`, cek Project Settings -> Build & Development Settings dan pastikan **Root Directory menunjuk ke folder yang berisi `index.html`**, bukan folder induk yang hanya berisi subfolder ZIP.
