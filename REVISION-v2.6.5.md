# iLink Auto Order v2.6.5

Perbaikan utama:

- Landing **Pengaturan** dan **Bot & Notifikasi** di desktop sekarang memakai lebar penuh dashboard, kartu 2 kolom, teks/icon lebih proporsional; tetap responsif 1 kolom di tablet/mobile.
- Sidebar/menu utama pada layout web/tablet dapat ditutup dengan klik area di luar menu. Backdrop sekarang aktif sampai breakpoint 1100px dan state `aria-expanded` ikut disinkronkan.
- Memperbaiki bug import reseller: pilihan **Produk baru** tidak lagi membuat produk induk + satu varian supplier.
- Produk biasa sekarang dapat menyimpan koneksi supplier langsung (`supplier_source`, `supplier_product_id`, snapshot harga/stok, waktu sinkronisasi).
- Checkout, pengecekan stok live, dan fulfillment supplier mendukung koneksi supplier langsung di level produk tanpa varian.
- Menambahkan endpoint dan tombol **Sync Supplier** untuk produk supplier langsung.
- Migrasi aman untuk pola auto-import v2.6.4 `SUP-PRO-*` / `SUP-AIV-*` dengan tepat satu varian supplier: dikonversi menjadi produk biasa, stok/order tetap dipertahankan.
