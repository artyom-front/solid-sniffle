"use client";

// Правая колонка «Ночь под прожекторами» (v1.0.29: ПРАВАЯ = статистика
// и турнирная таблица; лиги уехали в левую колонку шелла):
// баннеры (RIGHT_TOP/RIGHT_BOTTOM), «Прямо сейчас» / «Матч тура»,
// стат-карточки (редакционные, с фото игрока/лого клуба — бокс
// ФИКСИРОВАННОЙ высоты, картинка не меняет разметку), турнирная
// таблица с выбором лиги и топ игроков (аватар — слот всегда 24×24).
// layout="rail"  — вертикальная колонка (боковая колонка сайта).
// layout="grid"  — витрина под лентой на главной (узкие экраны, когда
//                  боковых колонок нет): карточки в сетке 2 колонки.
// АНТИ-CLS: до прихода данных ленты/таблицы виджеты рендерятся
// скелетонами ФИКСИРОВАННОЙ высоты — колонка не прыгает; стат-карточки
// приходят из SSR и всегда одного размера.

import { useMemo, useState } from "react";
import { CalendarClock, Flame, ListOrdered, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch } from "./hooks";
import { navigate } from "./router";
import type { BannerDTO, MatchDTO, MatchDayDTO, OverviewDTO, PlayerStatRowDTO, StandingRowDTO, StatBlockDTO } from "./types";
import { FORMAT_LABELS } from "@/lib/labels";
import { matchScore } from "./ui-bits";
import { AdMark, initials } from "./visuals";

interface Props {
  overview: OverviewDTO | null;
  banners: BannerDTO[];
  statBlocks: StatBlockDTO[];
  version: number;
  layout?: "rail" | "grid";
}

/** Подпись формата: из админ-списка (FormatLink), затем словарь, затем код */
function formatLabel(fmt: string, overview: OverviewDTO | null): string {
  return overview?.formats?.find((f) => f.code === fmt)?.label ?? FORMAT_LABELS[fmt] ?? fmt;
}

const STAT_TABS = [
  { id: "goals", label: "Голы" },
  { id: "assists", label: "Ассист" },
  { id: "yc", label: "ЖК" },
  { id: "rc", label: "КК" },
] as const;

