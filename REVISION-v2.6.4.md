# iLink Auto Order v2.6.4

Perbaikan utama:

- Media `/start` lokal tidak lagi bergantung pada `fetch + AbortController` multipart yang mudah `aborted`; upload Telegram memakai HTTP(S) streaming dengan retry jaringan.
- Foto/GIF/video `/start` yang berhasil dikirim disimpan sebagai Telegram `file_id`, sehingga request berikutnya tidak mengupload file yang sama berulang kali.
- Cache `file_id` otomatis direset jika media atau tipe `/start` diganti.
- Submenu **Pengaturan** dan **Bot & Notifikasi** menjadi landing menu kartu. Halaman pengaturan baru dibuka setelah submenu dipilih, dengan tombol kembali ke daftar submenu.
- Notifikasi admin diurutkan murni dari yang terbaru (`updated_at DESC`), bukan berdasarkan tingkat error lebih dulu.
- Katalog Produk Fresh menggunakan cache 60 detik untuk browsing dan klik produk tidak lagi memaksa refresh API. Validasi live tetap dilakukan sebelum pembayaran.
- Diagnostik Jaspay mencatat latency/path/status request terakhir dan memberi log `[jaspay:slow]` bila respons API >= 1500 ms.
