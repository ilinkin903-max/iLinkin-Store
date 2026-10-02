# iLink Auto Order v2.0.0 - Vercel Dashboard

Paket Vercel ini berisi **Dashboard Owner neo-brutalism** dan secure gateway menuju backend Pterodactyl.

Vercel tidak menyimpan database, BOT_TOKEN, AutoGoPay key, atau supplier key.

## Tampilan Dashboard

Tema mengikuti referensi neo-brutalism:

- Sidebar ungu
- Border hitam tebal + hard shadow
- Dashboard, Produk, Pesanan, Pelanggan, Laporan, Kupon, Pengaturan, Bot & Notifikasi, Pengguna
- Owner card + Saldo Toko
- 5 kartu statistik
- Search/filter produk
- Product cards dua kolom
- Toggle ON/OFF
- Edit / Stok / Kelola / Hapus
- Status bar + Refresh Data
- Responsive untuk desktop/tablet/mobile

Semua komponen adalah UI nyata dan terhubung ke API Pterodactyl, bukan gambar statis.

## Environment Variables

Vercel -> Project -> Settings -> Environment Variables:

```env
PTERODACTYL_BACKEND_URL=http://HOSTNAME_PTERODACTYL:PORT
VPS_PROXY_SECRET=SECRET_YANG_SAMA_DENGAN_PTERODACTYL
GATEWAY_TIMEOUT_MS=50000
```

Contoh pola hostname yang sudah terverifikasi:

```env
PTERODACTYL_BACKEND_URL=http://legal-private.jhonaleystore.id:PORT_ILINK_AUTOORDER
```

Jangan memakai port server AI Generator jika dashboard/backend v2 berjalan pada server Pterodactyl berbeda.

`VPS_PROXY_SECRET` harus sama persis dengan `.env` VPS.

## Deploy

1. Upload seluruh isi ZIP Vercel ke repository GitHub.
2. Vercel -> Add New -> Project -> Import repository.
3. Framework Preset: `Other`.
4. Tambahkan Environment Variables di atas.
5. Deploy Production.
6. Tes:

```text
https://nama-project.vercel.app/api/health
```

7. Buka:

```text
https://nama-project.vercel.app
```

Alias berikut juga menuju dashboard:

```text
/dashboard
/admin
```

## Login

Credential admin berada di `.env` Pterodactyl:

```env
ADMIN_USERNAME=
ADMIN_PASSWORD=
SESSION_SECRET=
```

Browser menerima signed session setelah login. Secret gateway tidak dikirim ke JavaScript frontend.

## Koneksi API

Frontend memanggil:

```text
/api/gateway?path=/api/admin/...
```

Gateway Vercel menambahkan header rahasia server-side:

```text
x-ilink-proxy-secret
```

Backend Pterodactyl menolak Admin API bila secret salah.

## Fitur Dashboard

- Overview
- Produk + varian + stok
- Pesanan + PRE-ORDER fulfillment
- Pelanggan
- Laporan omzet/profit
- Kupon + redeem
- Pengaturan bot/store/referral/channel/Nokos/media start
- Status AutoGoPay dan supplier
- Broadcast teks/foto/sticker/polling
- Backup SQLite
- Pengguna + saldo
- Telegram direct message

Marketplace web customer belum diaktifkan pada versi ini. Customer order melalui bot Telegram.
