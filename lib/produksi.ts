// Modul produksi: Bahan Baku, Roasting, Resep, QC, Pengemasan, HPP.
import type { GoogleSpreadsheetRow } from "google-spreadsheet";
import { parseForm, template, type Field } from "./form";
import { bacaProduk, type NamaTab, type Sheets } from "./sheets";
import { esc } from "./telegram";
import { bulat, desimal, detikKeTeks, durasiKeDetik, rupiah, sekarangWIB, tambahBulan } from "./logika";

type Row = GoogleSpreadsheetRow<Record<string, unknown>>;
const s = (v: unknown) => String(v ?? "").trim();
const n = (v: unknown) => desimal(v) ?? 0;
const ada = (v: unknown) => v !== undefined && v !== "";

// ======================================================= DEFINISI FORMULIR
export const FORM: Record<"bahan" | "roasting" | "resep" | "qc" | "kemas" | "hpp", { judul: string; fields: Field[]; catatan?: string }> = {
  bahan: {
    judul: "Bahan Baku (Green Beans)",
    fields: [
      { key: "kode", label: "Kode batch bahan baku", tipe: "teks", wajib: true, contoh: "GB-ACEH-2401" },
      { key: "asal", label: "Asal/origin kopi", tipe: "teks", contoh: "Aceh Gayo", alias: ["origin"] },
      { key: "region", label: "Region/daerah", tipe: "teks", contoh: "Bener Meriah" },
      { key: "masl", label: "Ketinggian (mdpl)", tipe: "teks", contoh: "1500", alias: ["ketinggian", "mdpl"] },
      { key: "jenis", label: "Arabika/Robusta", tipe: "teks", contoh: "Arabika" },
      { key: "varietas", label: "Varietas", tipe: "teks", contoh: "Typica" },
      { key: "proses", label: "Natural/Washed/Honey/Anaerobic", tipe: "teks", contoh: "Washed" },
      { key: "pemasok", label: "Pemasok/petani/koperasi", tipe: "teks", contoh: "Koperasi Gayo Mandiri" },
      { key: "tanggal", label: "Tanggal terima (kosong = hari ini)", tipe: "tanggal", contoh: "05/10/2026" },
      { key: "kadar_air", label: "Kadar air awal (%)", tipe: "angka", contoh: "11,5" },
      { key: "density", label: "Density (g/L)", tipe: "angka", contoh: "720" },
      { key: "jumlah", label: "Jumlah masuk (kg)", tipe: "angka", wajib: true, contoh: "30" },
      { key: "harga", label: "Harga beli per kg", tipe: "rupiah", wajib: true, contoh: "95rb" },
      { key: "ongkir", label: "Total biaya kirim (freight)", tipe: "rupiah", contoh: "150rb", alias: ["freight"] },
      { key: "catatan", label: "Catatan bebas", tipe: "teks", contoh: "Panen Juli 2026" },
    ],
    catatan: "🧮 Otomatis: <b>HPP/kg</b> = harga + (ongkir ÷ jumlah), dan <b>Stok Tersisa</b> = jumlah masuk (berkurang otomatis setiap /roasting).",
  },
  roasting: {
    judul: "Log Roasting",
    fields: [
      { key: "batch", label: "Nomor batch (kosong = otomatis ROAST-YYYYMMDD-NN)", tipe: "teks", contoh: "ROAST-20261005-01" },
      { key: "green", label: "Kode green bean yang dipakai", tipe: "teks", wajib: true, contoh: "GB-ACEH-2401" },
      { key: "masuk", label: "Berat masuk / batch size (kg)", tipe: "angka", wajib: true, contoh: "1,2" },
      { key: "keluar", label: "Berat keluar / roasted (kg)", tipe: "angka", wajib: true, contoh: "1,02" },
      { key: "total", label: "Total roast time (menit:detik)", tipe: "durasi", wajib: true, contoh: "9:40" },
      { key: "operator", label: "Nama roaster/operator", tipe: "teks", contoh: "Irsyad" },
      { key: "mesin", label: "Kode mesin roaster", tipe: "teks", contoh: "R-01" },
      { key: "tanggal", label: "Tanggal roasting (kosong = hari ini)", tipe: "tanggal", contoh: "05/10/2026" },
      { key: "jam", label: "Jam roasting (kosong = sekarang)", tipe: "teks", contoh: "14:30" },
      { key: "kadar_air", label: "Kadar air green bean (%) — kosong = dari tab Bahan Baku", tipe: "angka", contoh: "11,5" },
      { key: "charge", label: "Charge temperature (°C)", tipe: "angka", contoh: "200" },
      { key: "tp_suhu", label: "Turning point (°C)", tipe: "angka", contoh: "95" },
      { key: "tp_waktu", label: "Turning point (menit:detik)", tipe: "durasi", contoh: "1:10" },
      { key: "dry_suhu", label: "Yellowing/dry end (°C)", tipe: "angka", contoh: "155" },
      { key: "dry_waktu", label: "Yellowing/dry end (menit:detik)", tipe: "durasi", contoh: "4:30" },
      { key: "fc_suhu", label: "First crack (°C)", tipe: "angka", contoh: "196" },
      { key: "fc_waktu", label: "First crack (menit:detik) — untuk hitung DTR", tipe: "durasi", contoh: "7:50" },
      { key: "drop", label: "Drop/end temperature (°C)", tipe: "angka", contoh: "210" },
      { key: "agtron", label: "Warna (Agtron)", tipe: "angka", contoh: "58" },
      { key: "level", label: "Light / Medium-Light / Medium / Dark", tipe: "teks", contoh: "Medium" },
      { key: "catatan", label: "Catatan", tipe: "teks", contoh: "Profil untuk drip bag" },
    ],
    catatan: "🧮 Otomatis: <b>Weight Loss</b> = (masuk − keluar) ÷ masuk × 100%, <b>Development Time</b> = total − first crack, <b>DTR</b> = development ÷ total × 100%, dan <b>stok green bean berkurang</b> sebesar berat masuk.",
  },
  resep: {
    judul: "Formulasi & Resep",
    fields: [
      { key: "kode", label: "Kode produk/resep", tipe: "teks", wajib: true, contoh: "ES-KOSUS-250ML" },
      { key: "nama", label: "Nama produk", tipe: "teks", wajib: true, contoh: "Es Kopi Susu Aren 250ml" },
      { key: "kopi", label: "Komposisi biji kopi (%)", tipe: "teks", contoh: "60% Gayo, 40% Robusta Temanggung" },
      { key: "tambahan", label: "Bahan tambahan (BOM)", tipe: "teks", contoh: "Susu UHT 150ml, Gula aren cair 20ml" },
      { key: "rasio", label: "Rasio ekstraksi/brewing", tipe: "teks", contoh: "1:10" },
      { key: "target", label: "Target Brix/TDS", tipe: "teks", contoh: "Brix 9 / TDS 1,4%" },
      { key: "simpan", label: "Masa simpan/shelf life", tipe: "teks", contoh: "7 hari chiller" },
      { key: "catatan", label: "Catatan", tipe: "teks", contoh: "Kocok sebelum diminum" },
    ],
    catatan: "✅ Bot mengecek total persentase komposisi kopi = 100%.",
  },
  qc: {
    judul: "Quality Control & Cupping (SCA)",
    fields: [
      { key: "batch", label: "Nomor batch terkait", tipe: "teks", wajib: true, contoh: "ROAST-20261005-01" },
      { key: "tanggal", label: "Tanggal cupping (kosong = hari ini)", tipe: "tanggal", contoh: "12/10/2026" },
      { key: "panelis", label: "Panelis/Q-Grader", tipe: "teks", contoh: "Irsyad" },
      { key: "aroma", label: "Fragrance/Aroma (6–10)", tipe: "angka", contoh: "7,75", alias: ["fragrance"] },
      { key: "flavor", label: "Flavor", tipe: "angka", contoh: "7,5" },
      { key: "aftertaste", label: "Aftertaste", tipe: "angka", contoh: "7,25" },
      { key: "acidity", label: "Acidity", tipe: "angka", contoh: "7,5" },
      { key: "body", label: "Body/Mouthfeel", tipe: "angka", contoh: "7,5" },
      { key: "balance", label: "Balance", tipe: "angka", contoh: "7,5" },
      { key: "uniformity", label: "Uniformity (maks 10)", tipe: "angka", contoh: "10" },
      { key: "cleancup", label: "Clean Cup (maks 10)", tipe: "angka", contoh: "10" },
      { key: "sweetness", label: "Sweetness (maks 10)", tipe: "angka", contoh: "10" },
      { key: "overall", label: "Overall", tipe: "angka", contoh: "7,5" },
      { key: "defect_poin", label: "Poin defect (pengurang)", tipe: "angka", contoh: "0" },
      { key: "defect", label: "Cacat rasa (Astringent, Baked, dll.)", tipe: "teks", contoh: "-" },
      { key: "status", label: "PASS / HOLD / REJECT (kosong = otomatis dari skor)", tipe: "teks", contoh: "PASS" },
      { key: "notes", label: "Tasting notes", tipe: "teks", contoh: "Caramel, citrus, clean aftertaste", alias: ["tasting"] },
    ],
    catatan: "🧮 Otomatis: <b>Total Score</b> = jumlah 10 atribut − poin defect. Status otomatis bila kosong: ≥80 PASS, 75–79,99 HOLD, &lt;75 REJECT.",
  },
  kemas: {
    judul: "Pengemasan & Produk Jadi",
    fields: [
      { key: "sku", label: "SKU produk jadi (samakan dengan Kode di tab Produk)", tipe: "teks", wajib: true, contoh: "SB" },
      { key: "output", label: "Jumlah pack dihasilkan", tipe: "angka", wajib: true, contoh: "40" },
      { key: "batch", label: "Nomor batch produksi/roasting", tipe: "teks", contoh: "ROAST-20261005-01" },
      { key: "format", label: "Biji utuh/Bubuk halus/Bubuk kasar/Botol", tipe: "teks", contoh: "Bubuk halus" },
      { key: "ukuran", label: "Ukuran kemasan", tipe: "teks", contoh: "10g x 10 sachet" },
      { key: "kemasan", label: "Kemasan yang dipakai", tipe: "teks", contoh: "Drip bag, pouch zipper, stiker" },
      { key: "tanggal", label: "Tanggal kemas (kosong = hari ini)", tipe: "tanggal", contoh: "06/10/2026" },
      { key: "best_before", label: "Best before (atau isi umur)", tipe: "tanggal", contoh: "06/04/2027" },
      { key: "umur", label: "Umur simpan (bulan) → best before otomatis", tipe: "angka", contoh: "6" },
      { key: "waste", label: "Kemasan rusak/waste (pcs)", tipe: "angka", contoh: "2" },
      { key: "catatan", label: "Catatan", tipe: "teks", contoh: "-" },
    ],
    catatan: "📦 Otomatis: kalau SKU sama dengan Kode di tab Produk, <b>stok produk bertambah</b> sebesar output.",
  },
  hpp: {
    judul: "Kalkulasi HPP & Harga Jual",
    fields: [
      { key: "sku", label: "SKU produk", tipe: "teks", wajib: true, contoh: "SB" },
      { key: "gram", label: "Gram kopi (roasted) per unit", tipe: "angka", wajib: true, contoh: "100" },
      { key: "roast", label: "Batch roasting → susut & HPP green otomatis", tipe: "teks", contoh: "ROAST-20261005-01" },
      { key: "green_kg", label: "HPP green bean per kg (kalau tanpa batch)", tipe: "rupiah", contoh: "100rb" },
      { key: "susut", label: "Susut roasting % (kalau tanpa batch)", tipe: "angka", contoh: "15" },
      { key: "biaya_kopi", label: "Biaya kopi per unit (isi langsung, opsional)", tipe: "rupiah", contoh: "12rb" },
      { key: "tambahan", label: "Bahan tambahan per unit", tipe: "rupiah", contoh: "0" },
      { key: "kemasan", label: "Kemasan per unit (pouch, label, valve, box)", tipe: "rupiah", contoh: "3500" },
      { key: "utilitas", label: "Gas/listrik/tenaga kerja per unit", tipe: "rupiah", contoh: "1500" },
      { key: "margin", label: "Target margin retail (%)", tipe: "angka", wajib: true, contoh: "40" },
      { key: "margin_grosir", label: "Margin grosir/B2B % (kosong = ½ margin)", tipe: "angka", contoh: "20" },
    ],
    catatan: "🧮 Otomatis: <b>Biaya kopi netto</b> = HPP green/kg ÷ (1 − susut) × gram ÷ 1000. <b>Harga jual</b> = HPP ÷ (1 − margin), dibulatkan ke atas per Rp500. HPP di tab Produk ikut diperbarui.",
  },
};

