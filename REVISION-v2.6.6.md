# iLink Auto Order v2.6.6

Tanggal: 2026-10-04

## Perbaikan
- Halaman Jaspay Fresh membaca respons settings yang benar (`settings.jaspay_enabled`), sehingga status global Aktif/Nonaktif tidak lagi kembali salah.
- Setiap baris kombinasi harga API memiliki input Harga Jual Kustom sendiri.
- Ditambahkan quick toggle Aktifkan/Nonaktifkan untuk produk Fresh individual.
- Status API, status global Fresh, dan status produk individual dibedakan agar tidak membingungkan.
- Kartu produk miniapp dibuat lebih compact, responsif, dan rapi tanpa menghilangkan informasi stok/harga/varian.
- Produk yang memiliki varian menyembunyikan Harga Default, Modal Default, Bulk Default, Mode Pengiriman Default, target Stok Default, serta opsi Default pada pesanan manual.
- Produk dengan seluruh varian berasal dari supplier tidak lagi menampilkan tombol stok lokal yang tidak dapat digunakan.
- Kartu produk bervarian tidak lagi menampilkan chip DEFAULT ketika seluruh varian nonaktif; ditampilkan status “Tidak ada varian aktif”.
