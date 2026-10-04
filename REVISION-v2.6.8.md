# Revision v2.6.8 — Vercel

- Balance supplier diberi label **Saldo API Jaspay** agar tidak tertukar dengan saldo user.
- Tambah editor `jaspay_ready_intro` untuk teks halaman READY STOK.
- Kartu Fresh menampilkan jumlah Ready Stok lokal per produk dan total lokal.
- Tambah tombol **Stok Ready** untuk mengelola akun lokal satu per baris.
- Editor stok menampilkan Available, Reserved, Terjual dan mendukung `replace` / `add`.
- Editor Produk Fresh menambah konfigurasi Ready Stok: aktif/nonaktif, label, dan kombinasi harga yang dipakai.
- Harga Ready Stok tidak disimpan sebagai harga baru; selalu mengikuti pricing/override Produk Fresh yang dipilih.
- Status Generate API dibuat terpisah dari status Ready Stok Lokal.
