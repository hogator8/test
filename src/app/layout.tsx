import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "オンラインテストシステム",
  description: "日本語学校向けオンラインテストシステム",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" translate="no">
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body>{children}</body>
    </html>
  );
}
