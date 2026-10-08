import type { Metadata, Viewport } from "next";
// ШРИФТЫ (v1.0.37): Geist был загружен ТОЛЬКО с subsets:["latin"] — вся
// кириллица сайта рендерилась системным фолбэком (отсюда «зажирные»
// фамилии и разнобой начертаний). Onest — гротеск с полной кириллицей
// (100–900, включая Light 300 и Black 900 для вордрмарка scores·box);
// Geist_Mono остаётся для цифр счёта/минут (латинский набор покрывает).
import { Onest, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { getBranding } from "@/lib/services/branding";
import { DEFAULT_ICON_URL, DEFAULT_APPLE_ICON_URL } from "@/lib/branding";

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.SITE_URL || "http://localhost:3000";

// v1.0.48: generateMetadata вместо статического export — ИКОНКИ ВКЛАДКИ
// БРАУЗЕРА теперь управляются из админки («Сайт → Брендинг»): пока админ
// не загрузил свой фавикон, <link rel=icon> указывает на встроенный
// знак-поле; file-conventions app/icon.svg и app/apple-icon.png УДАЛЕНЫ
// (иначе конкурировали бы с metadata.icons) — одна точка правды.
// Кастомный фавикон = /api/media/<id>, смена применяется через
// revalidatePath (вызывает /api/admin/brand) — ISR-страницы не ждём 60 с.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBranding();
  const icons: Metadata["icons"] = brand.iconUrl
    ? { icon: [{ url: brand.iconUrl }], apple: [{ url: brand.iconUrl }] }
    : {
        icon: [{ url: DEFAULT_ICON_URL, type: "image/svg+xml" }],
        apple: [{ url: DEFAULT_APPLE_ICON_URL, sizes: "240x240" }],
      };
  return {
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
  icons,
  openGraph: {
    title: "SCORESBOX — футбол Чувашии онлайн",
    description: "Все турниры Чувашии в реальном времени: матчи, таблицы, бомбардиры, судьи",
    siteName: "SCORESBOX",
    locale: "ru_RU",
    type: "website",
    // v1.0.47: соцсети показывают карточку с лого (SEO-аудит 2026-10-06:
    // twitter card был summary_large_image БЕЗ картинки). 1200×630,
    // генерируется scripts/make-brand-assets.mjs из канонических SVG
    // (public/brand/logo47/og.svg — пути, make-logo47.py)
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "SCORESBOX — футбол Чувашии онлайн" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SCORESBOX — футбол Чувашии онлайн",
    description: "Все турниры Чувашии в реальном времени: матчи, таблицы, бомбардиры, судьи",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  };
}

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
    // ПЕРЕМЕННЫЕ ШРИФТОВ — НА <html>, НЕ НА <body> (грабля v1.0.37):
    // Tailwind v4 preflight задаёт font-family на html через
    // --default-font-family → var(--font-onest); если переменная
    // определена на body, html её не видит и ВЕСЬ сайт годами
    // рендерился системным фолбэком (Geist не работал тоже).
    <html lang="ru" suppressHydrationWarning className={`${onest.variable} ${geistMono.variable}`}>
      <body className="antialiased bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
