// Helper kecil untuk memanggil Telegram Bot API langsung (tanpa library tambahan).
const API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;

export async function tg(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${API()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) console.error(`Telegram ${method} gagal:`, data);
  return data;
}

export function kirim(chatId: number, text: string) {
  // parse_mode HTML: <b>tebal</b>, <i>miring</i>, <code>kode</code>
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
}

// Hindari karakter yang merusak format HTML Telegram
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const DAFTAR_PERINTAH = [
  { command: "jual", description: "Catat penjualan: /jual 3 SB shopee" },
  { command: "produk", description: "Daftar produk, harga & stok" },
  { command: "stok", description: "Cek stok semua produk" },
  { command: "restok", description: "Tambah stok: /restok 20 SB" },
  { command: "rekap", description: "Rekap: /rekap hari | minggu | bulan" },
  { command: "batal", description: "Hapus penjualan terakhir" },
  { command: "help", description: "Bantuan" },
];
