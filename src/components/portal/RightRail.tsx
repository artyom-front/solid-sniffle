"use client";

// Левая колонка «Ночь под прожекторами» (v1.0.28: лЕВАЯ = данные,
// статистика и реклама; лиги уехали в правую колонку шелла):
// баннеры (LEFT_TOP/LEFT_BOTTOM — если side="left"), «Матч тура» /
// «Прямо сейчас», «Самый результативный» и топ игроков.
// layout="rail"  — вертикальная колонка (боковая колонка сайта).
// layout="grid"  — витрина под лентой на главной (узкие экраны, когда
//                  боковых колонок нет): карточки в сетке 2 колонки.
// АНТИ-CLS: до прихода данных ленты виджеты матча рендерятся
// скелетонами ФИКСИРОВАННОЙ высоты — колонка не прыгает.

import { useMemo, useState } from "react";
import { CalendarClock, Flame, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch } from "./hooks";
import { navigate } from "./router";
import type { BannerDTO, MatchDTO, MatchDayDTO, OverviewDTO, PlayerStatRowDTO } from "./types";
import { FORMAT_LABELS } from "@/lib/labels";
import { matchScore } from "./ui-bits";
import { AdMark } from "./visuals";

interface Props {
  overview: OverviewDTO | null;
  banners: BannerDTO[];
  version: number;
  layout?: "rail" | "grid";
  /** Какие слоты баннеров занимать: left — колонка слева от ленты
   *  (LEFT_TOP/LEFT_BOTTOM); по умолчанию — RIGHT_* (легаси-слоты) */
  side?: "left" | "right";
}

const STAT_TABS = [
  { id: "goals", label: "Голы" },
  { id: "assists", label: "Ассист" },
  { id: "yc", label: "ЖК" },
  { id: "rc", label: "КК" },
] as const;

