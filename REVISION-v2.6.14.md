# Revision v2.6.14 — Vercel

## Perbaikan Form Atur Produk Fresh & Tampilan Saldo Jaspay di Dashboard

1. **Penyederhanaan Form Modal "Atur Produk Fresh" (`app.js` & `index.html`)**:
   - Menghapus input ganda di bagian atas form modal (`reseller_price`, `pricing_mode`, `pricing_value`, dan `sell_price_min`) yang sebelumnya membingungkan owner karena di bawahnya juga ada input per varian.
   - Bagian atas form kini bersih, hanya menampilkan:
     - Status Generate API (`Aktif / Nonaktif`)
     - Izin Dijual Reseller (`Ya / Tidak`)
     - Rentang Modal API Jaspay (Readonly)
     - Maksimal / Order (Readonly)
   - Seluruh pengaturan harga jual customer dan harga modal reseller dipusatkan 100% pada bagian:
     - `💵 Harga Jual & Modal Reseller per Pilihan API`
     - Setiap varian langsung memiliki input:
       - `🏷️ Harga Jual Owner (Customer)`
       - `🤝 Harga Modal Reseller`
     - Placeholder input otomatis menampilkan nominal aktif saat ini (`Saat ini: Rp X.XXX`).
   - **Perbaikan Validasi Browser Step Constraint**:
     - Mengubah atribut `min="1" step="100"` menjadi `min="0" step="any"` pada input harga override.
     - Menambahkan atribut `novalidate` pada form dialog modal di `index.html`.
     - Masalah browser memunculkan *"Please enter a valid value. The two nearest valid values are 6401 and 6501"* saat input 6500 atau 10000 telah terselesaikan sepenuhnya. Owner kini dapat menginput nominal Rupiah bulat berapapun tanpa batasan step.

2. **Indikator Saldo API Jaspay Cerdas & Informatif (`app.js`)**:
   - Saldo API Jaspay tidak lagi menampilkan `-` tanpa kejelasan.
   - Status Saldo KPI diintegrasikan:
     - **Terkoneksi**: Menampilkan nominal saldo credit aktif (misal `150.00 Credit` atau `Rp 150.000`).
     - **Belum Ada Key**: Menampilkan status `Belum Ada Key` berwarna kuning disertai instruksi untuk mengisi API Key.
     - **Sedang Perbaikan**: Menampilkan status `Perbaikan` jika API supplier sedang maintenance.
     - **Kendala Koneksi / Key Salah**: Menampilkan `Gagal Cek` beserta pesan error langsung dari supplier Jaspay.
   - Ditambahkan form input **JASPAY API Key (Supplier)** di kartu **Pengaturan Global Fresh** sehingga owner bisa memasukkan dan mengganti API Key Jaspay langsung dari dashboard web.

3. **Cache Buster & Versi**:
   - File `VERSION` diperbarui ke `2.6.14`.
   - `index.html` diperbarui dengan cache buster script dan style `?v=2.6.14`.
