# iLink Auto Order v2.4.1

Perbaikan fokus UI submenu dan upload media `/start`.

## Perubahan
- Submenu **Pengaturan** sekarang vertikal menurun seperti menu utama: Toko, Pembayaran, Supplier, Backup, Sistem.
- Submenu **Bot & Notifikasi** sekarang vertikal: Bot, Menu /start, Link & Notifikasi, Diagnostik.
- Upload media memakai **chunked upload** agar aman melalui Vercel gateway.
- Batas gambar dinaikkan menjadi 8 MB dan video menjadi 40 MB.
- Upload `/start` langsung menyimpan `start_media_type` dan `start_media_value` ke SQLite setelah upload selesai.
- Preview `/start` mendukung gambar dan video (`<video controls>`).
- Deteksi tipe file memakai MIME dan ekstensi, lebih stabil di Telegram WebView/Android.
- Tombol Hapus pada media `/start` menghapus file VPS dan membersihkan setting.
- Helper upload yang sama juga memperbaiki upload gambar produk dan foto broadcast melalui gateway.

## Data
Tidak ada reset database. Jangan hapus `.env` atau folder `data/` saat upgrade.
