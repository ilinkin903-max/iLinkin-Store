# iLink Admin - Vercel Dashboard

Paket ini hanya berisi:

- Dashboard Admin static
- Login UI
- Secure gateway ke Pterodactyl
- Backend health checker

Tidak ada database atau token bot di Vercel.

## Environment Variables Vercel

Masuk ke:

```text
Vercel -> Project -> Settings -> Environment Variables
```

Isi:

```env
PTERODACTYL_BACKEND_URL=http://HOSTNAME_PTERODACTYL:2195
VPS_PROXY_SECRET=SECRET_YANG_SAMA_DENGAN_PTERODACTYL
GATEWAY_TIMEOUT_MS=50000
```

Contoh berdasarkan hostname yang sudah berhasil kamu tes:

```env
PTERODACTYL_BACKEND_URL=http://legal-private.jhonaleystore.id:PORT_ILINK_ADMIN
```

Ganti `PORT_ILINK_ADMIN` dengan allocation server iLink Admin. Port `2195` saat ini adalah port server AI Generator yang dipakai untuk tes.

`VPS_PROXY_SECRET` harus sama persis dengan yang ada di `.env` Pterodactyl.

## Deploy

Upload folder/project ini ke GitHub lalu import ke Vercel, atau deploy dengan Vercel CLI.

Tidak ada build framework khusus.

Setelah production aktif:

```text
https://nama-project.vercel.app
```

adalah Dashboard Admin.

Alias berikut juga tersedia:

```text
/dashboard
/admin
```

## Test koneksi

Buka:

```text
https://nama-project.vercel.app/api/health
```

Jika Vercel bisa menjangkau Pterodactyl, respons berisi status backend.

Jika muncul:

```text
BACKEND_UNREACHABLE
```

berarti `PTERODACTYL_BACKEND_URL` belum benar, hostname/port tidak publik, atau seller memblokir koneksi dari internet.

## Login Admin

Username/password **bukan disimpan di Vercel**. Login diverifikasi oleh backend Pterodactyl menggunakan:

```env
ADMIN_USERNAME=
ADMIN_PASSWORD=
SESSION_SECRET=
```

Session token disimpan hanya untuk tab/session browser.

## Keamanan

Vercel menambahkan header rahasia server-side:

```text
x-ilink-proxy-secret
```

Browser tidak menerima nilai secret tersebut. Backend Pterodactyl menolak route `/api/admin/*` jika header ini salah.
