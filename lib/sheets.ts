import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { angka, type Penjualan, type Produk } from "./logika";

// Semua tab di Google Sheets beserta judul kolomnya.
export const TAB = {
  produk: { judul: "Produk", header: ["Kode", "Nama", "Harga", "HPP", "Stok"] },
  penjualan: {
    judul: "Penjualan",
    header: ["ID", "Waktu", "Tanggal", "Kode", "Produk", "Qty", "Harga Satuan", "Total", "HPP Total", "Laba", "Channel", "Dicatat Oleh"],
  },
  bahan: {
    judul: "Bahan Baku",
    header: [
      "Kode Batch", "Tanggal Terima", "Asal/Origin", "Region", "Ketinggian (MASL)", "Jenis", "Varietas", "Proses",
      "Pemasok", "Kadar Air (%)", "Density (g/L)", "Jumlah Masuk (kg)", "Harga Beli/kg", "Biaya Kirim", "HPP/kg",
      "Stok Tersisa (kg)", "Catatan",
    ],
  },
  roasting: {
    judul: "Roasting",
    header: [
      "Batch Roasting", "Tanggal", "Waktu", "Operator", "Mesin", "Kode Green Bean", "Berat Masuk (kg)", "Kadar Air (%)",
      "Charge (°C)", "Turning Point (°C)", "Turning Point (mnt)", "Dry End (°C)", "Dry End (mnt)", "First Crack (°C)",
      "First Crack (mnt)", "Drop (°C)", "Total Waktu", "Development Time", "DTR (%)", "Berat Keluar (kg)",
      "Weight Loss (%)", "Agtron", "Tingkat Roast", "Catatan",
    ],
  },
  resep: {
    judul: "Resep",
    header: ["Kode Resep", "Nama Produk", "Komposisi Kopi", "Bahan Tambahan", "Rasio Ekstraksi", "Target Brix/TDS", "Masa Simpan", "Catatan"],
  },
  qc: {
    judul: "QC",
    header: [
      "Tanggal", "Batch", "Panelis", "Fragrance/Aroma", "Flavor", "Aftertaste", "Acidity", "Body", "Balance",
      "Uniformity", "Clean Cup", "Sweetness", "Overall", "Poin Defect", "Total Score", "Defect", "Status", "Tasting Notes",
    ],
  },
  kemas: {
    judul: "Pengemasan",
    header: ["SKU", "Batch Produksi", "Format", "Ukuran", "Kemasan", "Tanggal Kemas", "Best Before", "Jumlah Output", "Waste", "Catatan"],
  },
  hpp: {
    judul: "HPP",
    header: [
      "Tanggal", "SKU", "Gram/Unit", "Batch Roasting", "HPP Green/kg", "Susut (%)", "Biaya Kopi Netto", "Biaya Tambahan",
      "Biaya Kemasan", "Biaya Utilitas", "Total HPP/Unit", "Margin (%)", "Harga Retail", "Margin Grosir (%)", "Harga Grosir",
    ],
  },
} as const;

export type NamaTab = keyof typeof TAB;
export type Sheets = Record<NamaTab, GoogleSpreadsheetWorksheet>;

// Contoh produk awal — silakan ubah langsung di Google Sheets (tab "Produk").
const PRODUK_AWAL = [{ Kode: "SB", Nama: "Spesial Blend Drip Bag", Harga: 25000, HPP: 12000, Stok: 50 }];

function auth() {
  // Isi env GOOGLE_SERVICE_ACCOUNT_JSON dengan SELURUH isi file service_account.json
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
  return new JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
}

/** Buka spreadsheet & pastikan semua tab ada (dibuat otomatis kalau belum). */
export async function bukaSheets(): Promise<Sheets> {
  const doc = new GoogleSpreadsheet(process.env.SHEET_ID!, auth());
  await doc.loadInfo();
  const hasil = {} as Sheets;
  for (const [nama, t] of Object.entries(TAB) as [NamaTab, (typeof TAB)[NamaTab]][]) {
    let s = doc.sheetsByTitle[t.judul];
    if (!s) {
      s = await doc.addSheet({ title: t.judul, headerValues: [...t.header] });
      if (nama === "produk") await s.addRows(PRODUK_AWAL, { raw: true });
    }
    hasil[nama] = s;
  }
  return hasil;
}

export async function bacaProduk(sheet: GoogleSpreadsheetWorksheet) {
  const rows = await sheet.getRows();
  return rows
    .filter((r) => String(r.get("Kode") ?? "").trim() && String(r.get("Nama") ?? "").trim())
    .map((r) => ({
      kode: String(r.get("Kode")).trim(),
      nama: String(r.get("Nama")).trim(),
      harga: angka(r.get("Harga")),
      hpp: angka(r.get("HPP")),
      stok: angka(r.get("Stok")),
      row: r,
    })) satisfies (Produk & { row: unknown })[];
}

export async function bacaPenjualan(sheet: GoogleSpreadsheetWorksheet): Promise<Penjualan[]> {
  const rows = await sheet.getRows();
  return rows.map((r) => ({
    tanggal: String(r.get("Tanggal") ?? "").slice(0, 10),
    kode: String(r.get("Kode") ?? ""),
    produk: String(r.get("Produk") ?? ""),
    qty: angka(r.get("Qty")),
    total: angka(r.get("Total")),
    laba: angka(r.get("Laba")),
    channel: String(r.get("Channel") ?? "-") || "-",
  }));
}
