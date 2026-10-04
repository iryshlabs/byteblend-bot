import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { angka, type Penjualan, type Produk } from "./logika";

export const HEADER_PRODUK = ["Kode", "Nama", "Harga", "HPP", "Stok"];
export const HEADER_PENJUALAN = [
  "ID", "Waktu", "Tanggal", "Kode", "Produk", "Qty", "Harga Satuan", "Total", "HPP Total", "Laba", "Channel", "Dicatat Oleh",
];

// Contoh produk awal — silakan ubah langsung di Google Sheets (tab "Produk").
const PRODUK_AWAL = [
  { Kode: "SB", Nama: "Spesial Blend Drip Bag", Harga: 25000, HPP: 12000, Stok: 50 },
];

function auth() {
  // Isi env GOOGLE_SERVICE_ACCOUNT_JSON dengan SELURUH isi file service_account.json
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
  return new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function ambilSheet(doc: GoogleSpreadsheet, judul: string, header: string[]) {
  let s: GoogleSpreadsheetWorksheet | undefined = doc.sheetsByTitle[judul];
  if (!s) {
    s = await doc.addSheet({ title: judul, headerValues: header });
    if (judul === "Produk") await s.addRows(PRODUK_AWAL, { raw: true });
  }
  return s;
}

/** Buka spreadsheet & pastikan tab "Produk" dan "Penjualan" ada. */
export async function bukaSheets() {
  const doc = new GoogleSpreadsheet(process.env.SHEET_ID!, auth());
  await doc.loadInfo();
  const produk = await ambilSheet(doc, "Produk", HEADER_PRODUK);
  const penjualan = await ambilSheet(doc, "Penjualan", HEADER_PENJUALAN);
  return { produk, penjualan };
}

export async function bacaProduk(sheet: GoogleSpreadsheetWorksheet) {
  const rows = await sheet.getRows();
  const daftar: (Produk & { row: (typeof rows)[number] })[] = rows
    .filter((r) => String(r.get("Kode") ?? "").trim() && String(r.get("Nama") ?? "").trim())
    .map((r) => ({
      kode: String(r.get("Kode")).trim(),
      nama: String(r.get("Nama")).trim(),
      harga: angka(r.get("Harga")),
      hpp: angka(r.get("HPP")),
      stok: angka(r.get("Stok")),
      row: r,
    }));
  return daftar;
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
