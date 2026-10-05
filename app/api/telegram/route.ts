import { Redis } from "@upstash/redis";
import { kirim, esc } from "@/lib/telegram";
import { bukaSheets, bacaProduk, bacaPenjualan } from "@/lib/sheets";
import { parseJual, cariProduk, hitungRekap, parseRekap, nominal, angka, rupiah, sekarangWIB } from "@/lib/logika";
import { FORM, formTemplate, prosesForm, stokBahan, lihat, batalInput } from "@/lib/produksi";
import { ALIAS_TOPIK, PEMBUKA, SEMUA_HELP, TOPIK } from "@/lib/bantuan";

export const runtime = "nodejs";
export const maxDuration = 30;

const ADMIN = new Set(
  (process.env.ADMIN_IDS || "").split(",").map((s) => Number(s.trim())).filter(Boolean),
);

// Redis opsional: mencegah pesan diproses dua kali kalau Telegram mengirim ulang (retry).
const adaRedis = Boolean(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
const redis = adaRedis ? Redis.fromEnv() : null;

type Pesan = { message_id: number; chat: { id: number }; from?: { id: number; first_name?: string }; text?: string };

type NamaForm = keyof typeof FORM;
const adalahForm = (x: string): x is NamaForm => x in FORM;

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
  // Perintah = kata pertama; sisanya (termasuk baris baru untuk formulir) disimpan utuh.
  const teks = msg.text.trim();
  const m = teks.match(/^(\S+)\s*([\s\S]*)$/)!;
  const perintah = m[1].toLowerCase().replace(/@.*$/, ""); // "/jual@namabot" -> "/jual"
  const body = m[2]; // multi-baris
  const args = body.replace(/\s+/g, " ").trim(); // satu baris

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
    await proses(perintah, args, body, msg);
  } catch (e) {
    console.error("Error memproses pesan:", e);
    await kirim(chatId, "❌ Terjadi kesalahan. Coba lagi sebentar lagi.");
  }
  // Selalu balas 200 supaya Telegram tidak mengirim ulang terus-menerus
  return Response.json({ ok: true });
}

