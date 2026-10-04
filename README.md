# iLink Auto Order v2.6.2 — Pterodactyl

Backend Node.js 22 + SQLite lokal untuk Dashboard Vercel dan Telegram Auto Order.

## Upgrade
1. Stop server.
2. Backup `.env` dan seluruh folder `data/`.
3. Extract ZIP VPS v2.6.2 ke `/home/container` dan overwrite source lama.
4. Jangan hapus `.env`, `data/ilink-admin.sqlite`, `data/uploads/`, atau `data/backups/`.
5. Pastikan Node.js 22.13+.
6. Startup: `node --no-warnings server.js`.
7. Start server. Migrasi SQLite berjalan otomatis.

## v2.4.0
- Receipt pembelian tanpa inline button, hasil produk memakai blok `<pre><code>` Telegram agar mudah di-copy.
- QRIS Telegram dicatat berdasarkan chat/message ID lalu dihapus otomatis saat paid/completed, expired, failed, atau canceled.
- Payments SQLite menambah `qr_chat_id` dan `qr_message_id` melalui migrasi otomatis.
- Media produk/start tetap disimpan di `data/uploads/`.

## Environment Telegram
```env
BOT_TOKEN=...
BOT_USERNAME=...
OWNER_ID=...
BOT_POLLING_TIMEOUT=25
TELEGRAM_REQUEST_TIMEOUT_MS=10000
TELEGRAM_FORCE_IPV4=true
TELEGRAM_API_BASE_URL=https://api.telegram.org
```

## Payment + Supplier
```env
AUTOGOPAY_API_KEY=...
AUTOGOPAY_BASE_URL=https://v1-gateway.autogopay.site

PRODSELLER_API_KEY=...
PRODSELLER_BASE_URL=https://prodseller.com/v1
AIVERSEHUB_API_KEY=...
AIVERSEHUB_BASE_URL=https://aiversehub.store/api/v1
```

## Data lokal
- Database: `data/ilink-admin.sqlite`
- Upload media: `data/uploads/`
- Backup: `data/backups/`

## v2.4.1
- Submenu Pengaturan/Bot dibuat vertikal.
- Upload media `/start` menggunakan chunked upload (gambar maks. 8 MB, video maks. 40 MB).
- Media `/start` langsung tersimpan setelah upload berhasil.


## v2.4.2
- Migrasi backup JSON bot lama langsung dari Dashboard → Pengaturan → Backup.
- Mendukung backup export lama `backup-bot-*.json` dengan `tables`, serta file lama `Produk.json`, `User.json`, `Trx.json`, dan `Voucher.json`.
- Preview jumlah user/produk/varian/stok/voucher/redeem/setting/transaksi sebelum import.
- Import user menjaga saldo utama/referral; produk menjaga varian dan stok; invoice lama dicegah duplikat.
- Sebelum import, sistem membuat rollback backup SQLite otomatis.
- Riwayat transaksi dan setting lama bersifat opsional agar tidak membuat statistik ganda atau menimpa konfigurasi baru.
- Produk Induk reseller sekarang selalu mengambil katalog produk lokal terbaru dari API saat tombol `Masukkan` dibuka.


## v2.4.4
- Produk dan varian kini diurutkan alfabetis A-Z dari backend SQLite.
- Status stok efektif: ready hijau, habis merah, PRE-ORDER kuning.
- Varian supplier memakai snapshot `supplier_stock`; varian lokal memakai `stock_items` ready.
- Bot Telegram menampilkan tombol produk/varian ready dengan style success, habis dengan danger, dan PRE-ORDER dengan primary.
- Notification Center admin baru: stok habis/menipis, order belum selesai, pembayaran gagal/expired, bot offline, dan masalah jaringan Telegram.
- Notifikasi memiliki unread/read state yang disimpan di SQLite.

- Pesanan completed 24 jam terakhir juga muncul sebagai notifikasi admin dan dapat diarahkan ke menu Pesanan.

## Jaspay Fresh (v2.6.2)
Tambahkan hanya di `.env` Pterodactyl/VPS:

```env
JASPAY_API_KEY=
JASPAY_BASE_URL=https://api.jaspay.site/v1
JASPAY_POLL_INTERVAL_SECONDS=15
```

Setelah restart, buka menu utama Dashboard Owner > Jaspay Fresh, tekan Refresh, atur harga produk, Default Setting Akun, urutan mode, Harga/Refund Perpanjang 7/14 Hari, lalu aktifkan produk yang ingin dijual. API key jangan ditempatkan di Vercel/browser.
