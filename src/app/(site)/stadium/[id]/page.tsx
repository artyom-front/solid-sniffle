import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StadiumPage from "@/components/portal/StadiumPage";
import { getStadiumProfile } from "@/lib/services/public";
import { JsonLd, stadiumJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { HttpError } from "@/lib/http";

// Стадион: SSR-профиль (статистика + матчи) — ISR 300 с
export const revalidate = 300;

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  try {
    return await getStadiumProfile(id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const data = await load(id);
  if (!data) return { title: "Стадион не найден", robots: { index: false, follow: true } };
  const s = data.stadium;
  const title = `${s.name} — матчи и статистика стадиона`;
  const desc = `${s.name}${s.city ? `, ${s.city}` : ""}: сыгранные и предстоящие матчи${s.capacity ? `, вместимость ${s.capacity} зрителей` : ""}, средняя результативность на SCORESBOX.`;
  return {
    title,
    description: desc,
    alternates: { canonical: `/stadium/${s.id}` },
    openGraph: { title, description: desc },
  };
}

export default async function StadiumRoute({ params }: Params) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();
  return (
    <>
      <JsonLd
        data={stadiumJsonLd({
          id: data.stadium.id, name: data.stadium.name, city: data.stadium.city,
          address: data.stadium.address, capacity: data.stadium.capacity,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Главная", url: "/" },
          { name: data.stadium.name },
        ])}
      />
      <StadiumPage stadiumId={id} initial={data} />
    </>
  );
}
