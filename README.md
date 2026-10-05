# ☕ Byte & Blend — Bot Penjualan (Telegram + Google Sheets + Vercel)

Bot Telegram khusus admin untuk mencatat penjualan kopi, mengelola stok, dan melihat rekap omzet & laba.
Semua data tersimpan di Google Sheets. Berjalan 24 jam di Vercel memakai **webhook** (tanpa laptop menyala).

```
[Admin di Telegram] ──pesan──► [Server Telegram] ──webhook POST──► [Vercel: /api/telegram]
                                                                         │
                                                         baca/tulis ◄────┴────► [Google Sheets]
```

## Perintah bot

Ketik `/help` di bot untuk penjelasan lengkap, atau `/help <topik>` (mis. `/help roasting`).

### Penjualan
| Perintah | Fungsi |
|---|---|
| `/jual 3 SB shopee` | Catat penjualan (stok berkurang otomatis) |
| `/jual 2 spesial blend @22rb tokopedia` | Nama produk boleh ditulis, `@harga` untuk harga khusus |
| `/batal` | Hapus penjualan terakhir (stok dikembalikan) |
| `/rekap` · `kemarin` · `minggu` · `bulan` · `semua` | Rekap omzet & laba |
| `/rekap 05/10` · `/rekap 01/10 - 05/10` · `/rekap 2026-09` | Rekap tanggal / rentang / bulan tertentu |
| `/rekap shopee` · `/rekap bulan tokopedia` | Rekap per channel |

### Produk & stok
| Perintah | Fungsi |
|---|---|
| `/produk` · `/stok` | Daftar produk / cek stok |
| `/restok 20 SB` | Tambah stok |
| `/tambahproduk GK \| Gayo Klasik Drip Bag \| 28rb \| 13rb \| 30` | Produk baru (kode, nama, harga, HPP, stok) |
| `/hapusproduk GK` lalu `/hapusproduk GK ya` | Hapus produk (dengan konfirmasi) |

### Produksi (ketik perintahnya saja untuk mendapat template)
| Perintah | Tab | Otomatis |
|---|---|---|
| `/bahan` | Bahan Baku | HPP/kg, stok green bean |
| `/stokbahan` | — | Sisa stok green bean |
| `/roasting` | Roasting | No. batch, weight loss, development time, DTR, stok green berkurang |
| `/resep` | Resep | Cek total komposisi kopi = 100% |
| `/qc` | QC | Total score SCA, status PASS/HOLD/REJECT |
| `/kemas` | Pengemasan | Best before, stok produk bertambah |
| `/hpp` | HPP | Biaya kopi setelah susut, harga retail & grosir, update HPP produk |

### Data
| Perintah | Fungsi |
|---|---|
| `/lihat roasting 5` | Lihat data terakhir sebuah tab |
| `/batalinput qc` | Hapus baris terakhir tab produksi (stok ikut dikoreksi) |
| `/id` | Lihat ID Telegram |

Channel yang dikenali: `shopee`, `tokopedia`/`tokped`, `tiktok`/`tts`, `wa`, `ig`, `offline`.

## Struktur Google Sheets (dibuat otomatis)

Tab: **Produk**, **Penjualan**, **Bahan Baku**, **Roasting**, **Resep**, **QC**, **Pengemasan**, **HPP**.
Tab yang belum ada dibuat otomatis lengkap dengan judul kolom saat bot pertama kali dipakai.

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
