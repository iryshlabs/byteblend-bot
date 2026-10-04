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

/** "25.000", "Rp25,000", 25000 -> 25000. Untuk rupiah & qty (bilangan bulat). */
export function angka(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  const negatif = s.startsWith("-");
  const digit = s.replace(/[^\d]/g, "");
  if (!digit) return 0;
  return (negatif ? -1 : 1) * Number(digit);
}

/** "25rb", "1,5jt", "25000" -> angka */
export function nominal(teks: string): number | null {
  const m = teks.toLowerCase().match(/^(?:rp\.?)?([\d.,]+)(rb|ribu|k|jt|juta)?$/);
  if (!m) return null;
  const [, a, satuan] = m;
  if (satuan) {
    const n = Number(a.replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * (satuan.startsWith("j") ? 1e6 : 1e3)) : null;
  }
  return angka(a) || null;
}

export const rupiah = (n: number) => (n < 0 ? "-" : "") + "Rp" + Math.abs(Math.round(n)).toLocaleString("id-ID");

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
  return { tanggal: `${p.year}-${p.month}-${p.day}`, waktu: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` };
}

/**
 * Pecah argumen /jual.
 * Contoh: "3 SB shopee", "2 spesial blend @22rb tokopedia", "1 SB"
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
export function cariProduk(daftar: Produk[], kueri: string): Produk[] {
  const q = kueri.toLowerCase();
  const kode = daftar.filter((p) => p.kode.toLowerCase() === q);
  if (kode.length) return kode;
  const persis = daftar.filter((p) => p.nama.toLowerCase() === q);
  if (persis.length) return persis;
  return daftar.filter((p) => p.nama.toLowerCase().includes(q));
}

export type Periode = "hari" | "kemarin" | "minggu" | "bulan" | "semua";

export function rentang(periode: Periode, hariIni: string): [string, string, string] {
  const d = new Date(hariIni + "T00:00:00Z");
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  if (periode === "kemarin") {
    const k = new Date(d);
    k.setUTCDate(d.getUTCDate() - 1);
    return [iso(k), iso(k), "kemarin"];
  }
  if (periode === "minggu") {
    const senin = new Date(d);
    senin.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return [iso(senin), hariIni, "minggu ini"];
  }
  if (periode === "bulan") return [hariIni.slice(0, 8) + "01", hariIni, "bulan ini"];
  if (periode === "semua") return ["0000-00-00", "9999-99-99", "semua waktu"];
  return [hariIni, hariIni, "hari ini"];
}

export function hitungRekap(data: Penjualan[], periode: Periode, hariIni: string): string {
  const [awal, akhir, label] = rentang(periode, hariIni);
  const pilih = data.filter((p) => p.tanggal >= awal && p.tanggal <= akhir);
  if (!pilih.length) return `📊 Belum ada penjualan untuk <b>${label}</b>.`;

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
  const urut = <T,>(m: Map<string, T>, f: (v: T) => number) => [...m.entries()].sort((a, b) => f(b[1]) - f(a[1]));

  return [
    `📊 <b>Rekap ${label}</b>`,
    `🧾 Transaksi: ${pilih.length} · Terjual: ${pcs} pcs`,
    `💰 Omzet: <b>${rupiah(omzet)}</b>`,
    `📈 Laba kotor: <b>${rupiah(laba)}</b> (${omzet ? Math.round((laba / omzet) * 100) : 0}%)`,
    "",
    "☕ <b>Per produk</b>",
    ...urut(perProduk, (v) => v.total).map(([n, v]) => `• ${n}: ${v.qty} pcs · ${rupiah(v.total)}`),
    "",
    "🛒 <b>Per channel</b>",
    ...urut(perChannel, (v) => v).map(([n, v]) => `• ${n}: ${rupiah(v)}`),
  ].join("\n");
}
