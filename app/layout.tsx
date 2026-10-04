import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Byte & Blend — Bot Penjualan",
  description: "Bot Telegram pencatat penjualan kopi Byte & Blend, terhubung ke Google Sheets.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
