import type { Metadata } from "next";
import { dir } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Image Editor",
};

const lang = process.env.NEXT_PUBLIC_LANG === "en" ? "en" : "he";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang={lang} dir={dir}>
      <body className="m-0 p-0 bg-gray-100">{children}</body>
    </html>
  );
}
