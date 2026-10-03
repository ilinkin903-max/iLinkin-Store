# iLink Auto Order v2.4.0

## Telegram checkout
- Receipt sukses mengikuti format ringkas: invoice, produk, harga, qty, metode, fee, total, tanggal, SNK, lalu hasil produk.
- Receipt sukses tidak memiliki inline keyboard.
- Hasil produk menggunakan blok `<pre><code>` agar Telegram menyediakan affordance copy pada blok kode.
- QRIS yang dibuat v2.4.0 menyimpan `qr_chat_id` dan `qr_message_id`.
- QRIS dihapus otomatis saat payment completed/paid, expired, failed, atau canceled.
- Tombol Cek Pembayaran yang menemukan status completed tidak mengirim pesan sukses kedua.

## Dashboard
- Broadcast dipindahkan menjadi menu utama.
- Pengaturan dipecah menjadi submenu.
- Bot & Notifikasi dipecah menjadi submenu.
- Upload gambar produk pada mode Edit langsung menyimpan `image_url` ke produk.
- Media lokal `vps://...` ditampilkan melalui `/api/media`, dengan fallback thumbnail jika gambar gagal dimuat.
- Rewrite catch-all Vercel dihapus agar `/api/media` dan API functions tidak tersapu fallback SPA.

## Database
Migrasi otomatis menambah kolom berikut jika belum ada:
- `payments.qr_chat_id`
- `payments.qr_message_id`

Tidak memerlukan reset database.
