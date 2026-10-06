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
import { AdSlot, initials } from "./visuals";

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

  // v1.0.41: на страницу матча эта колонка больше не рендерится вовсе —
  // её слоты AD-SIDEBAR переехали в ряд из 3 реклам над матчем (SiteShell)

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
  // Витрина под лентой (<768px, директива): карточки «Прямо сейчас»,
  // «Самый результативный», стат-карточки, таблица и топ игроков —
  // секциями; слоты AD-SIDEBAR (RIGHT_TOP/RIGHT_BOTTOM) здесь НЕ
  // рендерятся — слот живёт только при ≥768px, креатив уходит в
  // AD-TOP/AD-BOTTOM.
  if (layout === "grid") {
    return (
      <section className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {hotMatch && <FeaturedMatch match={hotMatch} kind="hot" />}
          {bestMatch && <FeaturedMatch match={bestMatch} kind="best" />}
        </div>
        {statBlocks.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {statBlocks.map((sb) => (
              <StatCard key={sb.id} sb={sb} />
            ))}
          </div>
        )}
        {standings}
        {topPlayers}
      </section>
    );
  }

  return (
    <div className="space-y-3">
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
    <div className="w-full animate-pulse overflow-hidden rounded-lg border border-sline bg-s1">
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
        <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-gold/90">{sb.title}</p>
        {sb.value && (
          <p className="tabular text-lg font-bold leading-none text-ink">
            {sb.value}
            {sb.text && <span className="ml-1.5 font-sans text-xs font-semibold text-ink2">{sb.text}</span>}
          </p>
        )}
        {!sb.value && sb.text && <p className="text-xs font-semibold leading-snug text-ink">{sb.text}</p>}
      </div>
    </>
  );
  const cls =
    "relative block h-[120px] w-full overflow-hidden rounded-lg border border-sline bg-s1 transition-colors hover:border-gold/50";
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
    <div className="overflow-hidden rounded-lg border border-sline bg-s1">
      <div className="flex items-center gap-1.5 border-b border-sline/60 bg-s2/40 px-3 py-2.5">
        <ListOrdered className="h-3.5 w-3.5 text-gold" />
        <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-ink2">Турнирная таблица</p>
      </div>
      {allLeagues.length > 1 && (
        <div className="flex items-center gap-1 border-b border-sline/60 px-2 py-2">
          <select
            value={selectedLeague?.id ?? ""}
            onChange={(e) => setLeagueId(e.target.value)}
            className="h-9 w-full rounded-md border border-sline bg-s1 px-2 text-[13px] font-medium text-ink2 focus:border-gold focus:outline-none"
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
            className="flex w-full items-center gap-2 border-b border-sline/40 px-3 py-1.5 text-left hover:bg-shover"
          >
            <span
              className={cn(
                "w-4 shrink-0 text-center tabular text-xs",
                r.position === 1 ? "font-bold text-gold" : r.position <= 2 ? "font-semibold text-ink2" : "text-ink3"
              )}
            >
              {r.position}
            </span>
            <span className="min-w-0 flex-1 break-words text-[13px] font-medium text-ink2">{r.teamName}</span>
            <span className="shrink-0 tabular text-xs text-ink3">{r.games}</span>
            <span className="w-7 shrink-0 text-right tabular text-xs font-bold text-ink">{r.points}</span>
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
    <div className="overflow-hidden rounded-lg border border-sline bg-s1">
      <div className="flex items-center gap-1.5 border-b border-sline/60 bg-s2/40 px-3 py-2.5">
        <Target className="h-3.5 w-3.5 text-gold" />
        <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-ink2">Топ игроков</p>
      </div>
      <div className="flex items-center gap-1 border-b border-sline/60 px-2 py-2">
        <select
          value={selectedLeague?.id ?? ""}
          onChange={(e) => setLeagueId(e.target.value)}
          className="h-9 w-full rounded-md border border-sline bg-s1 px-2 text-[13px] font-medium text-ink2 focus:border-gold focus:outline-none"
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
            <span className="block break-words text-[13px] font-semibold text-ink">{p.name}</span>
            <span className="block break-words text-xs text-ink3">{p.teamName}</span>
          </span>
          <span className="tabular text-sm font-bold text-gold">{v}</span>
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

/** Карточка «Прямо сейчас» / «Самый результативный» (Р-16): заголовок
 *  11px UPPERCASE (красный — live, жёлтый — результативный) + индикатор
 *  справа («● 90+»); строка матча: команда 13px | счёт-бейдж 12px/700
 *  жёлтый | команда 13px; мета «N-й тур · 29 сент. · Стадион» 11px
 *  серым одной строкой с переносом по словам. Высота карточки ≤110px. */
function FeaturedMatch({ match, kind }: { match: MatchDTO; kind: "hot" | "best" }) {
  const isHot = kind === "hot";
  const score = matchScore(match);
  const time = new Date(match.kickoff);
  const timeStr = time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
  const dateStr = time.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Moscow" });
  const elapsed = Math.floor((Date.now() - time.getTime()) / 60000);
  const liveMinute = elapsed >= 95 ? "90+" : `${Math.max(0, Math.min(90, elapsed))}'`;

  return (
    <button
      onClick={() => navigate(`/match/${match.id}`)}
      className="w-full overflow-hidden rounded-lg border border-sline bg-s1 text-left transition-colors hover:border-gold/50"
    >
      <div className={cn("flex items-center gap-1.5 px-3 py-2", isHot ? "bg-live/10" : "bg-gold/10")}>
        {isHot ? <CalendarClock className="h-3.5 w-3.5 text-live" /> : <Flame className="h-3.5 w-3.5 text-gold" />}
        <p className={cn("text-[11px] font-bold uppercase tracking-[0.6px]", isHot ? "text-live" : "text-gold")}>
          {isHot ? (match.status === "LIVE" ? "Прямо сейчас" : "Матч тура") : "Самый результативный"}
        </p>
        {isHot && match.status === "LIVE" && (
          <span className="ml-auto flex shrink-0 items-center gap-1 tabular text-xs font-bold text-live" title="Идущая минута матча">
            <span className="h-1.5 w-1.5 rounded-full bg-live live-dot" />
            {liveMinute}
          </span>
        )}
      </div>
      <div className="px-3 py-2.5">
        {/* АДАПТИВ: мобайл (<sm) — команды друг под другом слева, счёт по
            цифре справа (бейдж «растворяется» через display:contents);
            десктоп — «Хозяева [2:1] Гости» в одну строку, как было */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 text-[13px] font-normal text-ink sm:flex sm:items-center sm:justify-between sm:gap-2">
          <span className="col-start-1 row-start-1 min-w-0 break-words sm:flex-1 sm:text-right">{match.homeTeam.name}</span>
          <span className="contents shrink-0 rounded-md bg-s2 px-2 py-0.5 text-xs font-bold tabular text-gold sm:flex sm:items-center sm:justify-center">
            {score ? (
              <>
                <span className="col-start-2 row-start-1 flex items-center justify-end sm:justify-center">{score.home}</span>
                <span className="hidden sm:inline" aria-hidden>
                  :
                </span>
                <span className="col-start-2 row-start-2 flex items-center justify-end sm:justify-center">{score.away}</span>
              </>
            ) : (
              /* матч не начался: время — справа, по центру между строками команд */
              <span className="col-start-2 row-span-2 self-center justify-self-end text-xs font-bold tabular text-gold sm:justify-self-auto">
                {timeStr}
              </span>
            )}
          </span>
          <span className="col-start-1 row-start-2 min-w-0 break-words sm:flex-1">{match.awayTeam.name}</span>
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink3">
          <span>{match.round ? `${match.round}-й тур` : ""}</span>
          <span>·</span>
          <span>{dateStr}</span>
          {match.stadium && <><span>·</span><span className="min-w-0 break-words">{match.stadium.name}</span></>}
        </p>
      </div>
    </button>
  );
}

/** Слот AD-SIDEBAR (RIGHT_TOP/RIGHT_BOTTOM/LEFT_*): стандарт Р-29 —
 *  внешний креатив 190px (анти-CLS), свой промо — auto-высота, метка
 *  «РЕКЛАМА» — системный угловой бейдж 10px. Без баннера — НЕ
 *  рендерим вовсе (никаких заглушек и сдвигов вёрстки). */
export function BannerSlot({ banner }: { banner: BannerDTO | undefined }) {
  return <AdSlot banner={banner} fixedHeight={190} />;
}
