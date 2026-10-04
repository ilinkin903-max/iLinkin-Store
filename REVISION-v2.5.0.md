# Revision v2.5.0

Fokus rilis ini adalah harga bulk/grosir, tampilan checkout bot, warna tombol, menu stok, dan ketahanan koneksi Telegram.

## Harga bulk produk dan varian
- Produk default dan setiap varian memiliki tier harga bulk sendiri.
- Tier disimpan di SQLite pada `bulk_prices_json` dan dimigrasikan otomatis dari database versi lama.
- Harga checkout otomatis memilih tier tertinggi yang minimal qty-nya sudah terpenuhi.
- Harga bulk ikut dipakai pada pembayaran Saldo, QRIS, kupon, profit order, dan Pesanan Manual.

Contoh:
- Harga normal Rp2.000.
- Mulai 2 pcs Rp845/pcs.
- Mulai 50 pcs Rp200/pcs.

## Tampilan konfirmasi Telegram
- Konfirmasi tidak lagi menampilkan SNK sebelum pembayaran.
- Menampilkan `DESKRIPSI PRODUK`, harga satuan aktif, daftar harga grosir, stok/status, jumlah, subtotal, dan total.
- Deskripsi multi-baris otomatis dirapikan sebagai bullet.

## Warna tombol Telegram
- Customer Service dan Grup: biru/primary.
- Dashboard Owner: merah/danger.
- Tombol kembali, refresh, cek pembayaran, join, topup, saldo, dan tombol lama lain diberi style yang konsisten.

## Menu stok
- Tampilan stok Telegram dirapikan dan dipaginasi 5 produk per halaman.
- Menampilkan ringkasan Ready/Habis/Pre-order, stok varian, terjual, harga, refresh, dan navigasi halaman.
- Modal tambah stok dashboard juga dirapikan dengan kartu target stok dan penghitung jumlah baris.

## Telegram network hardening
- `editMessageText` / `editMessageCaption` retry pada ETIMEDOUT/ECONNRESET.
- Socket keep-alive yang bermasalah di-reset sebelum retry.
- Timeout edit dibuat lebih pendek agar antrean chat tidak tertahan lama.
- Jika edit tetap gagal karena jaringan, fallback `sendMessage` dijalankan non-blocking dan dideduplikasi per pesan.
- Error network update dicatat sebagai warning terstruktur, bukan stack error yang mengganggu console.