export const formTemplate = (nama: keyof typeof FORM) => template(`/${nama}`, FORM[nama].judul, FORM[nama].fields, FORM[nama].catatan);

const naik500 = (x: number) => Math.ceil(x / 500) * 500;

// ======================================================= HANDLER
type Konteks = { sh: Sheets; oleh: string };

export async function prosesForm(nama: keyof typeof FORM, body: string, ctx: Konteks): Promise<string> {
  const { tanggal: hariIni, jam } = sekarangWIB();
  const { nilai: v, error } = parseForm(body, FORM[nama].fields, +hariIni.slice(0, 4));
  if (error.length) return `⚠️ Ada yang perlu diperbaiki:\n• ${error.join("\n• ")}\n\nKetik <code>/${nama}</code> untuk melihat template.`;
  const { sh } = ctx;

  // ---------------------------------------------- BAHAN BAKU
  if (nama === "bahan") {
    const rows = await sh.bahan.getRows();
    if (rows.some((r) => s(r.get("Kode Batch")).toLowerCase() === s(v.kode).toLowerCase()))
      return `⚠️ Kode batch <b>${esc(s(v.kode))}</b> sudah ada. Pakai kode lain.`;
    const jumlah = Number(v.jumlah), harga = Number(v.harga), ongkir = Number(v.ongkir ?? 0);
    if (jumlah <= 0) return "⚠️ Jumlah masuk harus > 0 kg.";
    const hppKg = Math.round(harga + ongkir / jumlah);
    await sh.bahan.addRow({
      "Kode Batch": s(v.kode), "Tanggal Terima": s(v.tanggal) || hariIni, "Asal/Origin": s(v.asal), Region: s(v.region),
      "Ketinggian (MASL)": s(v.masl), Jenis: s(v.jenis), Varietas: s(v.varietas), Proses: s(v.proses), Pemasok: s(v.pemasok),
      "Kadar Air (%)": v.kadar_air ?? "", "Density (g/L)": v.density ?? "", "Jumlah Masuk (kg)": jumlah, "Harga Beli/kg": harga,
      "Biaya Kirim": ongkir, "HPP/kg": hppKg, "Stok Tersisa (kg)": jumlah, Catatan: s(v.catatan),
    }, { raw: true });
    return [
      "✅ <b>Bahan baku tercatat</b>",
      `🏷️ ${esc(s(v.kode))} — ${esc([v.asal, v.jenis, v.varietas, v.proses].filter(ada).join(" · ") || "-")}`,
      `⚖️ ${jumlah} kg × ${rupiah(harga)} + ongkir ${rupiah(ongkir)}`,
      `💰 HPP: <b>${rupiah(hppKg)}/kg</b> · Total ${rupiah(harga * jumlah + ongkir)}`,
      `📦 Stok tersisa: ${jumlah} kg`,
    ].join("\n");
  }

  // ---------------------------------------------- ROASTING
  if (nama === "roasting") {
    const masuk = Number(v.masuk), keluar = Number(v.keluar), total = Number(v.total);
    if (masuk <= 0 || keluar <= 0) return "⚠️ Berat masuk dan keluar harus > 0.";
    if (keluar >= masuk) return "⚠️ Berat keluar harus lebih kecil dari berat masuk (ada penyusutan saat roasting).";
    const bahanRows = await sh.bahan.getRows();
    const gb = bahanRows.find((r) => s(r.get("Kode Batch")).toLowerCase() === s(v.green).toLowerCase());
    if (!gb) return `⚠️ Green bean <b>${esc(s(v.green))}</b> tidak ada di tab Bahan Baku. Catat dulu dengan /bahan, atau cek /stokbahan.`;
    const stok = n(gb.get("Stok Tersisa (kg)"));
    if (stok < masuk) return `⚠️ Stok ${esc(s(v.green))} tinggal ${bulat(stok, 2)} kg, tidak cukup untuk ${masuk} kg.`;

    const tgl = s(v.tanggal) || hariIni;
    const rows = await sh.roasting.getRows();
    let batch = s(v.batch);
    if (!batch) {
      const prefix = `ROAST-${tgl.replace(/-/g, "")}-`;
      const ke = rows.filter((r) => s(r.get("Batch Roasting")).startsWith(prefix)).length + 1;
      batch = prefix + String(ke).padStart(2, "0");
    } else if (rows.some((r) => s(r.get("Batch Roasting")).toLowerCase() === batch.toLowerCase())) {
      return `⚠️ Batch <b>${esc(batch)}</b> sudah ada. Kosongkan baris batch supaya dibuat otomatis.`;
    }
    const susut = ((masuk - keluar) / masuk) * 100;
    const fc = v.fc_waktu as number | undefined;
    const dev = fc !== undefined ? total - fc : null;
    const dtr = dev !== null && total > 0 ? (dev / total) * 100 : null;
    const kadar = v.kadar_air ?? (desimal(gb.get("Kadar Air (%)")) ?? "");
    const dur = (x: unknown) => (typeof x === "number" ? detikKeTeks(x) : "");

    await sh.roasting.addRow({
      "Batch Roasting": batch, Tanggal: tgl, Waktu: s(v.jam) || jam, Operator: s(v.operator), Mesin: s(v.mesin),
      "Kode Green Bean": s(gb.get("Kode Batch")), "Berat Masuk (kg)": masuk, "Kadar Air (%)": kadar,
      "Charge (°C)": v.charge ?? "", "Turning Point (°C)": v.tp_suhu ?? "", "Turning Point (mnt)": dur(v.tp_waktu),
      "Dry End (°C)": v.dry_suhu ?? "", "Dry End (mnt)": dur(v.dry_waktu), "First Crack (°C)": v.fc_suhu ?? "",
      "First Crack (mnt)": dur(fc), "Drop (°C)": v.drop ?? "", "Total Waktu": dur(total),
      "Development Time": dev !== null ? dur(dev) : "", "DTR (%)": dtr !== null ? bulat(dtr) : "", "Berat Keluar (kg)": keluar,
      "Weight Loss (%)": bulat(susut), Agtron: v.agtron ?? "", "Tingkat Roast": s(v.level), Catatan: s(v.catatan),
    }, { raw: true });
    gb.set("Stok Tersisa (kg)", bulat(stok - masuk, 3));
    await gb.save({ raw: true });

    const peringatanSusut = susut < 11 || susut > 20 ? ` ⚠️ (umumnya 12–18%)` : "";
    const peringatanDtr = dtr !== null && (dtr < 15 || dtr > 28) ? ` ⚠️ (umumnya 18–25%)` : "";
    return [
      `🔥 <b>Roasting tercatat: ${esc(batch)}</b>`,
      `🌱 ${esc(s(gb.get("Kode Batch")))} · ${masuk} kg → ${keluar} kg`,
      `📉 Weight loss: <b>${bulat(susut)}%</b>${peringatanSusut}`,
      `⏱️ Total ${dur(total)}${dev !== null ? ` · Development ${dur(dev)} · DTR <b>${bulat(dtr!)}%</b>${peringatanDtr}` : " · (isi fc_waktu untuk DTR)"}`,
      v.level ? `🎨 ${esc(s(v.level))}${v.agtron ? ` · Agtron ${v.agtron}` : ""}` : "",
      `📦 Stok green ${esc(s(gb.get("Kode Batch")))}: ${bulat(stok, 2)} → <b>${bulat(stok - masuk, 2)} kg</b>`,
    ].filter(Boolean).join("\n");
  }

  // ---------------------------------------------- RESEP
  if (nama === "resep") {
    const rows = await sh.resep.getRows();
    if (rows.some((r) => s(r.get("Kode Resep")).toLowerCase() === s(v.kode).toLowerCase()))
      return `⚠️ Kode resep <b>${esc(s(v.kode))}</b> sudah ada.`;
    let cek = "";
    const persen = [...s(v.kopi).matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map((m) => desimal(m[1]) ?? 0);
    if (persen.length) {
      const jml = bulat(persen.reduce((a, b) => a + b, 0));
      cek = jml === 100 ? "✅ Komposisi kopi = 100%" : `⚠️ Total komposisi kopi ${jml}% (seharusnya 100%)`;
    }
    await sh.resep.addRow({
      "Kode Resep": s(v.kode), "Nama Produk": s(v.nama), "Komposisi Kopi": s(v.kopi), "Bahan Tambahan": s(v.tambahan),
      "Rasio Ekstraksi": s(v.rasio), "Target Brix/TDS": s(v.target), "Masa Simpan": s(v.simpan), Catatan: s(v.catatan),
    }, { raw: true });
    return [
      `🧪 <b>Resep tercatat: ${esc(s(v.kode))}</b>`,
      `☕ ${esc(s(v.nama))}`,
      v.kopi ? `🫘 ${esc(s(v.kopi))}` : "",
      v.tambahan ? `➕ ${esc(s(v.tambahan))}` : "",
      v.rasio ? `⚗️ Rasio ${esc(s(v.rasio))}` : "",
      v.simpan ? `🗓️ ${esc(s(v.simpan))}` : "",
      cek,
    ].filter(Boolean).join("\n");
  }

  // ---------------------------------------------- QC
  if (nama === "qc") {
    const atribut = ["aroma", "flavor", "aftertaste", "acidity", "body", "balance", "uniformity", "cleancup", "sweetness", "overall"];
    const diisi = atribut.filter((a) => v[a] !== undefined);
    const lebih = diisi.filter((a) => Number(v[a]) < 0 || Number(v[a]) > 10);
    if (lebih.length) return `⚠️ Skor harus 0–10: ${lebih.join(", ")}`;
    const poin = Number(v.defect_poin ?? 0);
    const totalSkor = bulat(diisi.reduce((a, k) => a + Number(v[k]), 0) - poin, 2);
    let status = s(v.status).toUpperCase();
    if (status && !["PASS", "HOLD", "REJECT"].includes(status)) return "⚠️ Status harus PASS, HOLD, atau REJECT.";
    if (!status && diisi.length === 10) status = totalSkor >= 80 ? "PASS" : totalSkor >= 75 ? "HOLD" : "REJECT";
    await sh.qc.addRow({
      Tanggal: s(v.tanggal) || hariIni, Batch: s(v.batch), Panelis: s(v.panelis),
      "Fragrance/Aroma": v.aroma ?? "", Flavor: v.flavor ?? "", Aftertaste: v.aftertaste ?? "", Acidity: v.acidity ?? "",
      Body: v.body ?? "", Balance: v.balance ?? "", Uniformity: v.uniformity ?? "", "Clean Cup": v.cleancup ?? "",
      Sweetness: v.sweetness ?? "", Overall: v.overall ?? "", "Poin Defect": poin, "Total Score": diisi.length ? totalSkor : "",
      Defect: s(v.defect), Status: status, "Tasting Notes": s(v.notes),
    }, { raw: true });
    const ikon = status === "PASS" ? "🟢" : status === "HOLD" ? "🟡" : status === "REJECT" ? "🔴" : "⚪";
    return [
      `🧪 <b>QC tercatat: ${esc(s(v.batch))}</b>`,
      diisi.length ? `⭐ Total score: <b>${totalSkor}</b>${diisi.length < 10 ? ` (baru ${diisi.length}/10 atribut)` : ""}` : "⭐ Skor belum diisi",
      `${ikon} Status: <b>${status || "-"}</b>`,
      v.notes ? `👅 ${esc(s(v.notes))}` : "",
      v.defect && s(v.defect) !== "-" ? `⚠️ Defect: ${esc(s(v.defect))}` : "",
    ].filter(Boolean).join("\n");
  }

  // ---------------------------------------------- PENGEMASAN
  if (nama === "kemas") {
    const output = Math.round(Number(v.output));
    if (output <= 0) return "⚠️ Output harus > 0 pack.";
    const tgl = s(v.tanggal) || hariIni;
    const bb = s(v.best_before) || (v.umur ? tambahBulan(tgl, Number(v.umur)) : "");
    await sh.kemas.addRow({
      SKU: s(v.sku), "Batch Produksi": s(v.batch), Format: s(v.format), Ukuran: s(v.ukuran), Kemasan: s(v.kemasan),
      "Tanggal Kemas": tgl, "Best Before": bb, "Jumlah Output": output, Waste: v.waste ?? 0, Catatan: s(v.catatan),
    }, { raw: true });
    const produk = (await bacaProduk(sh.produk)).find((p) => p.kode.toLowerCase() === s(v.sku).toLowerCase());
    let info = `ℹ️ SKU ${esc(s(v.sku))} belum ada di tab Produk — stok jual tidak diubah. Tambahkan dengan /tambahproduk.`;
    if (produk) {
      produk.row.set("Stok", produk.stok + output);
      await produk.row.save({ raw: true });
      info = `📦 Stok <b>${esc(produk.nama)}</b>: ${produk.stok} → <b>${produk.stok + output}</b>`;
    }
    const waste = Number(v.waste ?? 0);
    return [
      `📦 <b>Pengemasan tercatat: ${esc(s(v.sku))}</b>`,
      `✅ Output ${output} pack${waste ? ` · Waste ${waste} (${bulat((waste / (output + waste)) * 100)}%)` : ""}`,
      v.batch ? `🔥 Batch ${esc(s(v.batch))}` : "",
      bb ? `🗓️ Kemas ${tgl} · Best before <b>${bb}</b>` : "",
      info,
    ].filter(Boolean).join("\n");
  }

  // ---------------------------------------------- HPP
  const gram = Number(v.gram);
  let greenKg = v.green_kg !== undefined ? Number(v.green_kg) : null;
  let susut = v.susut !== undefined ? Number(v.susut) : null;
  let sumber = "";
  if (v.roast) {
    const r = (await sh.roasting.getRows()).find((x) => s(x.get("Batch Roasting")).toLowerCase() === s(v.roast).toLowerCase());
    if (!r) return `⚠️ Batch roasting <b>${esc(s(v.roast))}</b> tidak ditemukan.`;
    susut = susut ?? n(r.get("Weight Loss (%)"));
    const gb = (await sh.bahan.getRows()).find((x) => s(x.get("Kode Batch")) === s(r.get("Kode Green Bean")));
    if (greenKg === null && gb) greenKg = n(gb.get("HPP/kg"));
    sumber = ` (dari ${esc(s(v.roast))})`;
  }
  let biayaKopi: number;
  if (v.biaya_kopi !== undefined) biayaKopi = Number(v.biaya_kopi);
  else {
    if (greenKg === null || susut === null) return "⚠️ Isi <b>roast</b> (batch roasting), ATAU <b>green_kg</b> + <b>susut</b>, ATAU <b>biaya_kopi</b>.";
    if (susut >= 100) return "⚠️ Susut harus di bawah 100%.";
    biayaKopi = (greenKg / (1 - susut / 100)) * (gram / 1000);
  }
  const tambahan = Number(v.tambahan ?? 0), kemasan = Number(v.kemasan ?? 0), utilitas = Number(v.utilitas ?? 0);
  const totalHpp = Math.round(biayaKopi + tambahan + kemasan + utilitas);
  const margin = Number(v.margin), marginG = v.margin_grosir !== undefined ? Number(v.margin_grosir) : margin / 2;
  if (margin >= 100 || marginG >= 100) return "⚠️ Margin harus di bawah 100%.";
  const retail = naik500(totalHpp / (1 - margin / 100));
  const grosir = naik500(totalHpp / (1 - marginG / 100));

  await sh.hpp.addRow({
    Tanggal: hariIni, SKU: s(v.sku), "Gram/Unit": gram, "Batch Roasting": s(v.roast), "HPP Green/kg": greenKg ?? "",
    "Susut (%)": susut ?? "", "Biaya Kopi Netto": Math.round(biayaKopi), "Biaya Tambahan": tambahan, "Biaya Kemasan": kemasan,
    "Biaya Utilitas": utilitas, "Total HPP/Unit": totalHpp, "Margin (%)": margin, "Harga Retail": retail,
    "Margin Grosir (%)": marginG, "Harga Grosir": grosir,
  }, { raw: true });

  const produk = (await bacaProduk(sh.produk)).find((p) => p.kode.toLowerCase() === s(v.sku).toLowerCase());
  let info = "";
  if (produk) {
    produk.row.set("HPP", totalHpp);
    await produk.row.save({ raw: true });
    info = `🔄 HPP <b>${esc(produk.nama)}</b> di tab Produk diperbarui: ${rupiah(produk.hpp)} → ${rupiah(totalHpp)}\n💡 Harga jual sekarang ${rupiah(produk.harga)} → margin aktual ${produk.harga ? bulat(((produk.harga - totalHpp) / produk.harga) * 100) : 0}%`;
  }
  return [
    `🧮 <b>HPP ${esc(s(v.sku))}</b> (${gram} g/unit)`,
    greenKg !== null && susut !== null && v.biaya_kopi === undefined ? `🌱 Green ${rupiah(greenKg)}/kg · susut ${bulat(susut)}%${sumber}` : "",
    `☕ Kopi netto: ${rupiah(biayaKopi)}`,
    `➕ Tambahan ${rupiah(tambahan)} · 📦 Kemasan ${rupiah(kemasan)} · ⚡ Utilitas ${rupiah(utilitas)}`,
    `💰 <b>Total HPP: ${rupiah(totalHpp)}/unit</b>`,
    "",
    `🏷️ Harga retail (margin ${margin}%): <b>${rupiah(retail)}</b>`,
    `🏬 Harga grosir (margin ${bulat(marginG)}%): <b>${rupiah(grosir)}</b>`,
    info ? `\n${info}` : "",
  ].filter((x) => x !== "").join("\n");
}

// ======================================================= STOK BAHAN
export async function stokBahan(sh: Sheets) {
  const rows = await sh.bahan.getRows();
  if (!rows.length) return "Belum ada bahan baku. Catat dengan /bahan.";
  const baris = rows.map((r) => {
    const stok = n(r.get("Stok Tersisa (kg)"));
    const ikon = stok <= 0 ? "⛔" : stok < 5 ? "⚠️" : "✅";
    return `${ikon} <code>${esc(s(r.get("Kode Batch")))}</code> ${esc(s(r.get("Asal/Origin")))} ${esc(s(r.get("Proses")))}: <b>${bulat(stok, 2)} kg</b> · ${rupiah(n(r.get("HPP/kg")))}/kg`;
  });
  const total = rows.reduce((a, r) => a + n(r.get("Stok Tersisa (kg)")), 0);
  return `🌱 <b>Stok Bahan Baku</b>\n${baris.join("\n")}\n\nTotal: <b>${bulat(total, 2)} kg</b>`;
}

// ======================================================= LIHAT DATA
const RINGKAS: Record<Exclude<NamaTab, "produk">, (r: Row) => string> = {
  penjualan: (r) => `${s(r.get("Tanggal"))} · ${esc(s(r.get("Produk")))} ×${s(r.get("Qty"))} · ${rupiah(n(r.get("Total")))} · ${esc(s(r.get("Channel")))}`,
  bahan: (r) => `<code>${esc(s(r.get("Kode Batch")))}</code> ${esc(s(r.get("Asal/Origin")))} · ${s(r.get("Jumlah Masuk (kg)"))} kg · sisa ${s(r.get("Stok Tersisa (kg)"))} kg`,
  roasting: (r) => `<code>${esc(s(r.get("Batch Roasting")))}</code> ${esc(s(r.get("Kode Green Bean")))} · ${s(r.get("Berat Masuk (kg)"))}→${s(r.get("Berat Keluar (kg)"))} kg · WL ${s(r.get("Weight Loss (%)"))}% · DTR ${s(r.get("DTR (%)")) || "-"}%`,
  resep: (r) => `<code>${esc(s(r.get("Kode Resep")))}</code> ${esc(s(r.get("Nama Produk")))} · ${esc(s(r.get("Komposisi Kopi")))}`,
  qc: (r) => `${s(r.get("Tanggal"))} · ${esc(s(r.get("Batch")))} · skor ${s(r.get("Total Score")) || "-"} · ${s(r.get("Status")) || "-"}`,
  kemas: (r) => `${s(r.get("Tanggal Kemas"))} · ${esc(s(r.get("SKU")))} ×${s(r.get("Jumlah Output"))} · BB ${s(r.get("Best Before")) || "-"}`,
  hpp: (r) => `${s(r.get("Tanggal"))} · ${esc(s(r.get("SKU")))} · HPP ${rupiah(n(r.get("Total HPP/Unit")))} · retail ${rupiah(n(r.get("Harga Retail")))}`,
};
export const NAMA_LIHAT: Record<string, Exclude<NamaTab, "produk">> = {
  penjualan: "penjualan", jual: "penjualan", bahan: "bahan", roasting: "roasting", roast: "roasting",
  resep: "resep", qc: "qc", kemas: "kemas", pengemasan: "kemas", hpp: "hpp",
};

export async function lihat(sh: Sheets, args: string) {
  const [namaRaw, jml] = args.toLowerCase().split(/\s+/);
  const tab = NAMA_LIHAT[namaRaw ?? ""];
  if (!tab) return "Format: <code>/lihat bahan|roasting|resep|qc|kemas|hpp|penjualan [jumlah]</code>\nContoh: <code>/lihat roasting 5</code>";
  const max = Math.min(Math.max(Number(jml) || 5, 1), 20);
  const rows = await sh[tab].getRows();
  if (!rows.length) return `Belum ada data di tab <b>${tab}</b>.`;
  const akhir = rows.slice(-max).reverse();
  return `📋 <b>${max} data terakhir: ${tab}</b> (total ${rows.length})\n${akhir.map((r) => `• ${RINGKAS[tab](r as Row)}`).join("\n")}`;
}

// ======================================================= BATAL INPUT
export async function batalInput(sh: Sheets, args: string) {
  const tab = NAMA_LIHAT[args.trim().toLowerCase()];
  if (!tab || tab === "penjualan") return "Format: <code>/batalinput bahan|roasting|resep|qc|kemas|hpp</code>\n(Untuk penjualan pakai /batal)";
  const rows = await sh[tab].getRows();
  const r = rows[rows.length - 1];
  if (!r) return `Tidak ada data di tab ${tab}.`;
  let efek = "";
  if (tab === "roasting") {
    const gb = (await sh.bahan.getRows()).find((x) => s(x.get("Kode Batch")) === s(r.get("Kode Green Bean")));
    if (gb) {
      const baru = bulat(n(gb.get("Stok Tersisa (kg)")) + n(r.get("Berat Masuk (kg)")), 3);
      gb.set("Stok Tersisa (kg)", baru);
      await gb.save({ raw: true });
      efek = `\n↩️ Stok green ${esc(s(gb.get("Kode Batch")))} dikembalikan → ${baru} kg`;
    }
  }
  if (tab === "kemas") {
    const p = (await bacaProduk(sh.produk)).find((x) => x.kode.toLowerCase() === s(r.get("SKU")).toLowerCase());
    if (p) {
      const baru = p.stok - n(r.get("Jumlah Output"));
      p.row.set("Stok", baru);
      await p.row.save({ raw: true });
      efek = `\n↩️ Stok ${esc(p.nama)} dikembalikan → ${baru}`;
    }
  }
  const ringkas = RINGKAS[tab](r as Row);
  await r.delete();
  return `🗑️ Data terakhir di tab <b>${tab}</b> dihapus:\n${ringkas}${efek}`;
}

export { durasiKeDetik };
