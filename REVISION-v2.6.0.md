# Revision v2.6.0

## Produk Fresh
- Menambahkan integrasi Jaspay Fresh hanya di backend Pterodactyl.
- Customer melihat menu `⚡ Produk Fresh`; nama Jaspay/supplier tidak ditampilkan di chat customer.
- Katalog live, opsi produk dinamis, quantity, pembayaran Saldo Bot atau QRIS.
- Setelah pembayaran: status `fresh_processing`; Bot memproses order di background.
- Final `completed`, `partial`, atau `failed` dipetakan ke order lokal.
- `partial` mengirim akun yang berhasil dan refund item gagal ke Saldo Bot.
- Hasil akun dikirim dalam blok copy tanpa tombol.
- `Idempotency-Key` memakai invoice iLink, dan `expected_total` memakai biaya API yang dikunci saat pembayaran agar perubahan harga tidak diam-diam mengubah modal.
- Error non-retry masuk `fresh_attention` dan customer mendapat pesan generik tanpa nama provider.

## Dashboard Owner
- Pengaturan > Supplier > Jaspay Fresh menampilkan balance, limit harian, antrean, katalog, harga API, harga jual, status ON/OFF, dan konfigurasi markup/fixed price.
- JASPAY_API_KEY hanya disimpan di VPS `.env`, tidak dikirim ke Vercel/browser.

## Stabilitas
- Memperbaiki transaksi `adjustWallet()` yang sebelumnya dapat melakukan COMMIT tanpa BEGIN pada beberapa jalur refund/topup.
