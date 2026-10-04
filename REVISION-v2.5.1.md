# Revision v2.5.1

- Memperbaiki Total Transaksi dan Stok Terjual yang turun setelah migrasi JSON lama.
- Membaca `historical_stats`, `products.sold`, transaction_count user, dan detail transaksi lama sebagai sumber counter historis.
- Counter historis tidak bergantung pada banyaknya row order lama yang masih tersimpan.
- Penjualan baru setelah migrasi tetap menambah counter historis tanpa double count.
- Status canceled pada transaksi baru menurunkan tambahan pascamigrasi dengan benar.
- Menambahkan `sold_count` produk/varian untuk mempertahankan histori penjualan per produk.
- Menambahkan endpoint diagnostik/perbaikan counter historis dan rollback backup otomatis.
