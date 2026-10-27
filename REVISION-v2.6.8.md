# Revision v2.6.8 — Vercel

- Balance supplier diberi label **Saldo API Jaspay** agar tidak tertukar dengan saldo user.
- Tambah editor `jaspay_ready_intro` untuk teks halaman READY STOK.
- Kartu Fresh menampilkan jumlah Ready Stok lokal per produk dan total lokal.
- Tambah tombol **Stok Ready** untuk mengelola akun lokal satu per baris.
- Editor stok menampilkan Available, Reserved, Terjual dan mendukung `replace` / `add`.
- Editor Produk Fresh menambah konfigurasi Ready Stok: aktif/nonaktif, label, dan kombinasi harga yang dipakai.
- Harga Ready Stok tidak disimpan sebagai harga baru; selalu mengikuti pricing/override Produk Fresh yang dipilih.
- Status Generate API dibuat terpisah dari status Ready Stok Lokal.
- **Pengaturan Posisi Varian Produk (Sort Order)**:
  - Tombol kontrol posisi `▲` (pindah ke atas) dan `▼` (pindah ke bawah) serta badge posisi `#1`, `#2`, ... di setiap kartu varian pada editor produk.
  - Perubahan posisi varian langsung terupdate seketika di layar dan tersinkronisasi ke server melalui endpoint reorder.
  - Input field `Urutan Posisi` pada modal Edit Varian untuk pengaturan nomor urutan manual.
  - **Penyempurnaan Tema UI Neobrutalism & Kerapian Layout (v2.6.20)**:
  - Font modern premium: Memasukkan Google Font **Plus Jakarta Sans** (weights 400-900) dengan tipografi tegas, tajam, dan kontras tinggi.
  - Standarisasi Neobrutalism sejati: Border tegas gelap `2.5px solid var(--ink)`, hard drop shadow tanpa blur `3px - 5px`, sudut rounded konsisten, dan tactile button feedback (efek lift saat hover dan press saat diklik).
  - Kelengkapan styling modul baru: Melengkapi seluruh CSS untuk modul **Undangan Tim & Email Pembeli**, **Promosi Stok Ready** (live preview editor, tabs WA/Telegram, filter), dan **Portal Reseller** (kartu reseller, runtime badge bot toko, kartu penarikan dana, serta tabel mutasi profit).
  - Pembersihan kontradiksi CSS: Menghapus deklarasi `display:none` lama pada tombol lonceng notifikasi di mobile sehingga ikon notifikasi selalu muncul dan sejajar rapi dengan timer VPS di topbar.
  - Perbaikan layout mobile: Kartu varian, kartu produk, dan topbar dioptimalkan pada layar smartphone agar tidak bergeser atau bertumpuk.
- **Pemulihan Navigasi Menu Sidebar (v2.6.21)**:
  - Memasukkan kembali tombol menu **👥 Reseller Bot** (lengkap dengan badge notifikasi approval `<em id="resellerBadge">`), **📢 Promosi Ready**, dan **📧 Undangan Tim** ke dalam daftar navigasi sidebar [index.html](file:///c:/Users/LENOVO/Downloads/iLink.in%20Store%20Bot%20New/iLink-AutoOrder-Vercel-v2.6.8/index.html).
  - Merapikan padding dan jarak vertikal antar tombol menu di sidebar agar seluruh 13 menu navigasi tampil rapi, proporsional, dan nyaman diakses tanpa perlu scroll berlebih.

