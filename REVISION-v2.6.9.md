# Revision v2.6.9 — Vercel Miniapp

## Tampilan Katalog Jaspay Fresh & Ready Stok Serasi Menu Produk
- Mengubah tampilan katalog Jaspay Fresh dari daftar supplier tabel sederhana menjadi tata letak kartu produk neobrutalism modern (`product-grid` & `product-card`), serasi dengan menu Katalog Produk.
- Setiap kartu produk fresh dilengkapi:
  - Nomor indeks urutan produk.
  - Thumbnail emoji ikonik sesuai aplikasi (Zoom, Canva, PicsArt, Meitu, Wink, Outlook, Apple Music, ExpressVPN, dll.).
  - Nama produk, key API, dan tag `# FRESH BOT`.
  - Status pill (`GEN ON` / `GEN OFF` / `API OFF` / `Ready X`) dan tombol quick switch toggle `ON / OFF`.
  - Kotak informasi Stok Ready Lokal dan Rentang Harga Jual vs Modal API.
  - Chip varian/opsi (Mode, Jumlah kombinasi harga, status Ready Toko).
  - Tombol aksi neobrutalism: `✎ ATUR`, `📦 STOK READY (${readyCount})`, dan `▶ AKTIFKAN` / `⏸ MATIKAN`.
- Menambahkan toolbar pencarian produk real-time dan dropdown filter status (Semua, Generate Aktif, Nonaktif, API Ready, Ada Stok Ready, Stok Kosong).
- Panel Pengaturan Global Fresh dan teks intro Ready Stok kini dapat dibuka/tutup dengan tombol `⚙️ Pengaturan Global`.
- Kartu ringkasan KPI di bagian atas menampilkan status API, saldo API Jaspay, total stok ready lokal, dan antrean mesin Jaspay.
- Tampilan 100% responsif untuk perangkat mobile / Telegram WebApp dan layar desktop.
