# Revision v2.6.16 — Vercel

## Pembaruan Antarmuka Dashboard untuk Multi-Gateway Pembayaran & ShopeePay Mandiri

1. **Menu Pengaturan Pembayaran & QRIS (`app.js`)**:
   - Menambahkan 2 kartu pilihan mode baru pada grid QRIS:
     - **ShopeePay GW Sendiri** (`shoppepay_self`): Direct native engine bawaan tanpa butuh port 4000 atau gateway eksternal mandiri tanpa biaya platform.
     - **Hybrid Rotating** (`hybrid_rotate`): Bergantian dinamis antara AutoGoPay GoPay dan ShopeePay Gateway Sendiri.
   - Pilihan kartu AutoGoPay sebelumnya (`gopay`, `shopeepay`, dan `auto_rotate`) tetap ada dan beroperasi penuh.
   - Menambahkan form konfigurasi terintegrasi:
     - **URL ShopeePay Gateway**: default `internal` (Direct Native bawaan tanpa perlu buka port 4000 di VPS/Pterodactyl). Tetap mendukung URL eksternal jika menggunakan server terpisah.
     - **API Key Gateway**: Opsi proteksi header `X-API-Key` jika menggunakan gateway eksternal.
     - **String / Payload QRIS Statis ShopeePay**: Input teks/textarea untuk payload EMVCo QRIS statis merchant hasil scan barcode toko.
     - **Kode Unik Otomatis**: Sakelar On/Off penambahan nominal acak Rp 1 - 99 untuk mencegah collision nominal kembar.
   - **Fitur Cek Status Token Real-Time**: Tombol untuk mengecek validitas token langsung ke ShopeePay Partner Portal tanpa melempar error `fetch failed`.
   - **Fitur Live Update Token & QRIS**: Modal khusus untuk memperbarui `SHOPEE_TOKEN` dan String QRIS Statis secara instan langsung tersimpan ke SQLite dan memori aktif bot tanpa restart.

2. **Panel Status Sistem (`app.js`)**:
   - Kartu integrasi **ShopeePay GW** ditambahkan di halaman Status Sistem berdampingan dengan AutoGoPay, Telegram, Supplier, dan Database SQLite.
   - Menampilkan status URL gateway: `Direct Native (Bawaan)` jika internal, atau URL kustom jika eksternal.
   - Dilengkapi tombol test koneksi cepat untuk memvalidasi gateway secara berkala.

3. **Versi & Cache**:
   - Versi sistem dinaikkan ke `2.6.16`.
   - File `index.html` diperbarui dengan cache buster `?v=2.6.16`.
   - CSS `.qris-mode-grid` diperbarui dengan responsive layout `auto-fit minmax` agar kartu tersusun rapi di desktop maupun ponsel.
