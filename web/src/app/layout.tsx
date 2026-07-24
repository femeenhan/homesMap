import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RegisterSW } from "./RegisterSW";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "그거거기",
  description: "그거 어딨지? 우리 집 물건 지도",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png", // iOS 홈 화면 아이콘 — 이게 없으면 스크린샷/구 아이콘이 잡힘
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
