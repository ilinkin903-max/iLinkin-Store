# Revision v2.6.13 — Vercel Dashboard

## Fitur Pengaturan Harga Reseller per Varian Fresh & Sinkronisasi Harga API Jaspay

1. **Matriks Harga Varian Fresh di Modal Edit (`app.js`)**:
   - `freshPriceMatrixHtml`:
     - Menambahkan input `reseller_price_override_${i}` (`Harga Modal Reseller`) di samping input harga jual kustom.
     - Menyediakan placeholder informatif yang memberitahukan fallback saat ini (`Kosong = modal umum (Rp X)` atau `ikut harga jual`).
     - Menampilkan info modal reseller pada rincian kartu varian: `API Rp X · Jual Rp Y · Reseller Rp Z (Custom)`.
   - `openJaspayProduct`:
     - Menyimpan konfigurasi ke `presentation.reseller_price_overrides[pk]` saat modal disimpan.
   - `freshProductCard`:
     - Menampilkan rentang modal reseller pada badge kartu katalog produk (`Reseller ON · Modal Rp X – Rp Y`).

2. **Sinkronisasi Harga Live Jaspay (`app.js`)**:
   - `loadFresh`: Memanggil `refreshJaspayHub(true)` secara otomatis saat halaman Jaspay Fresh dibuka sehingga harga modal dari supplier Jaspay selalu mutakhir.

3. **Tata Letak Responsif (`app.css`)**:
   - Menambahkan tata letak `.fresh-price-input-row` dengan grid fleksibel untuk dua kolom input (Harga Jual Owner dan Modal Reseller).
   - Menyediakan reflow otomatis menjadi 1 kolom yang rapi pada tampilan mobile (`<= 720px`).
