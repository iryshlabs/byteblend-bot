import { Redis } from "@upstash/redis";
import { kirim, esc } from "@/lib/telegram";
import { bukaSheets, bacaProduk, bacaPenjualan } from "@/lib/sheets";
import { parseJual, cariProduk, hitungRekap, rupiah, sekarangWIB, type Periode } from "@/lib/logika";

export const runtime = "nodejs";
export const maxDuration = 30;

const ADMIN = new Set(
  (process.env.ADMIN_IDS || "").split(",").map((s) => Number(s.trim())).filter(Boolean),
);

// Redis opsional: mencegah pesan diproses dua kali kalau Telegram mengirim ulang (retry).
const adaRedis = Boolean(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
const redis = adaRedis ? Redis.fromEnv() : null;

type Pesan = { message_id: number; chat: { id: number }; from?: { id: number; first_name?: string }; text?: string };

const BANTUAN = [
  "☕ <b>Bot Penjualan Byte &amp; Blend</b>",
  "",
  "<b>Catat penjualan</b>",
  "<code>/jual 3 SB shopee</code>",
  "<code>/jual 2 spesial blend @22rb tokopedia</code>",
  "  • <code>@harga</code> opsional (default dari Sheets)",
  "  • channel: shopee, tokopedia, tiktok, wa, ig, offline",
  "",
  "<b>Lainnya</b>",
  "/produk — daftar produk &amp; harga",
  "/stok — cek stok",
  "<code>/restok 20 SB</code> — tambah stok",
  "<code>/rekap hari|kemarin|minggu|bulan|semua</code>",
  "/batal — hapus penjualan terakhir",
  "/id — lihat ID Telegram",
].join("\n");

export async function POST(req: Request) {
  // 1) Pastikan request benar-benar dari Telegram (secret token saat setWebhook)
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const msg: Pesan | undefined = update?.message;
  if (!msg?.text || !msg.from) return Response.json({ ok: true });

  // 2) Abaikan update yang sudah pernah diproses
  if (redis && update.update_id) {
    const baru = await redis.set(`tg:update:${update.update_id}`, 1, { nx: true, ex: 3600 });
    if (!baru) return Response.json({ ok: true });
  }

  const chatId = msg.chat.id;
  const [perintahRaw, ...rest] = msg.text.trim().split(/\s+/);
  const perintah = perintahRaw.toLowerCase().replace(/@.*$/, ""); // "/jual@namabot" -> "/jual"
  const args = rest.join(" ");

  if (perintah === "/id") {
    await kirim(chatId, `ID Telegram kamu: <code>${msg.from.id}</code>`);
    return Response.json({ ok: true });
  }

  // 3) Hanya admin yang boleh memakai bot
  if (!ADMIN.has(msg.from.id)) {
    await kirim(chatId, "⛔ Bot ini khusus admin Byte &amp; Blend.");
    return Response.json({ ok: true });
  }

  try {
    await proses(perintah, args, msg);
  } catch (e) {
    console.error("Error memproses pesan:", e);
    await kirim(chatId, "❌ Terjadi kesalahan. Coba lagi sebentar lagi.");
  }
  // Selalu balas 200 supaya Telegram tidak mengirim ulang terus-menerus
  return Response.json({ ok: true });
}

async function proses(perintah: string, args: string, msg: Pesan) {
  const chatId = msg.chat.id;

  if (perintah === "/start" || perintah === "/help") return kirim(chatId, BANTUAN);

  const { produk: shProduk, penjualan: shJual } = await bukaSheets();

  if (perintah === "/produk" || perintah === "/stok") {
    const daftar = await bacaProduk(shProduk);
    if (!daftar.length) return kirim(chatId, "Belum ada produk. Isi tab <b>Produk</b> di Google Sheets.");
    const baris = daftar.map((p) =>
      perintah === "/produk"
        ? `• <code>${esc(p.kode)}</code> ${esc(p.nama)} — ${rupiah(p.harga)} (stok ${p.stok})`
        : `${p.stok <= 5 ? "⚠️" : "✅"} <code>${esc(p.kode)}</code> ${esc(p.nama)}: <b>${p.stok}</b> pcs`,
    );
    return kirim(chatId, `${perintah === "/produk" ? "☕ <b>Daftar produk</b>" : "📦 <b>Stok</b>"}\n${baris.join("\n")}`);
  }

  if (perintah === "/jual" || perintah === "/restok") {
    const p = parseJual(args);
    if ("error" in p) return kirim(chatId, `⚠️ ${p.error}`);
    const daftar = await bacaProduk(shProduk);
    const cocok = cariProduk(daftar, p.kueri);
    if (cocok.length !== 1) {
      const opsi = daftar.map((x) => `<code>${esc(x.kode)}</code> ${esc(x.nama)}`).join("\n");
      return kirim(chatId, `${cocok.length ? "🤔 Lebih dari satu produk cocok" : "🤔 Produk tidak ditemukan"} untuk "${esc(p.kueri)}".\nPakai kode:\n${opsi}`);
    }
    const prod = daftar.find((x) => x.kode === cocok[0].kode)!;

    if (perintah === "/restok") {
      prod.row.set("Stok", prod.stok + p.qty);
      await prod.row.save({ raw: true });
      return kirim(chatId, `📦 Stok <b>${esc(prod.nama)}</b>: ${prod.stok} → <b>${prod.stok + p.qty}</b>`);
    }

    const harga = p.harga ?? prod.harga;
    const total = harga * p.qty;
    const hppTotal = prod.hpp * p.qty;
    const { tanggal, waktu } = sekarangWIB();
    await shJual.addRow(
      {
        ID: `${chatId}-${msg.message_id}`,
        Waktu: waktu,
        Tanggal: tanggal,
        Kode: prod.kode,
        Produk: prod.nama,
        Qty: p.qty,
        "Harga Satuan": harga,
        Total: total,
        "HPP Total": hppTotal,
        Laba: total - hppTotal,
        Channel: p.channel,
        "Dicatat Oleh": String(msg.from!.id),
      },
      { raw: true },
    );
    const stokBaru = prod.stok - p.qty;
    prod.row.set("Stok", stokBaru);
    await prod.row.save({ raw: true });

    return kirim(
      chatId,
      [
        `✅ <b>Tercatat!</b>`,
        `☕ ${esc(prod.nama)} × ${p.qty}`,
        `💵 ${rupiah(harga)} / pcs → <b>${rupiah(total)}</b>`,
        `📈 Laba: ${rupiah(total - hppTotal)}`,
        `🛒 ${p.channel}`,
        `📦 Sisa stok: ${stokBaru}${stokBaru <= 5 ? " ⚠️ menipis!" : ""}`,
        `Salah? ketik /batal`,
      ].join("\n"),
    );
  }

  if (perintah === "/rekap") {
    const periode = (["hari", "kemarin", "minggu", "bulan", "semua"].includes(args.toLowerCase()) ? args.toLowerCase() : "hari") as Periode;
    const data = await bacaPenjualan(shJual);
    return kirim(chatId, hitungRekap(data, periode, sekarangWIB().tanggal));
  }

  if (perintah === "/batal") {
    const rows = await shJual.getRows();
    const terakhir = [...rows].reverse().find((r) => String(r.get("Dicatat Oleh")) === String(msg.from!.id));
    if (!terakhir) return kirim(chatId, "Tidak ada penjualan untuk dihapus.");
    const kode = String(terakhir.get("Kode"));
    const qty = Number(String(terakhir.get("Qty")).replace(/[^\d]/g, "")) || 0;
    const nama = String(terakhir.get("Produk"));
    await terakhir.delete();
    // kembalikan stok
    const daftar = await bacaProduk(shProduk);
    const prod = daftar.find((x) => x.kode === kode);
    if (prod) {
      prod.row.set("Stok", prod.stok + qty);
      await prod.row.save({ raw: true });
    }
    return kirim(chatId, `🗑️ Penjualan terakhir dihapus: ${esc(nama)} × ${qty}${prod ? ` (stok dikembalikan → ${prod.stok + qty})` : ""}`);
  }

  return kirim(chatId, "Perintah tidak dikenal. Ketik /help untuk bantuan.");
}
