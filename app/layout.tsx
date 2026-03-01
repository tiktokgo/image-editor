import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Image Editor",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he">
      <body className="m-0 p-0 bg-gray-100">{children}</body>
    </html>
  );
}
