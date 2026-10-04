# ☕ Byte & Blend — Bot Penjualan (Telegram + Google Sheets + Vercel)

Bot Telegram khusus admin untuk mencatat penjualan kopi, mengelola stok, dan melihat rekap omzet & laba.
Semua data tersimpan di Google Sheets. Berjalan 24 jam di Vercel memakai **webhook** (tanpa laptop menyala).

```
[Admin di Telegram] ──pesan──► [Server Telegram] ──webhook POST──► [Vercel: /api/telegram]
                                                                         │
                                                         baca/tulis ◄────┴────► [Google Sheets]
```

## Perintah bot

| Perintah | Fungsi |
|---|---|
| `/jual 3 SB shopee` | Catat penjualan 3 pcs produk berkode SB di Shopee |
| `/jual 2 spesial blend @22rb tokopedia` | Nama produk boleh ditulis, `@harga` untuk harga khusus |
| `/produk` | Daftar produk, harga, stok |
| `/stok` | Cek stok (⚠️ kalau ≤ 5) |
| `/restok 20 SB` | Tambah stok |
| `/rekap hari` · `kemarin` · `minggu` · `bulan` · `semua` | Omzet, laba, per produk, per channel |
| `/batal` | Hapus penjualan terakhir (stok dikembalikan) |
| `/id` | Lihat ID Telegram |

Channel yang dikenali: `shopee`, `tokopedia`/`tokped`, `tiktok`/`tts`, `wa`, `ig`, `offline`.

## Struktur Google Sheets (dibuat otomatis)

- **Produk**: `Kode | Nama | Harga | HPP | Stok` — edit langsung di Sheets untuk menambah produk/mengubah harga.
- **Penjualan**: `ID | Waktu | Tanggal | Kode | Produk | Qty | Harga Satuan | Total | HPP Total | Laba | Channel | Dicatat Oleh`

## Environment Variables (Vercel)

| Nama | Isi | Type |
|---|---|---|
| `TELEGRAM_TOKEN` | Token bot dari @BotFather | Secret |
| `TELEGRAM_WEBHOOK_SECRET` | String acak (huruf/angka), untuk memastikan request dari Telegram | Secret |
| `SETUP_KEY` | String acak lain, untuk membuka `/api/setup` | Secret |
| `ADMIN_IDS` | ID Telegram admin, pisahkan koma. Contoh `123456789` | Config |
| `SHEET_ID` | ID spreadsheet (antara `/d/` dan `/edit` di URL) | Config |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **Seluruh isi** file `service_account.json` | Secret |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Opsional (Upstash Redis): cegah pesan dobel | otomatis |

## Keamanan

- Webhook hanya menerima request yang membawa header rahasia `TELEGRAM_WEBHOOK_SECRET` (selain itu → 401).
- Hanya ID di `ADMIN_IDS` yang bisa memakai bot. Kalau `ADMIN_IDS` kosong, semua ditolak.
- `/api/setup` dikunci `SETUP_KEY`.
- Semua kunci disimpan di Environment Variables, tidak pernah di kode/GitHub.
