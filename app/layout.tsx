import type { Metadata } from "next";
import { IBM_Plex_Mono, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const sans = Noto_Sans_KR({
  variable: "--font-noto",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-ibm",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "OMR 설문 집계",
  description: "종이 설문지 OMR 자동 인식 및 집계 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
