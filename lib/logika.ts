// Logika bisnis murni (tanpa Telegram/Sheets) — semua HITUNGAN dikerjakan di sini.

export type Produk = { kode: string; nama: string; harga: number; hpp: number; stok: number };
export type Penjualan = {
  tanggal: string; // YYYY-MM-DD (WIB)
  kode: string;
  produk: string;
  qty: number;
  total: number;
  laba: number;
  channel: string;
};

export const CHANNEL: Record<string, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  tokped: "Tokopedia",
  tiktok: "TikTok Shop",
  tts: "TikTok Shop",
  wa: "WhatsApp",
  whatsapp: "WhatsApp",
  ig: "Instagram",
  instagram: "Instagram",
  offline: "Offline",
  langsung: "Offline",
};

/** Rupiah/qty bulat: "25.000", "Rp25,000", 25000 -> 25000 */
export function angka(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  const negatif = s.startsWith("-");
  const digit = s.replace(/[^\d]/g, "");
  if (!digit) return 0;
  return (negatif ? -1 : 1) * Number(digit);
}

/** Angka desimal: "12,5" / "12.5" / "1.234,5" -> number. null kalau tidak terbaca. */
export function desimal(v: unknown): number | null {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim().replace(/[^\d.,-]/g, "");
  if (!s || s === "-") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "25rb", "1,5jt", "25000", "Rp25.000" -> angka rupiah */
export function nominal(teks: string): number | null {
  const m = teks.toLowerCase().replace(/\s/g, "").match(/^(?:rp\.?)?([\d.,]+)(rb|ribu|k|jt|juta)?$/);
  if (!m) return null;
  const [, a, satuan] = m;
  if (satuan) {
    const n = Number(a.replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * (satuan.startsWith("j") ? 1e6 : 1e3)) : null;
  }
  return angka(a) || null;
}

/** "8:30" -> 510 detik; "8.5" / "8,5" (menit) -> 510; "9" -> 540 */
export function durasiKeDetik(teks: string): number | null {
  const t = teks.trim();
  const m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = desimal(t);
  return n === null ? null : Math.round(n * 60);
}
export const detikKeTeks = (d: number) => `${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, "0")}`;

export const rupiah = (n: number) => (n < 0 ? "-" : "") + "Rp" + Math.abs(Math.round(n)).toLocaleString("id-ID");
export const bulat = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** Tanggal & jam dalam zona WIB (server Vercel memakai UTC). */
export function sekarangWIB(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const p = Object.fromEntries(f.map((x) => [x.type, x.value]));
  return {
    tanggal: `${p.year}-${p.month}-${p.day}`,
    jam: `${p.hour}:${p.minute}`,
    waktu: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const valid = (y: number, m: number, d: number) => {
  const x = new Date(Date.UTC(y, m - 1, d));
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
};

/** "2026-10-05", "05/10/2026", "5-10-2026", "05/10" -> "2026-10-05" (null kalau bukan tanggal) */
export function parseTanggal(teks: string, tahunIni: number): string | null {
  const t = teks.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = t.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (m) {
    const d = +m[1], mo = +m[2];
    let y = m[3] ? +m[3] : tahunIni;
    if (y < 100) y += 2000;
    return valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  return null;
}

/** Tambah N bulan ke tanggal ISO */
export function tambahBulan(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Pecah argumen /jual. Contoh: "3 SB shopee", "2 spesial blend @22rb tokopedia"
 */
export function parseJual(args: string) {
  const token = args.trim().split(/\s+/).filter(Boolean);
  if (token.length < 2) return { error: "Format: <code>/jual JUMLAH PRODUK [@harga] [channel]</code>\nContoh: <code>/jual 3 SB shopee</code>" };
  const qty = Number(token[0]);
  if (!Number.isInteger(qty) || qty <= 0) return { error: "Jumlah harus angka bulat > 0. Contoh: <code>/jual 3 SB</code>" };

  let harga: number | null = null;
  let channel = "-";
  const sisa: string[] = [];
  for (const t of token.slice(1)) {
    if (t.startsWith("@")) {
      harga = nominal(t.slice(1));
      if (harga === null) return { error: `Harga "${t}" tidak terbaca. Contoh: <code>@25000</code> atau <code>@25rb</code>` };
    } else if (CHANNEL[t.toLowerCase()]) {
      channel = CHANNEL[t.toLowerCase()];
    } else sisa.push(t);
  }
  if (!sisa.length) return { error: "Nama/kode produk belum ditulis." };
  return { qty, harga, channel, kueri: sisa.join(" ") };
}

/** Cari produk berdasarkan kode (persis) atau nama (mengandung kata). */
export function cariProduk<T extends Produk>(daftar: T[], kueri: string): T[] {
  const q = kueri.toLowerCase();
  const kode = daftar.filter((p) => p.kode.toLowerCase() === q);
  if (kode.length) return kode;
  const persis = daftar.filter((p) => p.nama.toLowerCase() === q);
  if (persis.length) return persis;
  return daftar.filter((p) => p.nama.toLowerCase().includes(q));
}

// ---------------------------------------------------------------- REKAP
export type FilterRekap = { awal: string; akhir: string; label: string; channel: string | null };

const NAMA_BULAN = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const tglIndo = (iso: string) => `${+iso.slice(8, 10)} ${NAMA_BULAN[+iso.slice(5, 7)]} ${iso.slice(0, 4)}`;

/**
 * /rekap [periode|tanggal|rentang|bulan] [channel]
 * Contoh: "", "minggu", "kemarin shopee", "2026-10-05", "01/10 05/10", "01/10 - 05/10 tokopedia", "2026-09", "shopee"
 */
export function parseRekap(args: string, hariIni: string): FilterRekap | { error: string } {
  const tahun = +hariIni.slice(0, 4);
  const token = args.toLowerCase().replace(/\s(-|s\/d|sd|sampai)\s/g, " ").split(/\s+/).filter(Boolean);
  let channel: string | null = null;
  const tanggal: string[] = [];
  let periode: string | null = null;
  let bulanStr: string | null = null;

  for (const t of token) {
    if (CHANNEL[t]) channel = CHANNEL[t];
    else if (["hari", "hariini", "kemarin", "minggu", "bulan", "semua"].includes(t)) periode = t;
    else if (/^\d{4}-\d{1,2}$/.test(t)) bulanStr = t;
    else {
      const tg = parseTanggal(t, tahun);
      if (!tg) return { error: `"${t}" tidak dikenali. Contoh: <code>/rekap 05/10</code>, <code>/rekap 01/10 - 05/10 shopee</code>, <code>/rekap bulan tokopedia</code>` };
      tanggal.push(tg);
    }
  }

  const d = new Date(hariIni + "T00:00:00Z");
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  let awal = hariIni, akhir = hariIni, label = "hari ini";

  if (tanggal.length >= 2) {
    [awal, akhir] = [tanggal[0], tanggal[1]].sort();
    label = `${tglIndo(awal)} – ${tglIndo(akhir)}`;
  } else if (tanggal.length === 1) {
    awal = akhir = tanggal[0];
    label = tglIndo(awal);
  } else if (bulanStr) {
    const [y, m] = bulanStr.split("-").map(Number);
    awal = `${y}-${pad(m)}-01`;
    akhir = iso(new Date(Date.UTC(y, m, 0)));
    label = `${NAMA_BULAN[m]} ${y}`;
  } else if (periode === "kemarin") {
    const k = new Date(d);
    k.setUTCDate(d.getUTCDate() - 1);
    awal = akhir = iso(k);
    label = "kemarin";
  } else if (periode === "minggu") {
    const senin = new Date(d);
    senin.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    awal = iso(senin);
    label = "minggu ini";
  } else if (periode === "bulan") {
    awal = hariIni.slice(0, 8) + "01";
    label = "bulan ini";
  } else if (periode === "semua" || (channel && !periode)) {
    // "/rekap shopee" tanpa periode = semua waktu untuk channel itu
    awal = "0000-00-00";
    akhir = "9999-99-99";
    label = "semua waktu";
  }
  return { awal, akhir, label: channel ? `${label} · ${channel}` : label, channel };
}

export function hitungRekap(data: Penjualan[], f: FilterRekap): string {
  const pilih = data.filter((p) => p.tanggal >= f.awal && p.tanggal <= f.akhir && (!f.channel || p.channel === f.channel));
  if (!pilih.length) return `📊 Belum ada penjualan untuk <b>${f.label}</b>.`;

  const omzet = pilih.reduce((a, p) => a + p.total, 0);
  const laba = pilih.reduce((a, p) => a + p.laba, 0);
  const pcs = pilih.reduce((a, p) => a + p.qty, 0);

  const perProduk = new Map<string, { qty: number; total: number }>();
  const perChannel = new Map<string, number>();
  for (const p of pilih) {
    const x = perProduk.get(p.produk) ?? { qty: 0, total: 0 };
    x.qty += p.qty;
    x.total += p.total;
    perProduk.set(p.produk, x);
    perChannel.set(p.channel, (perChannel.get(p.channel) ?? 0) + p.total);
  }
  const urut = <T,>(m: Map<string, T>, fn: (v: T) => number) => [...m.entries()].sort((a, b) => fn(b[1]) - fn(a[1]));

  const baris = [
    `📊 <b>Rekap ${f.label}</b>`,
    `🧾 Transaksi: ${pilih.length} · Terjual: ${pcs} pcs`,
    `💰 Omzet: <b>${rupiah(omzet)}</b>`,
    `📈 Laba kotor: <b>${rupiah(laba)}</b> (${omzet ? Math.round((laba / omzet) * 100) : 0}%)`,
    "",
    "☕ <b>Per produk</b>",
    ...urut(perProduk, (v) => v.total).map(([n, v]) => `• ${n}: ${v.qty} pcs · ${rupiah(v.total)}`),
  ];
  if (!f.channel) baris.push("", "🛒 <b>Per channel</b>", ...urut(perChannel, (v) => v).map(([n, v]) => `• ${n}: ${rupiah(v)}`));
  return baris.join("\n");
}
