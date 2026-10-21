# Revision v2.6.10 — Vercel Miniapp

## Perbaikan Notifikasi Modal & Penyimpanan Produk Fresh
- **Notifikasi Toast di Atas Modal**:
  - Memperbaiki bug di mana notifikasi toast muncul di bawah/belakang popup modal `<dialog>`.
  - Secara arsitektural, elemen `<dialog>` dengan `.showModal()` berada di Top Layer browser sehingga elemen biasa di luar Top Layer (meskipun memiliki `z-index` tinggi) selalu tertutup.
  - Saat modal terbuka, `#toast` kini otomatis disisipkan ke dalam elemen `#modal` (Top Layer) dengan `z-index: 999999` dan posisi fixed di atas seluruh konten dialog, lalu dipindahkan kembali ke `document.body` saat modal ditutup.
  - Menambahkan banner inline `#modalAlert` di bagian atas formulir modal sehingga pesan peringatan atau error dapat langsung terbaca dengan jelas oleh pengguna di dalam popup modal.
  - Menambahkan animasi state loading pada tombol submit (`Menyimpan...` dan disable) untuk mencegah double click/taps di perangkat seluler.

- **Perbaikan Penyimpanan Produk Fresh**:
  - Mengatasi penyebab gagal simpan produk fresh pada produk yang memiliki lebih dari satu varian/opsi harga (misalnya Zoom, Meitu, Wink, Canva, Outlook).
  - Sebelumnya, jika kombinasi harga Ready Stok belum disesuaikan atau tidak cocok dengan snapshot awal, dropdown bernilai kosong (`""`) dan kode memicu error validasi `Pilih kombinasi harga untuk Ready Stok.` yang memblokir penyimpanan pengaturan lain (markup harga, status ON/OFF, nama tombol, dsb).
  - Menambahkan auto-selection kombinasi harga yang aman (otomatis memilih opsi harga pertama jika belum ditentukan), serta fallback yang valid sehingga proses simpan tidak lagi terblokir.
  - Pembaruan status produk langsung di-commit ke state cache lokal seketika saat API mengembalikan hasil, dan proses penyegaran katalog (`refreshJaspayHub`) diproses secara asinkron tanpa memblokir penutupan modal.

## Dashboard Admin Reseller & White-Label Bot Toko
- **Menu Navigasi Baru `👥 Reseller Bot`**:
  - Dilengkapi badge notifikasi dinamis (`#resellerBadge`) yang menampilkan jumlah pengajuan penarikan saldo profit yang menunggu approval owner secara real-time.
- **Ringkasan KPI Eksklusif**:
  - Total Reseller & akun aktif.
  - Jumlah Bot Toko Reseller & status live (🟢 Online / 🔴 Stopped / ⚠️ Error).
  - Total Saldo Profit Reseller & akumulasi dana yang telah ditarik.
  - Total Pengajuan Penarikan Saldo Pending beserta nominal siap dicairkan.
- **4 Tab Manajemen Lengkap**:
  - **👥 Daftar Reseller**: Pendaftaran mitra, pengaturan mode markup (Fixed Rp / Persen %), informasi rekening bank/e-wallet untuk pencairan, pencarian, dan tombol aksi cepat.
  - **🤖 Bot Toko Reseller**: Pendaftaran bot dengan fitur **Verifikasi Token Instan** ke API Telegram (otomatis membaca nama bot dan `@username`), kontrol Start / Stop / Restart bot, serta pengaturan kustom branding (Nama Toko, Banner Header, teks `/start`, link CS, dan link channel).
  - **💸 Penarikan Saldo**: Verifikasi pengajuan pencairan, fitur **Setujui & Transfer** dengan unggah bukti transfer ke VPS yang langsung memotong saldo dan mengirim notifikasi Telegram ke reseller, serta fitur **Tolak Pengajuan** disertai alasan penolakan.
  - **📒 Mutasi Profit (Ledger)**: Audit log mutasi komisi pesanan masuk dan penarikan saldo lengkap dengan riwayat waktu, nominal, saldo akhir, nomor referensi invoice, dan detail bot.

## Reseller Mini App Frontend (`/reseller`)
- **Telegram Mini App Khusus Reseller (`reseller.html`, `reseller.css`, `reseller.js`)**:
  - Panel mandiri yang dapat dibuka langsung dari Telegram via command `/reseller` atau tombol menu `‹🚀› Dashboard Reseller`.
  - Desain modern Neo-Brutalist responsive di ponsel maupun desktop dengan 5 tab interaktif:
    1. **📊 Beranda**: KPI Saldo Profit, total penjualan, total pesanan, pelanggan, status live bot toko, dan 5 pesanan pembeli terkini.
    2. **🤖 Bot Toko**: Input token bot BotFather, tombol uji koneksi token instan (`Cek Token`), pengaturan nama toko, banner, teks pesan pembuka, link CS otomatis ke profil Telegram reseller, dan tombol Start / Stop / Restart bot.
    3. **🏷️ Atur Margin**: Pengaturan margin keuntungan per produk (modal owner vs harga jual) dengan kalkulator harga jual real-time, toggle ON/OFF ketersediaan produk di bot, filter pencarian, dan alat Markup Massal (+Rp / +%).
    4. **💸 Tarik Saldo**: Formulir pencairan komisi profit ke rekening bank / e-wallet (minimal Rp 10.000) dan riwayat penarikan lengkap beserta status approval dan modal pratinjau bukti transfer.
    5. **🛒 Pesanan**: Daftar riwayat seluruh pesanan pembeli yang masuk melalui bot toko reseller beserta rincian produk, harga jual, dan laba komisi yang didapatkan.
- **Routing & Gateway Vercel (`vercel.json`, `api/gateway.js`)**:
  - Menambahkan rewrite `/reseller` dan `/reseller-dashboard` ke `/reseller.html`.
  - Memperbarui `api/gateway.js` untuk mengizinkan rute `/api/reseller/*` diteruskan ke backend VPS.
- **Pembaruan Alur Pendaftaran Reseller 5-Tahap & Fix Sakelar Pendaftaran**:
  - Modal Atur Biaya Pendaftaran di Tab Reseller (`app.js`) kini menyinkronkan pengaturan via `PATCH /api/admin/settings` dengan parsing boolean checkbox yang akurat.
  - Menambahkan filter status baru di dropdown dashboard: `💳 Menunggu Pembayaran` (`awaiting_payment`) dan `🤖 Menunggu Bot Token` (`awaiting_token`).
  - Label status badge kini menampilkan terjemahan Bahasa Indonesia yang rapi ("Menunggu Persetujuan", "Menunggu Pembayaran", "Menunggu Bot Token", "Aktif", "Ditangguhkan", "Ditolak").


