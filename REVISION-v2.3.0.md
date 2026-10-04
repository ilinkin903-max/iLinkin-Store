# iLink Auto Order v2.3.0

## Supplier reseller
- ProdSeller dan AIVerseHub menampilkan balance akun dan katalog live pada Dashboard > Pengaturan.
- Katalog supplier dapat di-refresh tanpa restart bot.
- Produk supplier dapat dimasukkan sebagai produk baru atau sebagai varian produk iLink yang sudah ada.
- Varian dapat memilih `supplier_source` + `supplier_product_id` langsung dari katalog live.
- Snapshot harga API, public price, stok supplier, dan waktu sinkronisasi disimpan pada varian.
- Tombol Sync pada varian memperbarui snapshot stok/harga supplier.
- Saat buyer checkout varian supplier, stok aktual tetap diverifikasi ke supplier secara live dan fulfillment menggunakan API supplier.

## Media di VPS
- Gambar produk dapat diupload dari dashboard dan disimpan di `data/uploads/`.
- Foto/video menu `/start` dapat diupload dari dashboard dan disimpan di VPS.
- Database menyimpan referensi `vps://...`, bukan URL hosting eksternal.
- Vercel menampilkan media melalui `/api/media`; bot Telegram mengupload file lokal VPS langsung ke Telegram.
- Batas upload media 3 MB per file. Format: JPG, PNG, WEBP, GIF, MP4, WEBM.

## QRIS
Pengaturan QRIS sekarang mendukung:
- GoPay Merchant
- ShopeePay Merchant
- Auto Rotating

Auto Rotating bergantian GoPay -> ShopeePay -> GoPay. Jika channel yang sedang dipilih gagal membuat QRIS, sistem mencoba channel satunya sebagai fallback.

## Pesanan manual
- Produk dipilih dari katalog.
- Varian berubah otomatis mengikuti produk yang dipilih.
- Harga jual, total, dan modal diisi dari katalog dan dihitung berdasarkan qty, tetapi tetap bisa dikoreksi admin.

## Pesanan
- Informasi pembayaran tampil langsung pada card pesanan: channel/metode, status pembayaran, nominal dan reference.
- Detail pesanan tidak lagi menampilkan Deskripsi dan SNK.
- Status `completed` dapat diubah menjadi `canceled`.
- Perubahan completed -> canceled tidak otomatis refund pembayaran dan tidak mengembalikan credential yang sudah terkirim ke stok.

## Database
Migrasi otomatis menambahkan metadata supplier pada `product_variants` tanpa menghapus data lama:
- `supplier_price`
- `supplier_public_price`
- `supplier_stock`
- `supplier_synced_at`

Status lama `cancelled` dinormalisasi menjadi `canceled`.
