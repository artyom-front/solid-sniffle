import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlayerPage from "@/components/portal/PlayerPage";
import { getPlayerProfile } from "@/lib/services/profiles";
import { JsonLd, personJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { HttpError } from "@/lib/http";

// Игрок/судья/тренер: SSR-профиль (карьера, статистика, дисциплина) — ISR 120 с
export const revalidate = 120;

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  try {
    return await getPlayerProfile(id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const data = await load(id);
  if (!data) return { title: "Профиль не найден", robots: { index: false, follow: true } };
  const p = data.player;
  const role = p.isReferee && p.registrations.length === 0 ? "судья" : p.position === "GK" ? "вратарь" : "игрок";
  const cur = p.registrations[0];
  const title = `${p.name} — статистика и карьера`;
  const desc = `${p.name} — ${role}${cur ? `, ${cur.team.name} (${cur.season.league})` : ""}: статистика по сезонам, голы, ассисты, карточки${p.isReferee ? ", судейская карьера и рейтинг" : ""} на SCORESBOX.`;
  return {
    title,
    description: desc,
    alternates: { canonical: `/player/${p.id}` },
    openGraph: { title, description: desc },
  };
}

export default async function PlayerRoute({ params }: Params) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();
  const p = data.player;
  return (
    <>
      <JsonLd
        data={personJsonLd({
          id: p.id, name: p.name, birthDate: p.birthDate, position: p.position, isReferee: p.isReferee,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Главная", url: "/" },
          ...(p.registrations[0]
            ? [
                { name: p.registrations[0].season.league },
                { name: p.registrations[0].team.name, url: `/team/${p.registrations[0].team.id}` },
              ]
            : []),
          { name: p.name },
        ])}
      />
      <PlayerPage personId={id} initial={data} />
    </>
  );
}