export default function RightRail({ overview, banners, version, layout = "rail", side = "right" }: Props) {
  const { data: dayData } = useFetch<{ leagues: MatchDayDTO[] }>(overview ? "/api/public/matches/day?date=all" : null, version);

  const { hotMatch, bestMatch } = useMemo(() => {
    const all = (dayData?.leagues ?? []).flatMap((l) => l.matches);
    const now = Date.now();
    const upcoming = all
      .filter((m) => m.status === "SCHEDULED" && new Date(m.kickoff).getTime() >= now)
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
    const live = all.filter((m) => m.status === "LIVE");
    const hot = live[0] ?? upcoming[0] ?? null;
    const best = all
      .filter((m) => m.status === "COMPLETED")
      .sort((a, b) => (b.homeScore ?? 0) + (b.awayScore ?? 0) - (a.homeScore ?? 0) - (a.awayScore ?? 0))[0] ?? null;
    return { hotMatch: hot, bestMatch: best };
  }, [dayData]);

  const topBanner = banners.find((b) => b.placement === (side === "left" ? "LEFT_TOP" : "RIGHT_TOP"));
  const bottomBanner = banners.find((b) => b.placement === (side === "left" ? "LEFT_BOTTOM" : "RIGHT_BOTTOM"));

  const topPlayers = <TopPlayersWidget overview={overview} version={version} />;

  // Витрина на главной: баннер и матчи — сеткой 2 колонки, топ игроков — шире
  if (layout === "grid") {
    return (
      <section className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <BannerSlot banner={topBanner} />
          {hotMatch && <FeaturedMatch match={hotMatch} kind="hot" />}
          {bestMatch && <FeaturedMatch match={bestMatch} kind="best" />}
        </div>
        {topPlayers}
        <div className="grid gap-4 sm:grid-cols-2">
          <BannerSlot banner={bottomBanner} />
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <BannerSlot banner={topBanner} />
      {dayData ? (
        <>
          {hotMatch && <FeaturedMatch match={hotMatch} kind="hot" />}
          {bestMatch && <FeaturedMatch match={bestMatch} kind="best" />}
        </>
      ) : (
        // скелетоны фиксированной высоты — колонка не прыгает при загрузке (анти-CLS)
        <>
          <FeaturedMatchSkeleton />
          <FeaturedMatchSkeleton />
        </>
      )}
      {topPlayers}
      <BannerSlot banner={bottomBanner} />
    </div>
  );
}

/** Скелетон карточки матча: тот же каркас, что FeaturedMatch */
function FeaturedMatchSkeleton() {
  return (
    <div className="w-full animate-pulse overflow-hidden rounded-xl border border-sline bg-s1">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <div className="h-3 w-20 rounded bg-s2" />
      </div>
      <div className="space-y-2 px-3 py-3">
        <div className="h-3.5 w-full rounded bg-s2/70" />
        <div className="h-2.5 w-2/3 rounded bg-s2/50" />
      </div>
    </div>
  );
}

/** Топ игроков с переключателем лиги и табами Голы/Ассист/ЖК/КК */
function TopPlayersWidget({ overview, version }: { overview: OverviewDTO | null; version: number }) {
  const pinned = (overview?.leagues ?? []).filter((l) => l.isPinned).sort((a, b) => a.priority - b.priority);
  const allLeagues = overview?.leagues ?? [];
  const [leagueId, setLeagueId] = useState<string>("");
  const [statTab, setStatTab] = useState<(typeof STAT_TABS)[number]["id"]>("goals");

  const selectedLeague = allLeagues.find((l) => l.id === leagueId) ?? pinned[0] ?? allLeagues[0];
  const season = selectedLeague?.seasons.find((s) => s.isCurrent) ?? selectedLeague?.seasons[0];

  const { data: scorers } = useFetch<{ scorers: PlayerStatRowDTO[]; assisters: PlayerStatRowDTO[]; fairPlay: PlayerStatRowDTO[] }>(
    season ? `/api/public/scorers?seasonId=${season.id}` : null,
    version
  );

  const statRows = useMemo(() => {
    if (!scorers) return [];
    switch (statTab) {
      case "goals":
        return scorers.scorers.slice(0, 5).map((p) => ({ p, v: p.goals }));
      case "assists":
        return scorers.assisters.slice(0, 5).map((p) => ({ p, v: p.assists }));
      case "yc":
        return [...scorers.fairPlay].sort((a, b) => b.yellowCards - a.yellowCards).slice(0, 5).map((p) => ({ p, v: p.yellowCards }));
      case "rc":
        return [...scorers.fairPlay].sort((a, b) => b.redCards - a.redCards).filter((p) => p.redCards > 0).slice(0, 5).map((p) => ({ p, v: p.redCards }));
    }
  }, [scorers, statTab]);

  return (
    <div className="overflow-hidden rounded-xl border border-sline bg-s1">
      <div className="flex items-center gap-1.5 border-b border-sline/60 bg-s2/50 px-3 py-2.5">
        <Target className="h-3.5 w-3.5 text-gold" />
        <p className="text-xs font-bold uppercase tracking-wide text-ink2">Топ игроков</p>
      </div>
      <div className="flex items-center gap-1 border-b border-sline/60 px-2 py-2">
        <select
          value={selectedLeague?.id ?? ""}
          onChange={(e) => setLeagueId(e.target.value)}
          className="w-full rounded-md border border-sline bg-s1 px-2 py-1.5 text-xs font-medium text-ink2 focus:border-gold focus:outline-none"
          aria-label="Лига"
        >
          {allLeagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.shortName ?? l.name} · {FORMAT_LABELS[l.format] ?? l.format}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-4 border-b border-sline/60">
        {STAT_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setStatTab(t.id)}
            className={cn(
              "py-2 text-xs font-semibold transition-colors",
              statTab === t.id ? "border-b-2 border-gold text-gold" : "text-ink3 hover:text-ink2"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {statRows.length === 0 && <p className="py-5 text-center text-xs text-ink3">Нет данных</p>}
      {statRows.map(({ p, v }, i) => (
        <button
          key={p.personId}
          onClick={() => navigate(`/player/${p.personId}`)}
          className="flex w-full items-center gap-2.5 border-b border-sline/40 px-3 py-2 text-left hover:bg-s2/60"
        >
          <span className={cn(
            "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
            i === 0 ? "bg-gold text-goldink" : "bg-s2 text-ink2"
          )}>
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-ink">{p.name}</span>
            <span className="block truncate text-xs text-ink3">{p.teamName}</span>
          </span>
          <span className="font-mono text-sm font-bold text-gold">{v}</span>
        </button>
      ))}
      {selectedLeague && (
        <button
          onClick={() => navigate(`/league/${selectedLeague.id}/scorers`)}
          className="w-full py-2 text-center text-xs font-semibold text-gold hover:text-gold/80"
        >
          Весь список →
        </button>
      )}
    </div>
  );
}

/** Карточка «Матч тура» / «Самый результативный» */
function FeaturedMatch({ match, kind }: { match: MatchDTO; kind: "hot" | "best" }) {
  const isHot = kind === "hot";
  const score = matchScore(match);
  const shown = score ? `${score.home}:${score.away}` : null;
  const time = new Date(match.kickoff);
  const timeStr = time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
  const dateStr = time.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Moscow" });

  return (
    <button
      onClick={() => navigate(`/match/${match.id}`)}
      className="w-full overflow-hidden rounded-xl border border-sline bg-s1 text-left transition-colors hover:border-gold/50"
    >
      <div className={cn("flex items-center gap-1.5 px-3 py-2", isHot ? "bg-live/10" : "bg-amber-400/10")}>
        {isHot ? <CalendarClock className="h-3.5 w-3.5 text-live" /> : <Flame className="h-3.5 w-3.5 text-amber-400" />}
        <p className={cn("text-xs font-bold uppercase tracking-wide", isHot ? "text-live" : "text-amber-400")}>
          {isHot ? (match.status === "LIVE" ? "Прямо сейчас" : "Матч тура") : "Самый результативный"}
        </p>
        {isHot && match.status === "LIVE" && (
          <span className="ml-auto flex items-center gap-1 text-xs font-bold text-live">
            <span className="h-1.5 w-1.5 rounded-full bg-live live-dot" />
            LIVE
          </span>
        )}
      </div>
      <div className="px-3 py-3">
        <div className="flex items-center justify-between gap-2 text-sm font-semibold text-ink">
          <span className="min-w-0 flex-1 truncate text-right">{match.homeTeam.name}</span>
          <span className="shrink-0 rounded-md bg-s2 px-2 py-0.5 font-mono text-sm font-bold tabular text-gold">
            {shown ?? timeStr}
          </span>
          <span className="min-w-0 flex-1 truncate">{match.awayTeam.name}</span>
        </div>
        <p className="mt-2 flex items-center gap-2 text-xs text-ink3">
          <span>{match.round ? `${match.round}-й тур` : ""}</span>
          <span>·</span>
          <span>{dateStr}</span>
          {match.stadium && <><span>·</span><span className="truncate">{match.stadium.name}</span></>}
        </p>
      </div>
    </button>
  );
}

/** Слот баннера 300×250. Без баннера — НЕ рендерим вовсе (никаких заглушек
 *  и сдвигов вёрстки); с картинкой — имиджевый баннер с деликатной
 *  маркировкой «Реклама» (кегль и прозрачность настраиваются в баннере). */
export function BannerSlot({ banner }: { banner: BannerDTO | undefined }) {
  if (!banner) return null;
  if (banner.imageUrl) {
    return (
      <a
        href={banner.linkUrl ?? "#"}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="relative block h-[190px] overflow-hidden rounded-xl border border-gold/30 transition-colors hover:border-gold/60"
      >
        <img
          src={banner.imageUrl}
          alt={banner.title}
          className="absolute inset-0 h-full w-full"
          style={{
            objectFit: banner.imageFit === "contain" ? "contain" : "cover",
            objectPosition: banner.imagePos ?? "center",
          }}
        />
        <span className="absolute bottom-2 right-2 z-10">
          <AdMark size={banner.markSize} opacity={banner.markOpacity} />
        </span>
      </a>
    );
  }
  return (
    <a
      href={banner.linkUrl ?? "#"}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="flex h-[190px] flex-col justify-between rounded-xl border border-gold/30 bg-gradient-to-br from-gold/10 to-transparent p-4 transition-colors hover:border-gold/60"
    >
      <div>
        <p className="text-sm font-bold text-ink">{banner.title}</p>
        {banner.text && <p className="mt-1 text-xs text-ink2">{banner.text}</p>}
      </div>
      <AdMark size={banner.markSize} opacity={banner.markOpacity} />
    </a>
  );
}
