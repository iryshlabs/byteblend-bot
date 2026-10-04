import { tg, DAFTAR_PERINTAH } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * Daftarkan webhook ke Telegram. Cukup dibuka SEKALI setelah deploy:
 *   https://DOMAIN-KAMU/api/setup?key=ISI_SETUP_KEY
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.SETUP_KEY || url.searchParams.get("key") !== process.env.SETUP_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }
  const webhook = `${url.origin}/api/telegram`;
  const hasil = await tg("setWebhook", {
    url: webhook,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  const menu = await tg("setMyCommands", { commands: DAFTAR_PERINTAH });
  const info = await tg("getWebhookInfo", {});
  return Response.json({ webhook, setWebhook: hasil, setMyCommands: menu, info: info.result });
}
