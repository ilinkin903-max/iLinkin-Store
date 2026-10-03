# iLink Auto Order v2.4.2 — Vercel Dashboard

Deploy ke project Vercel yang sama dengan versi sebelumnya.

## Environment
```env
PTERODACTYL_BACKEND_URL=http://legal-private.jhonaleystore.id:PORT_SERVER
VPS_PROXY_SECRET=SECRET_YANG_SAMA_DENGAN_VPS
GATEWAY_TIMEOUT_MS=50000
```

Tidak ada BOT_TOKEN, API key supplier, API key AutoGoPay, atau database di Vercel.

## Root project
```text
index.html
app.js
app.css
vercel.json
api/
```

## v2.4.0
- Broadcast menjadi menu utama sendiri.
- Pengaturan memakai submenu Toko / Pembayaran / Supplier / Backup / Sistem.
- Bot & Notifikasi memakai submenu Bot / Menu start / Link & Notifikasi / Diagnostik.
- Upload gambar produk langsung dipasang ke produk saat Edit; media VPS diproxy lewat `/api/media`.
- Routing Vercel tidak lagi memakai catch-all yang dapat mengganggu endpoint media/API.

## v2.4.1
- Submenu Pengaturan/Bot dibuat vertikal seperti menu utama.
- Upload gambar/video `/start` menggunakan chunked upload melalui gateway dan menampilkan progress + preview.


## v2.4.2
- Submenu Backup memiliki migrator JSON bot lama dengan upload chunked sampai 50 MB, preview, pilihan data, dan hasil import.
- Produk Induk pada import reseller tidak lagi bergantung pada cache halaman Produk; daftar diambil langsung dari backend ketika modal dibuka.
- Produk aktif maupun nonaktif dapat dipilih sebagai induk. Jika belum ada produk lokal, mode otomatis diarahkan ke Produk baru.
- Item supplier yang sebelumnya sudah terhubung ke varian yang sama akan di-update, bukan membuat duplikat.
