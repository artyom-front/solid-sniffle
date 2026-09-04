import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TeamPage from "@/components/portal/TeamPage";
import { getTeamProfile } from "@/lib/services/profiles";
import { JsonLd, teamJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { HttpError } from "@/lib/http";

// Команда: SSR-профиль (составы, таблица, матчи) — ISR 120 с
export const revalidate = 120;

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  try {
    return await getTeamProfile(id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const data = await load(id);
  if (!data) return { title: "Команда не найдена", robots: { index: false, follow: true } };
  const t = data.team;
  const pos = data.standings[0];
  const title = `${t.name} — состав, матчи и статистика`;
  const desc = `${t.name}${t.club ? ` (${t.club.name})` : ""}: состав по сезонам${pos ? `, ${pos.position}-е место в ${pos.season.league.name}` : ""}, результаты матчей, бомбардиры и тренеры на SCORESBOX.`;
  return {
    title,
    description: desc,
    alternates: { canonical: `/team/${t.id}` },
    openGraph: { title, description: desc },
  };
}

export default async function TeamRoute({ params }: Params) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();
  return (
    <>
      <JsonLd
        data={teamJsonLd({
          id: data.team.id, name: data.team.name, city: data.team.city, club: data.team.club,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Главная", url: "/" },
          ...(data.standings[0]
            ? [{ name: data.standings[0].season.league.name, url: `/league/${data.standings[0].season.league.id}` }]
            : []),
          { name: data.team.name },
        ])}
      />
      <TeamPage teamId={id} initial={data} />
    </>
  );
}
