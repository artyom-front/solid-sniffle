import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MatchPage from "@/components/portal/MatchPage";
import { getMatchDetail } from "@/lib/services/profiles";
import { JsonLd, matchJsonLd, breadcrumbJsonLd, mskDateTitle, mskTimeTitle } from "@/lib/seo";
import { HttpError } from "@/lib/http";

// Матч: SSR + ISR 30 c (LIVE-счёт обновляется на клиенте каждые 30 с —
// поисковик видит актуальный HTML без нагрузки на БД)
export const revalidate = 30;

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  try {
    return await getMatchDetail(id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const detail = await load(id);
  if (!detail) notFound();

  const m = detail.match;
  const score =
    m.status === "COMPLETED" && m.homeScore != null && m.awayScore != null
      ? ` ${m.homeScore}:${m.awayScore}`
      : "";
  const title = `${m.homeTeam.name} — ${m.awayTeam.name}${score} · ${m.league.name}`;
  const desc =
    m.status === "LIVE"
      ? `${m.homeTeam.name} — ${m.awayTeam.name}, LIVE ${m.homeScore ?? 0}:${m.awayScore ?? 0}. ${m.league.name}, ${mskDateTitle(m.kickoff)}. Хронология, составы, превью и статистика на SCORESBOX.`
      : `${m.homeTeam.name} — ${m.awayTeam.name}${score ? ` (${score.trim()})` : ""}. ${m.league.name}${m.round ? `, ${m.round}-й тур` : ""}, ${mskDateTitle(m.kickoff)}, ${m.stadium ? m.stadium.name + ", " + (m.stadium.city ?? "") : ""}. Превью, хронология, составы и таблица на SCORESBOX.`;

  return {
    title,
    description: desc.replace(/\s+/g, " ").trim(),
    alternates: { canonical: `/match/${m.id}` },
    openGraph: {
      title,
      description: desc.replace(/\s+/g, " ").trim(),
      type: "article",
    },
  };
}

export default async function MatchRoute({ params }: Params) {
  const { id } = await params;
  const detail = await load(id);
  if (!detail) notFound();

  const m = detail.match;
  return (
    <>
      <JsonLd
        data={matchJsonLd({
          id: m.id, kickoff: m.kickoff, status: m.status,
          homeTeam: m.homeTeam, awayTeam: m.awayTeam,
          homeScore: m.homeScore, awayScore: m.awayScore,
          stadium: m.stadium, league: m.league, round: m.round,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Главная", url: "/" },
          { name: m.league.name, url: `/league/${m.league.id}` },
          { name: `${m.homeTeam.name} — ${m.awayTeam.name}` },
        ])}
      />
      <MatchPage matchId={id} initial={detail} />
    </>
  );
}
