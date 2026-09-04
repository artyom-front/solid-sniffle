import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LeaguePage from "@/components/portal/LeaguePage";
import { getOverview } from "@/lib/services/public";
import { JsonLd, breadcrumbJsonLd } from "@/lib/seo";

// Лига: SSR-гери + вкладки (Матчи/Таблица/Бомбардиры/…) — ISR 60 с
export const revalidate = 60;

const TAB_TITLES: Record<string, string> = {
  matches: "Матчи и календарь",
  table: "Турнирная таблица",
  scorers: "Бомбардиры и статистика игроков",
  discipline: "Дисквалификации",
  teams: "Команды-участницы",
  referees: "Судьи",
};

type Params = { params: Promise<{ id: string; tab?: string[] }> };

async function loadLeague(id: string) {
  const overview = await getOverview();
  return overview.leagues.find((l) => l.id === id) ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id, tab } = await params;
  const league = await loadLeague(id);
  if (!league) return { title: "Лига не найдена", robots: { index: false, follow: true } };
  const tabKey = tab?.[0];
  const tabTitle = tabKey && TAB_TITLES[tabKey] ? ` — ${TAB_TITLES[tabKey]}` : "";
  const title = `${league.name}${tabTitle}`;
  const desc = `${league.name}: расписание и результаты матчей, турнирная таблица, бомбардиры, дисквалификации и судьи на SCORESBOX — портале футбола Чувашии.`;
  return {
    title,
    description: desc,
    alternates: { canonical: tabKey ? `/league/${league.id}/${tabKey}` : `/league/${league.id}` },
    openGraph: { title, description: desc },
  };
}

export default async function LeagueRoute({ params }: Params) {
  const { id, tab } = await params;
  const league = await loadLeague(id);
  if (!league) notFound();
  const tabKey = tab?.[0] ?? "matches";
  const overview = await getOverview();

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Главная", url: "/" },
          { name: league.name, url: `/league/${league.id}` },
          ...(tabKey !== "matches" && TAB_TITLES[tabKey] ? [{ name: TAB_TITLES[tabKey] }] : []),
        ])}
      />
      <LeaguePage leagueId={id} tab={tabKey} overview={overview} version={0} />
    </>
  );
}
