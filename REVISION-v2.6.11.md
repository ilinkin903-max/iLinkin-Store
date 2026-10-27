# Revision v2.6.11 — Vercel Dashboard

## 1. Privasi Notifikasi Pembelian
- Alamat email pembeli di channel/grup publik disembunyikan untuk menjaga privasi customer.

## 2. Pengaturan Kemitraan Reseller Bot (Tampilan Responsif Mobile)
- Perbaikan layout `.reseller-fee-card` dan form kemitraan agar rapi, proporsional, dan nyaman dioperasikan di layar HP (portrait smartphone).
- Tombol aksi dan card reseller adaptif terhadap lebar layar, tidak overflow atau terpotong.

## 3. Fitur Baru: Menu Undangan Tim (`📧 Undangan Tim`)
- **Navigasi Dashboard Baru**:
  - Ditambahkan menu sidebar `📧 Undangan Tim` di panel Owner.
- **Dua Sub-Tab Terintegrasi**:
  1. **Tab Sesi Tim**:
     - Manajemen sesi tim (Canva / Gemini / Google Workspace, dll).
     - Visualisasi progress bar keterisian kuota sesi (misal: 4/5 anggota).
     - Tombol aksi: Buat Sesi Baru, Lihat & Kelola Anggota, Salin Semua Email Anggota Sesi, Edit Sesi, dan Hapus Sesi Tim.
  2. **Tab List Email Pembeli**:
     - Menampilkan seluruh email pembeli yang masuk dari transaksi lunas.
     - Status tag badge: `Belum Masuk Sesi` vs `Sesi: [Nama Sesi]`.
     - Filter pencarian cepat (search keyword & status filter: Semua, Belum Masuk Sesi, Sudah Masuk Sesi).
     - Seleksi multi-email (checkbox massal) untuk langsung dimasukkan ke sesi tim pilihan via modal `+ Masukkan ke Sesi`.
     - Tombol cepat salin email per individu atau salin massal pilihan.
- **Fitur Ekspor & Salin Massal Cepat**:
  - Modal salin email mendukung 2 mode format yang siap di-paste:
    - **Format Koma** (`email1@gmail.com, email2@gmail.com`) — format default saat undang anggota di Canva / Google Workspace.
    - **Format Baris Baru** (1 email per baris) — format default untuk spreadsheet / bulk mailer.
- **Cache-Busting Update**:
  - `app.css?v=2.6.11` dan `app.js?v=2.6.11` di `index.html`.
