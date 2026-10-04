# Revisi v2.4.3

## Stok dan urutan katalog
- Produk diurutkan A-Z pada query backend.
- Varian diurutkan A-Z.
- Status stok efektif ditambahkan: `ready`, `empty`, `preorder`.
- Varian supplier memakai `supplier_stock`; stok lokal memakai jumlah item `available`.
- Tombol katalog Telegram menggunakan hijau untuk ready, merah untuk habis, dan primary untuk PRE-ORDER.

## Notification Center
SQLite menambahkan tabel `admin_notifications`. Sistem membentuk notifikasi aktif untuk stok habis/menipis, order belum selesai, pembayaran gagal/expired 24 jam terakhir, bot offline, dan koneksi Telegram yang tidak stabil. Status baca disimpan agar badge unread konsisten.

- Pesanan completed 24 jam terakhir juga muncul sebagai notifikasi admin dan dapat diarahkan ke menu Pesanan.
