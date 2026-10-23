# Revision v2.6.15 — Vercel

## Penggantian Supplier API AIVerseHub ke Storebat di Dashboard Owner

1. **Pembaruan Antarmuka Pengaturan Supplier (`app.js`)**:
   - Menghapus referensi AIVerseHub dan menggantinya dengan **Storebat**.
   - Menambahkan form konfigurasi **Storebat API Key (X-Reseller-Key)** dan **Storebat Base URL** pada submenu **Pengaturan > Supplier / Reseller API**. Owner kini dapat memasukkan atau mengganti key Storebat langsung dari web dashboard.
   - Kartu panel supplier kini menampilkan status saldo, membership/key name, dan katalog live Storebat secara real-time.

2. **Dukungan Katalog & Varian Produk Storebat (`app.js`)**:
   - Pilihan supplier source pada form Edit Varian kini menyediakan opsi **Storebat** (`storebat`).
   - Fitur **Masukkan / Import Supplier** mendukung import katalog Storebat menjadi produk biasa atau varian dari produk induk yang ada.
   - Indikator Status Sistem (`Pengaturan > Sistem`) menampilkan badge status koneksi `Storebat` beserta tombol test koneksi.

3. **Versi & Cache**:
   - Versi dinaikkan ke `2.6.15`.
   - `index.html` diperbarui dengan cache buster `?v=2.6.15`.
