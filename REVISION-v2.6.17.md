# Revision v2.6.17 — VPS

## Perbaikan Bug [jaspay:fallback-cache] fetch failed & Stabilisasi Sinkronisasi Katalog Jaspay

Pada versi v2.6.17, dilakukan perbaikan tuntas terhadap peringatan `[jaspay:fallback-cache] fetch failed` yang sebelumnya muncul berulang kali di console server VPS/Pterodactyl.

---

### Penyebab Munculnya Pesan
1. **Background Loop 60 Detik dengan `force: true`**:
   Pada `server.js`, timer `freshSyncTimer` sebelumnya dijalankan setiap 60 detik memanggil `jaspay.products({force: true})`. Penggunaan `force: true` memaksa Node.js melakukan koneksi jaringan ke API Jaspay setiap menit tanpa memperhitungkan cache memori.
2. **Koneksi Jaringan / DNS / IPv6 di VPS**:
   Node.js 18+ secara default mencoba alamat IPv6 (`::1` / AAAA record) terlebih dahulu. Di lingkungan container Docker / Pterodactyl yang tidak memiliki rute keluar IPv6, pemanggilan `fetch('https://api.jaspay.site/...')` gagal seketika dengan error native `TypeError: fetch failed`.
3. **Peringatan Fallback Berulang Tanpa Throttle**:
   Ketika fetch gagal, `lib/jaspay.js` mengembalikan data cache lokal agar bot tidak down, namun mengeluarkan `console.warn('[jaspay:fallback-cache]', error.message)` pada setiap panggilan tanpa pembatasan frekuensi log.

---

### Solusi & Perbaikan
1. **Prioritas IPv4 (`dns.setDefaultResultOrder('ipv4first')`)**:
   Diterapkan pada `server.js` dan `lib/jaspay.js` sehingga Node.js selalu memprioritaskan resolusi IPv4 yang stabil pada VPS/Pterodactyl container.
2. **User-Agent Header & Detail Diagnostik Error**:
   Permintaan ke Jaspay kini menyertakan header `User-Agent: iLink-Store-Bot/2.6 (Node.js)` untuk mencegah blokir bot dari Cloudflare, dan error internal (`e.cause`) kini menyertakan rincian kode jaringan (seperti `ETIMEDOUT`, `ENOTFOUND`, dll.).
3. **Throttling & Auto-Recovery Peringatan Console**:
   Warning `[jaspay:fallback-cache]` kini hanya dicatat sekali saat terjadi gangguan atau jika jenis error berubah, bukan setiap menit. Ketika koneksi ke Jaspay kembali normal, sistem otomatis mencatat `[jaspay:recovered] Koneksi API Jaspay telah pulih normal.`.
4. **Fallback Bertingkat SQLite Snapshot**:
   Jika server baru saja di-restart saat koneksi API Jaspay sedang terkendala (sehingga cache memori masih kosong), sistem otomatis memuat katalog dari snapshot database SQLite lokal (`jaspay_products`), sehingga menu produk toko tetap dapat dibuka customer.
5. **Adaptive Background Sync & Backoff**:
   Sinkronisasi otomatis di `server.js` kini:
   - Memeriksa pengaturan `jaspay_enabled` (tidak berjalan jika fitur dinonaktifkan di dashboard).
   - Menggunakan interval default 5 menit tanpa memaksa bypass cache (`force: false`).
   - Menerapkan exponential backoff jika terjadi kegagalan jaringan sementara.
