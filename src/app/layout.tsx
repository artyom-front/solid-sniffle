import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "SCORESBOX — футбол Чувашии онлайн: турниры, статистика, результаты",
    template: "%s · SCORESBOX",
  },
  description:
    "SCORESBOX — спортивно-аналитический портал футбола Чувашии: livescore матчей 11×11, 8×8, 6×6 и мини-футбола, турнирные таблицы, статистика игроков и судей, дисквалификации, календарь турниров.",
  keywords: ["футбол", "Чувашия", "результаты матчей", "livescore", "турнирная таблица", "мини-футбол", "статистика", "дисквалификации", "scoresbox"],
  applicationName: "SCORESBOX",
  alternates: { canonical: "/" },
  openGraph: {
    title: "SCORESBOX — футбол Чувашии онлайн",
    description: "Все турниры Чувашии в реальном времени: матчи, таблицы, бомбардиры, судьи",
    siteName: "SCORESBOX",
    locale: "ru_RU",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SCORESBOX — футбол Чувашии онлайн",
    description: "Все турниры Чувашии в реальном времени: матчи, таблицы, бомбардиры, судьи",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0D13",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
