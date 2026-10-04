# iLink Auto Order v2.1.0 — Dashboard & Stock Revision

Fokus revisi ini adalah kerapian Dashboard Owner di HP dan desktop, tanpa menghapus data SQLite lama.

## Perubahan utama

- Dashboard hanya menampilkan: Omset Hari Ini, Profit Hari Ini, Total Order Hari Ini, Total Stok, grafik 7 hari, dan Produk Terlaris.
- Menu Produk tetap menjadi pusat katalog.
- Edit Produk mencakup data produk + daftar varian.
- Produk dan setiap varian memiliki Deskripsi dan Syarat & Ketentuan (SNK).
- Tombol Stok hanya untuk menambah stok default/tunggal atau stok varian.
- Tombol Kelola membuka daftar stok aktual untuk diedit/hapus satu per satu.
- Pesanan memakai card responsif; tidak memerlukan horizontal scroll di HP.
- Menu Pelanggan/Pengguna digabung menjadi satu menu `User` dengan data user Telegram lengkap.
- SQLite otomatis menambah kolom `description` dan `terms` pada varian lama.
- Bot menggunakan Deskripsi/SNK varian jika tersedia, dan fallback ke produk utama jika kosong.

## Upgrade

1. Stop server.
2. Backup `.env` dan `data/ilink-admin.sqlite`.
3. Extract ZIP VPS v2.1.0 dan overwrite source lama.
4. Jangan hapus folder `data/`.
5. Start dengan Node.js 22.13+:

```bash
node --no-warnings server.js
```

6. Deploy ZIP Vercel v2.1.0 ke project Vercel yang sama.
7. Environment Variables lama tidak perlu diganti.
