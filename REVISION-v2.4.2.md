# Revisi v2.4.2

## Migrasi JSON bot lama
- Upload JSON chunked maks. 50 MB melalui Vercel → Pterodactyl.
- Deteksi backup `telegram-store-vercel-supabase` dan JSON legacy per jenis data.
- Preview jumlah data sebelum import.
- User + saldo/referral, produk + varian + stok, voucher dan redeem aktif secara default.
- Setting dan transaksi lama harus dipilih manual.
- Rollback backup SQLite dibuat otomatis sebelum import.
- Import stok bersifat merge/de-duplicate agar import ulang tidak menggandakan akun/kode yang sama.
- Invoice transaksi lama di-deduplikasi berdasarkan order_ref.

## Reseller
- Dropdown Produk Induk selalu memuat `/api/admin/products?limit=500` saat modal dibuka.
- Produk nonaktif tetap dapat dipilih sebagai induk.
- Jika katalog lokal kosong, mode default menjadi Produk baru.
- Supplier item yang sudah terhubung ke varian yang sama di-update agar tidak duplikat.