export default function RightRail({ overview, banners, statBlocks, version, layout = "rail" }: Props) {
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

  const topBanner = banners.find((b) => b.placement === "RIGHT_TOP");
  const bottomBanner = banners.find((b) => b.placement === "RIGHT_BOTTOM");

  const standings = <StandingsRail overview={overview} version={version} />;
  const topPlayers = <TopPlayersWidget overview={overview} version={version} />;
  const statCards = statBlocks.length > 0 && (
    <div className="space-y-4">
      {statBlocks.map((sb) => (
        <StatCard key={sb.id} sb={sb} />
      ))}
    </div>
  );

  // Витрина на главной (узкие экраны): баннер и матчи — сеткой 2 колонки,
  // стат-карточки — рядом, таблица и топ игроков — шире
  if (layout === "grid") {
    return (
      <section className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <BannerSlot banner={topBanner} />
          {hotMatch && <FeaturedMatch match={hotMatch} kind="hot" />}
          {bestMatch && <FeaturedMatch match={bestMatch} kind="best" />}
        </div>
        {statBlocks.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {statBlocks.map((sb) => (
              <StatCard key={sb.id} sb={sb} />
            ))}
          </div>
        )}
        {standings}
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
      {statCards}
      {standings}
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

// ============================================================
// Стат-карточка (v1.0.29): редакционный блок статистики с опциональным
// фото. АНТИ-CLS: бокс ВСЕГДА h-[120px] — с картинкой, с текстом, без
// данных размер одинаков; добавление фото не меняет отображение колонки.
// ============================================================
function StatCard({ sb }: { sb: StatBlockDTO }) {
  const content = (
    <>
      {sb.imageUrl && (
        <img
          src={sb.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full"
          style={{
            objectFit: sb.imageFit === "contain" ? "contain" : "cover",
            objectPosition: sb.imagePos ?? "center",
          }}
        />
      )}
      <div
        className={cn(
          "absolute inset-0 flex flex-col gap-1 overflow-hidden p-3",
          sb.imageUrl
            ? "justify-end bg-gradient-to-t from-[#07090d]/95 via-[#07090d]/55 to-transparent"
            : "justify-center bg-gradient-to-br from-gold/[0.07] to-transparent"
        )}
      >
        <p className="text-[11px] font-bold uppercase tracking-wide text-gold/90">{sb.title}</p>
        {sb.value && (
          <p className="font-mono text-2xl font-black leading-none text-ink">
            {sb.value}
            {sb.text && <span className="ml-1.5 font-sans text-xs font-semibold text-ink2">{sb.text}</span>}
          </p>
        )}
        {!sb.value && sb.text && <p className="text-xs font-semibold leading-snug text-ink">{sb.text}</p>}
      </div>
    </>
  );
  const cls =
    "relative block h-[120px] w-full overflow-hidden rounded-xl border border-sline bg-s1 transition-colors hover:border-gold/50";
  if (sb.linkUrl) {
    return (
      <a href={sb.linkUrl} target="_blank" rel="noopener noreferrer" className={cls} aria-label={sb.title}>
        {content}
      </a>
    );
  }
  return <div className={cls}>{content}</div>;
}

// ============================================================
// Турнирная таблица (v1.0.29): компактная таблица топ-8 лиги
// с переключателем; полная версия — на странице лиги.
// ============================================================
function StandingsRail({ overview, version }: { overview: OverviewDTO | null; version: number }) {
  const pinned = (overview?.leagues ?? []).filter((l) => l.isPinned).sort((a, b) => a.priority - b.priority);
  const allLeagues = overview?.leagues ?? [];
  const [leagueId, setLeagueId] = useState<string>("");
  const selectedLeague = allLeagues.find((l) => l.id === leagueId) ?? pinned[0] ?? allLeagues[0];
  const season = selectedLeague?.seasons.find((s) => s.isCurrent) ?? selectedLeague?.seasons[0];

  const { data } = useFetch<{ standings: StandingRowDTO[] }>(
    season ? `/api/public/standings?seasonId=${season.id}` : null,
    version
  );
  const rows = (data?.standings ?? []).slice(0, 8);

  return (
    <div className="overflow-hidden rounded-xl border border-sline bg-s1">
      <div className="flex items-center gap-1.5 border-b border-sline/60 bg-s2/50 px-3 py-2.5">
        <ListOrdered className="h-3.5 w-3.5 text-gold" />
        <p className="text-xs font-bold uppercase tracking-wide text-ink2">Турнирная таблица</p>
      </div>
      {allLeagues.length > 1 && (
        <div className="flex items-center gap-1 border-b border-sline/60 px-2 py-2">
          <select
            value={selectedLeague?.id ?? ""}
            onChange={(e) => setLeagueId(e.target.value)}
            className="w-full rounded-md border border-sline bg-s1 px-2 py-1.5 text-xs font-medium text-ink2 focus:border-gold focus:outline-none"
            aria-label="Лига таблицы"
          >
            {allLeagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.shortName ?? l.name} · {formatLabel(l.format, overview)}
              </option>
            ))}
          </select>
        </div>
      )}
      {allLeagues.length === 1 && selectedLeague && (
        <p className="border-b border-sline/60 px-3 py-2 text-xs font-semibold text-ink2">
          {selectedLeague.shortName ?? selectedLeague.name}
          <span className="ml-1.5 font-normal text-ink3">{formatLabel(selectedLeague.format, overview)}</span>
        </p>
      )}
      {!data && (
        // скелетон фиксированной высоты — таблица не прыгает при загрузке
        <div className="animate-pulse space-y-2 px-3 py-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-s2/70" />
              <div className="h-3 flex-1 rounded bg-s2/50" style={{ maxWidth: `${70 - i * 4}%` }} />
              <div className="h-3 w-4 rounded bg-s2/70" />
            </div>
          ))}
        </div>
      )}
      {data && rows.length === 0 && <p className="py-5 text-center text-xs text-ink3">Нет данных</p>}
      {data &&
        rows.map((r) => (
          <button
            key={r.teamId}
            onClick={() => navigate(`/team/${r.teamId}`)}
            className="flex w-full items-center gap-2 border-b border-sline/40 px-3 py-1.5 text-left hover:bg-s2/60"
          >
            <span
              className={cn(
                "w-4 shrink-0 text-center font-mono text-xs",
                r.position === 1 ? "font-bold text-gold" : r.position <= 2 ? "font-semibold text-ink2" : "text-ink3"
              )}
            >
              {r.position}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink2">{r.teamName}</span>
            <span className="shrink-0 font-mono text-xs text-ink3">{r.games}</span>
            <span className="w-7 shrink-0 text-right font-mono text-xs font-bold text-ink">{r.points}</span>
          </button>
        ))}
      {data && selectedLeague && rows.length > 0 && (
        <button
          onClick={() => navigate(`/league/${selectedLeague.id}/table`)}
          className="w-full py-2 text-center text-xs font-semibold text-gold hover:text-gold/80"
        >
          Полная таблица →
        </button>
      )}
    </div>
  );
}

/** Топ игроков с переключателем лиги и табами Голы/Ассист/ЖК/КК.
 *  Аватар игрока — слот 24×24 ВСЕГДА (фото или монограмма): появление
 *  фото не меняет размер строки (анти-CLS). */
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
              {l.shortName ?? l.name} · {formatLabel(l.format, overview)}
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
          {/* аватар: слот 24×24 всегда — фото появится, размер строки не изменится */}
          <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sline bg-s2">
            {p.photoUrl ? (
              <img src={p.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="font-mono text-[9px] font-bold text-ink3">{initials(p.name)}</span>
            )}
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
