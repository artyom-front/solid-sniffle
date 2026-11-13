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
import { DEFAULT_ICON_URL, DEFAULT_APPLE_ICON_URL, DEFAULT_OG_IMAGE_URL } from "@/lib/branding";
import { JsonLd, organizationJsonLd, webSiteJsonLd, SITE_URL } from "@/lib/seo";
import { BRAND } from "@/components/portal/brand";

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// v1.0.48: generateMetadata вместо статического export — ИКОНКИ ВКЛАДКИ
// БРАУЗЕРА теперь управляются из админки («Сайт → Брендинг»): пока админ
// не загрузил свой фавикон, <link rel=icon> указывает на встроенную
// SB-монограмму (v1.0.53, logo53 — знак-поле logo47 не читался ≤24px);
// file-conventions app/icon.svg и app/apple-icon.png УДАЛЕНЫ
// (иначе конкурировали бы с metadata.icons) — одна точка правды.
// Кастомный фавикон = /api/media/<id>, смена применяется через
// revalidatePath (вызывает /api/admin/brand) — ISR-страницы не ждём 60 с.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBranding();
  // v1.0.53 (feedback53 №2): og:image — из админки («Сайт → Брендинг» →
  // «SEO и поисковые системы»), не загружена — встроенная карточка
  // og-default.png (SB-монограмма + SCORESBOX, PNG — скрейперы SVG не читают)
  const ogImage = brand.ogImageUrl ?? DEFAULT_OG_IMAGE_URL;
  const icons: Metadata["icons"] = brand.iconUrl
    ? { icon: [{ url: brand.iconUrl }], apple: [{ url: brand.iconUrl }] }
    : {
        icon: [{ url: DEFAULT_ICON_URL, type: "image/svg+xml" }],
        apple: [{ url: DEFAULT_APPLE_ICON_URL, sizes: "180x180" }],
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
    // twitter card был summary_large_image БЕЗ картинки). С v1.0.53 картинка
    // управляется из админки (ogImageUrl, feedback53 №2), дефолт — SB-
    // монограмма + SCORESBOX (public/brand/og-default.png, 1200×630, PNG)
    images: [{ url: ogImage, width: 1200, height: 630, alt: "SCORESBOX — футбол Чувашии онлайн" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SCORESBOX — футбол Чувашии онлайн",
    description: "Все турниры Чувашии в реальном времени: матчи, таблицы, бомбардиры, судьи",
    images: [ogImage],
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

// v1.0.53 (feedback53 №2): JSON-LD Organization + WebSite в исходном HTML —
// поисковики (Яндекс: лого в выдаче, панель знаний) собирают сущности сайта.
// Данные: имя = BRAND.name (brand.ts — смена названия в одном месте),
// url = SITE_URL (env, src/lib/seo.tsx), лого = брендинг админки (кастомный
// → Media, иначе встроенная SB-монограмма). getBranding уже вызван в
// generateMetadata — react cache() даёт ОДИН запрос к БД на рендер.
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const brand = await getBranding();
  const logoUrl = brand.logoDarkUrl ?? brand.iconUrl ?? DEFAULT_ICON_URL;
  return (
    // ПЕРЕМЕННЫЕ ШРИФТОВ — НА <html>, НЕ НА <body> (грабля v1.0.37):
    // Tailwind v4 preflight задаёт font-family на html через
    // --default-font-family → var(--font-onest); если переменная
    // определена на body, html её не видит и ВЕСЬ сайт годами
    // рендерился системным фолбэком (Geist не работал тоже).
    <html lang="ru" suppressHydrationWarning className={`${onest.variable} ${geistMono.variable}`}>
      <body className="antialiased bg-background text-foreground">
        {children}
        {/* schema.org: Organization (лого в выдаче Яндекса) + WebSite */}
        <JsonLd data={organizationJsonLd({ name: BRAND.name, logoUrl: `${SITE_URL}${logoUrl}` })} />
        <JsonLd data={webSiteJsonLd(BRAND.name)} />
        <Toaster />
      </body>
    </html>
  );
}