async function proses(perintah: string, args: string, body: string, msg: Pesan) {
  const chatId = msg.chat.id;
  const cmd = perintah.replace(/^\//, "");

  // ---------- BANTUAN (tanpa buka Sheets)
  if (cmd === "start") return kirim(chatId, PEMBUKA.replace("Penjelasan lengkap di bawah 👇", "Ketik /help untuk penjelasan lengkap."));
  if (cmd === "help") {
    const t = args.toLowerCase().replace(/^\//, "");
    if (!t) {
      for (const bagian of SEMUA_HELP) await kirim(chatId, bagian);
      return;
    }
    if (adalahForm(t)) return kirim(chatId, formTemplate(t));
    const topik = ALIAS_TOPIK[t];
    if (topik) return kirim(chatId, TOPIK[topik]);
    return kirim(chatId, `Topik "${esc(t)}" tidak ada. Coba: penjualan, rekap, produk, produksi, bahan, roasting, resep, qc, kemas, hpp, lihat.`);
  }

  // Formulir produksi tanpa isi → kirim template (tanpa buka Sheets)
  if (adalahForm(cmd) && !body.trim()) return kirim(chatId, formTemplate(cmd));

  const sh = await bukaSheets();
  const { produk: shProduk, penjualan: shJual } = sh;

  // ---------- PRODUKSI
  if (adalahForm(cmd)) return kirim(chatId, await prosesForm(cmd, body, { sh, oleh: String(msg.from!.id) }));
  if (cmd === "stokbahan") return kirim(chatId, await stokBahan(sh));
  if (cmd === "lihat") return kirim(chatId, await lihat(sh, args));
  if (cmd === "batalinput") return kirim(chatId, await batalInput(sh, args));

  // ---------- TAMBAH / HAPUS PRODUK
  if (cmd === "tambahproduk") {
    const bagian = args.split("|").map((x) => x.trim());
    const [kode, nama, hargaT, hppT = "0", stokT = "0"] = bagian;
    if (bagian.length < 3 || !kode || !nama)
      return kirim(chatId, "Format: <code>/tambahproduk KODE | Nama Produk | harga | hpp | stok</code>\nContoh: <code>/tambahproduk GK | Gayo Klasik Drip Bag | 28rb | 13rb | 30</code>\n(hpp &amp; stok boleh dikosongkan)");
    if (/\s/.test(kode)) return kirim(chatId, "⚠️ Kode produk tidak boleh mengandung spasi. Contoh: <code>GK</code> atau <code>BEAN-250G-AC-NAT</code>");
    const harga = nominal(hargaT);
    const hpp = /^0*$/.test(hppT) ? 0 : nominal(hppT);
    const stok = /^\d+$/.test(stokT) ? Number(stokT) : NaN;
    if (!harga) return kirim(chatId, `⚠️ Harga "${esc(hargaT)}" tidak terbaca. Contoh: 28rb atau 28000`);
    if (hpp === null) return kirim(chatId, `⚠️ HPP "${esc(hppT)}" tidak terbaca. Contoh: 13rb atau 13000`);
    if (!Number.isInteger(stok)) return kirim(chatId, `⚠️ Stok "${esc(stokT)}" harus angka bulat.`);
    const daftar = await bacaProduk(shProduk);
    const dobel = daftar.find((p) => p.kode.toLowerCase() === kode.toLowerCase());
    if (dobel) return kirim(chatId, `⚠️ Kode <b>${esc(kode)}</b> sudah dipakai oleh ${esc(dobel.nama)}. Pakai kode lain.`);
    await shProduk.addRow({ Kode: kode.toUpperCase(), Nama: nama, Harga: harga, HPP: hpp, Stok: stok }, { raw: true });
    const margin = harga ? Math.round(((harga - hpp) / harga) * 100) : 0;
    return kirim(chatId, [
      "✅ <b>Produk ditambahkan</b>",
      `<code>${esc(kode.toUpperCase())}</code> ${esc(nama)}`,
      `💵 Harga ${rupiah(harga)} · HPP ${rupiah(hpp)} · margin ${margin}%`,
      `📦 Stok awal: ${stok}`,
      `Langsung bisa dipakai: <code>/jual 1 ${esc(kode.toUpperCase())} shopee</code>`,
    ].join("\n"));
  }

  if (cmd === "hapusproduk") {
    const [kode, konfirmasi] = args.split(" ");
    if (!kode) return kirim(chatId, "Format: <code>/hapusproduk KODE</code>");
    const daftar = await bacaProduk(shProduk);
    const p = daftar.find((x) => x.kode.toLowerCase() === kode.toLowerCase());
    if (!p) return kirim(chatId, `🤔 Kode "${esc(kode)}" tidak ditemukan. Cek /produk.`);
    if (konfirmasi?.toLowerCase() !== "ya")
      return kirim(chatId, `⚠️ Yakin hapus <b>${esc(p.nama)}</b> (stok ${p.stok})?\nKirim <code>/hapusproduk ${esc(p.kode)} ya</code> untuk konfirmasi.\nRiwayat penjualan tidak ikut terhapus.`);
    await p.row.delete();
    return kirim(chatId, `🗑️ Produk <b>${esc(p.nama)}</b> (<code>${esc(p.kode)}</code>) dihapus.`);
  }

  if (cmd === "produk" || cmd === "stok") {
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
    const f = parseRekap(args, sekarangWIB().tanggal);
    if ("error" in f) return kirim(chatId, `⚠️ ${f.error}`);
    const data = await bacaPenjualan(shJual);
    return kirim(chatId, hitungRekap(data, f));
  }

  if (perintah === "/batal") {
    const rows = await shJual.getRows();
    const terakhir = [...rows].reverse().find((r) => String(r.get("Dicatat Oleh")) === String(msg.from!.id));
    if (!terakhir) return kirim(chatId, "Tidak ada penjualan untuk dihapus.");
    const kode = String(terakhir.get("Kode"));
    const qty = angka(terakhir.get("Qty"));
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
