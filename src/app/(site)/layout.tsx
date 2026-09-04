import type { Metadata } from "next";
import SiteShell from "@/components/portal/SiteShell";
import { getOverview, getBanners } from "@/lib/services/public";

// Публичный сайт: данные шелла (сайдбар топ-лиг, баннеры) приходят из SSR —
// видны в исходном HTML (SEO) и не «мигают» скелетоном при гидратации.
// Кэш: лента живёт быстро, 60 секунд достаточно (ISR).
// ВАЖНО: Suspense-границы НЕ должно быть вокруг {children} — иначе
// notFound() страниц не сможет выставить HTTP 404 (shell уже отстримлен).
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return { alternates: { canonical: "/" } };
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [overview, banners] = await Promise.all([getOverview(), getBanners()]);
  return (
    <SiteShell overview={overview} banners={banners.banners}>
      {children}
    </SiteShell>
  );
}
