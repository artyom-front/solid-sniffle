import type { Metadata } from "next";
import SiteShell from "@/components/portal/SiteShell";
import { getOverview, getBanners, getStatBlocks } from "@/lib/services/public";
import { getBranding } from "@/lib/services/branding";

// Публичный сайт: данные шелла (сайдбар топ-лиг, баннеры) приходят из SSR —
// видны в исходном HTML (SEO) и не «мигают» скелетоном при гидратации.
// v1.0.48: сюда же добавлен БРЕНДИНГ (кастомные лого из админки) —
// в HTML сразу, смена подхватывается ISR-циклом (60 с) либо мгновенно
// через revalidatePath из /api/admin/brand.
// Кэш: лента живёт быстро, 60 секунд достаточно (ISR).
// ВАЖНО: Suspense-границы НЕ должно быть вокруг {children} — иначе
// notFound() страниц не сможет выставить HTTP 404 (shell уже отстримлен).
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return { alternates: { canonical: "/" } };
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [overview, banners, statBlocks, branding] = await Promise.all([
    getOverview(),
    getBanners(),
    getStatBlocks(),
    getBranding(),
  ]);
  return (
    <SiteShell overview={overview} banners={banners.banners} statBlocks={statBlocks.statBlocks} branding={branding}>
      {children}
    </SiteShell>
  );
}
