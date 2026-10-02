# v2.2.0 — Orders, Reports, Users, Settings & Backup

## Perubahan

- Detail pesanan lengkap termasuk stok/akun yang benar-benar dikirim.
- Laporan harian, bulanan, tahunan + periode dinamis.
- Menu User diperbaiki (handler lama yang hilang dihapus) dan user lama dibackfill dari histori order.
- Pengaturan dan Bot & Notifikasi dipecah menjadi section responsif.
- Backup otomatis dapat diatur dari dashboard.
- Upload backup `.sqlite` memakai chunk kecil agar lebih aman melewati gateway Vercel.
- Restore backup memvalidasi SQLite, membuat rollback backup, lalu membuka ulang database tanpa reset data manual.

## Upgrade

Backup `.env` dan `data/ilink-admin.sqlite`, overwrite source v2.1.x, lalu restart. Tidak perlu menghapus database.
