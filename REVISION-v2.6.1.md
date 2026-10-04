# Revision v2.6.1

Fokus: perbaikan harga Produk Fresh dan penyempurnaan UX seperti referensi Jaspay Bot tanpa mengekspos provider ke customer.

- Parser `/v1/products` sekarang mempertahankan seluruh metadata opsi dan harga, termasuk `harga_per_mode` serta biaya tambahan `harga_per_akun`.
- Harga Zoom dihitung berdasarkan kombinasi mode/durasi. Contoh: Akun Sendiri dan Akun Baru tidak lagi memakai harga dasar yang sama jika API menentukan harga berbeda.
- Sebelum pembayaran, katalog live diambil ulang. Jika harga jual customer berubah, bot menampilkan total terbaru untuk dikonfirmasi ulang.
- Setelah pembayaran, response 409 akibat perubahan `expected_total` ditangani otomatis: katalog direfresh, modal diperbarui, lalu order diretry dengan idempotency key baru yang aman karena request mismatch sebelumnya belum memotong credit.
- Parser 409 dibuat lebih spesifik agar angka `total sebenarnya` dibaca dengan benar.
- Landing Produk Fresh memakai pola detail produk: judul, penjelasan mode, tombol mode, Deskripsi, dan Kembali.
- Tampilan customer per produk dapat diatur dari dashboard: emoji, nama menu, judul, deskripsi singkat/lengkap, label mode, deskripsi mode, urutan, warna tombol, visibilitas mode, serta warna tombol Deskripsi/Kembali.
- Owner dapat mengatur default pembuatan akun (domain, password, nama, suffix digit). Pada produk bermode, default tersebut hanya diterapkan ke mode Akun Baru.
- Zoom mode Akun Sendiri memakai `/v1/accounts/check`, polling hasil, lalu menyimpan `accounts_token`; qty mengikuti jumlah akun yang lolos.
- State input Akun Sendiri dibersihkan ketika user kembali atau mengganti mode sehingga pesan berikutnya tidak salah dibaca sebagai daftar akun.
- Biaya efektif opsi tambahan seperti auto-renew ikut diperhitungkan jika opsi tersebut aktif.
- Semua teks customer tetap memakai istilah “Bot”; nama provider tidak ditampilkan.
