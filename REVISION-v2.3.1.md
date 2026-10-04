# iLink Auto Order v2.3.1

## Perbaikan utama
- Telegram API JSON memakai keep-alive connection dan IPv4 khusus Telegram untuk mengurangi ETIMEDOUT pada VPS shared.
- Timeout interaksi bot dipendekkan; callback tidak lagi menunggu request network sebelum UI lanjut.
- Update diproses paralel antar chat, tetapi tetap berurutan untuk chat yang sama. Satu user yang lambat tidak membekukan semua user.
- Polling memiliki backoff bertahap dan diagnostik latency/network failure.
- Cek wajib-join fail-open saat Telegram API sedang timeout agar bot tidak freeze karena `getChatMember`.
- QRIS button menampilkan mode aktif: GoPay, ShopeePay, atau Auto Rotating.
- Default kartu sidebar = Profit Bulan Ini; dapat dipilih Profit/Omzet harian/bulanan atau saldo manual.
