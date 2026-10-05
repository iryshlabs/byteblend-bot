// Mesin "formulir lewat chat": admin mengirim baris-baris "kunci: nilai".
import { desimal, durasiKeDetik, detikKeTeks, nominal, parseTanggal } from "./logika";

export type Tipe = "teks" | "angka" | "rupiah" | "tanggal" | "durasi";
export type Field = {
  key: string; // kunci yang diketik admin
  label: string; // penjelasan singkat
  tipe: Tipe;
  wajib?: boolean;
  contoh: string;
  alias?: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function parseForm(body: string, fields: Field[], tahunIni: number) {
  const nilai: Record<string, string | number> = {};
  const error: string[] = [];
  const peta = new Map<string, Field>();
  for (const f of fields) {
    peta.set(norm(f.key), f);
    for (const a of f.alias ?? []) peta.set(norm(a), f);
  }

  for (const baris of body.split("\n")) {
    const b = baris.trim();
    if (!b) continue;
    const i = b.search(/[:=]/);
    if (i < 1) {
      error.push(`Baris "${b}" tidak memakai format <code>kunci: nilai</code>`);
      continue;
    }
    const k = norm(b.slice(0, i));
    const v = b.slice(i + 1).trim();
    const f = peta.get(k);
    if (!f) {
      error.push(`Kunci "${b.slice(0, i).trim()}" tidak dikenal`);
      continue;
    }
    if (!v) continue;
    if (f.tipe === "teks") nilai[f.key] = v;
    else if (f.tipe === "angka") {
      const n = desimal(v);
      if (n === null) error.push(`${f.key}: "${v}" bukan angka`);
      else nilai[f.key] = n;
    } else if (f.tipe === "rupiah") {
      const n = nominal(v);
      if (n === null) error.push(`${f.key}: "${v}" bukan nominal rupiah (contoh 95rb / 95000)`);
      else nilai[f.key] = n;
    } else if (f.tipe === "tanggal") {
      const t = parseTanggal(v, tahunIni);
      if (!t) error.push(`${f.key}: "${v}" bukan tanggal (contoh 05/10/2026)`);
      else nilai[f.key] = t;
    } else if (f.tipe === "durasi") {
      const d = durasiKeDetik(v);
      if (d === null) error.push(`${f.key}: "${v}" bukan durasi (contoh 9:30 = 9 menit 30 detik)`);
      else nilai[f.key] = d;
    }
  }
  for (const f of fields) if (f.wajib && nilai[f.key] === undefined) error.push(`<b>${f.key}</b> wajib diisi (${f.label})`);
  return { nilai, error };
}

/** Template siap salin. Field wajib ditandai ⭐ di keterangan. */
export function template(perintah: string, judul: string, fields: Field[], catatan?: string) {
  const isi = [perintah, ...fields.map((f) => `${f.key}: ${f.contoh}`)].join("\n");
  const ket = fields.map((f) => `${f.wajib ? "⭐" : "▫️"} <code>${f.key}</code> — ${f.label}`).join("\n");
  return [
    `📝 <b>${judul}</b>`,
    "Salin template ini, ganti nilainya, lalu kirim. Baris opsional (▫️) boleh dihapus.",
    `<pre>${isi}</pre>`,
    ket,
    catatan ?? "",
  ].filter(Boolean).join("\n\n");
}

export const fmtDurasi = (v: unknown) => (typeof v === "number" ? detikKeTeks(v) : "");
