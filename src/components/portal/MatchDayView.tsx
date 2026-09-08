"use client";

// Главная — livescore-лента «Ночь под прожекторами»:
// фильтры даты/статуса, матчи по лигам, избранное-звёзды, LIVE-минуты,
// «эмоции турнира» (серии, важные матчи, пропуски бомбардиров) + легенда.

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Flame, Info, MapPin, Snowflake, Star, Trophy, UserCog, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch } from "./hooks";
import { navigate, mskDay } from "./router";
import { useFavs, toggleFavLeague } from "./favs";
import type { MatchDayDTO, OverviewDTO, LivescoreMatchDTO, MatchSignalSideDTO } from "./types";
import { FormatChip } from "./visuals";
import { LoadingBlock, matchScore, EmptyState, StreakMark } from "./ui-bits";

interface Props {
  format: string;
  overview: OverviewDTO | null;
  version: number;
  /** SSR-данные ленты «сегодня» — мгновенная гидратация без скелетона */
  initialDay?: { leagues: MatchDayDTO[] } | null;
}

type StatusFilter = "all" | "live" | "finished";

/** Лимит промотки дат влево/вправо от сегодня */
const DATE_RANGE = 10;

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "finished", label: "Завершённые" },
];

export default function MatchDayView({ format, version, initialDay }: Props) {
  const [dayOffset, setDayOffset] = useState(0);
  const [customDate, setCustomDate] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [liveTick, setLiveTick] = useState(0); // авто-обновление при LIVE
  const favs = useFavs();

  const dateParam = customDate ?? mskDay(dayOffset);
  const isToday = dayOffset === 0 && !customDate;
  const { data, loading, error } = useFetch<{ leagues: MatchDayDTO[] }>(
    `/api/public/matches/day?date=${dateParam}&format=${format}`,
    version + liveTick,
    // SSR отдаёт ленту «сегодня» в текущем формате — используем её как стартовое состояние
    isToday && initialDay ? initialDay : null
  );

  /** Дата в человекочитаемом виде: «суббота, 8 сентября» */
  const dateLabel = useMemo(() => {
    const d = new Date(`${dateParam}T12:00:00+03:00`);
    const label = d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Moscow" });
    return label.replace(/^./, (c) => c.toUpperCase());
  }, [dateParam]);

  const anyLive = useMemo(
    () => (data?.leagues ?? []).some((l) => l.matches.some((m) => m.status === "LIVE")),
    [data]
  );
  // LIVE-матчи: каждые 30 секунд подтягиваем счёт, события и текущую минуту
  useEffect(() => {
    if (!anyLive) return;
    const t = setInterval(() => setLiveTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, [anyLive]);

  const leagues = useMemo(() => {
    const src = data?.leagues ?? [];
    const filterFn = (m: LivescoreMatchDTO) => {
      if (status === "live") return m.status === "LIVE";
      if (status === "finished") return m.status === "COMPLETED" || m.status === "WALKOVER";
      return true;
    };
    const filtered = src.map((l) => ({ ...l, matches: l.matches.filter(filterFn) })).filter((l) => l.matches.length > 0);
    // Избранные лиги — вверху ленты (товарищеские — всегда последними)
    return filtered.sort((a, b) => {
      if (a.league.id === "friendly") return 1;
      if (b.league.id === "friendly") return -1;
      return Number(favs.includes(b.league.id)) - Number(favs.includes(a.league.id));
    });
  }, [data, status, favs]);

  const totalMatches = leagues.reduce((sum, l) => sum + l.matches.length, 0);

  return (
    <div className="space-y-3">
      {/* ---------- Фильтры ---------- */}
      <div className="rounded-xl border border-sline bg-s1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-sline/60 px-4 py-3">
          {/* Дата: ‹ Сегодня › с промоткой ±10 дней */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setDayOffset((o) => Math.max(-DATE_RANGE, o - 1)); setCustomDate(null); }}
              disabled={dayOffset <= -DATE_RANGE && !customDate}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-s2 text-ink2 transition-colors hover:bg-gold hover:text-goldink disabled:opacity-30 disabled:hover:bg-s2"
              aria-label="Предыдущий день"
              title={dayOffset <= -DATE_RANGE ? "Дальше 10 дней назад нельзя" : "На день назад"}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => { setDayOffset(0); setCustomDate(null); }}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-bold transition-colors",
                isToday ? "bg-gold text-goldink" : "bg-s2 text-ink2 hover:text-ink"
              )}
            >
              Сегодня
            </button>
            <button
              onClick={() => { setDayOffset((o) => Math.min(DATE_RANGE, o + 1)); setCustomDate(null); }}
              disabled={dayOffset >= DATE_RANGE && !customDate}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-s2 text-ink2 transition-colors hover:bg-gold hover:text-goldink disabled:opacity-30 disabled:hover:bg-s2"
              aria-label="Следующий день"
              title={dayOffset >= DATE_RANGE ? "Дальше 10 дней вперёд нельзя" : "На день вперёд"}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <span className="min-w-36 text-sm font-semibold text-ink2">{dateLabel}</span>
          <label className="flex items-center gap-1.5 text-xs text-ink3">
            <CalendarDays className="h-3.5 w-3.5" />
            <input
              type="date"
              value={customDate ?? ""}
              onChange={(e) => e.target.value && setCustomDate(e.target.value)}
              className="rounded-md border border-sline bg-s1 px-2 py-1 text-xs text-ink2 focus:border-gold focus:outline-none [color-scheme:dark]"
              aria-label="Выбор даты"
            />
            {customDate && (
              <button onClick={() => setCustomDate(null)} className="font-semibold text-gold hover:text-gold/80">сброс</button>
            )}
          </label>
          {/* Статус: Live / Завершённые — взаимоисключающие тумблеры */}
          <div className="ml-auto flex gap-1">
            {STATUS_TABS.map((t) => {
              const active = status === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    if (t.id === "finished" && !active) {
                      // «Завершённые» — всегда про сегодня
                      setDayOffset(0);
                      setCustomDate(null);
                    }
                    setStatus(active ? "all" : t.id);
                  }}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                    active
                      ? t.id === "live"
                        ? "bg-live text-white"
                        : "bg-gold text-goldink"
                      : "bg-s2 text-ink2 hover:text-ink"
                  )}
                >
                  {t.id === "live" && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-white align-middle live-dot" />}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---------- Лента матчей по лигам ---------- */}
      {loading && !data && <LoadingBlock label="Загрузка матчей..." />}
      {error && <EmptyState title="Не удалось загрузить матчи" hint={error} />}
      {data && totalMatches === 0 && (
        <EmptyState title="В этот день матчей нет" hint="Промотайте даты стрелками или выберите день в календаре" />
      )}
      {leagues.map((l) => (
        <section key={l.league.id} className="overflow-hidden rounded-xl border border-sline bg-s1">
          {/* Заголовок лиги */}
          <div className="flex items-center gap-2 border-b border-sline/60 bg-s2/50 px-4 py-2.5">
            <FormatChip format={l.league.format} />
            {l.league.id !== "friendly" ? (
              <button
                onClick={() => navigate(`/league/${l.league.id}`)}
                className="text-sm font-bold text-ink hover:text-gold"
              >
                {l.league.name}
              </button>
            ) : (
              <span className="text-sm font-bold text-ink2">{l.league.name}</span>
            )}
            {l.season.name && <span className="hidden text-xs text-ink3 sm:inline">· {l.season.name}</span>}
            {l.league.id !== "friendly" && (
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => toggleFavLeague(l.league.id)}
                  className={cn("flex h-7 w-7 items-center justify-center rounded-lg transition-colors", favs.includes(l.league.id) ? "text-gold" : "text-ink3 hover:text-ink2")}
                  aria-label={favs.includes(l.league.id) ? "Убрать из избранного" : "Добавить в избранное"}
                  title={favs.includes(l.league.id) ? "Убрать из избранного" : "В избранное"}
                >
                  <Star className={cn("h-4 w-4", favs.includes(l.league.id) && "fill-gold")} />
                </button>
                <button
                  onClick={() => navigate(`/league/${l.league.id}/table`)}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-gold hover:bg-gold/10"
                >
                  Таблица
                </button>
                <ChevronRight className="h-3.5 w-3.5 text-ink3" />
              </div>
            )}
          </div>
          {l.matches.map((m) => <MatchRow key={m.id} m={m} />)}
        </section>
      ))}

      <SignalsLegend />
    </div>
  );
}

/** Строка матча в стиле livescore: LIVE-минута и время начала,
 *  серии команд, значки «важно / без бомбардира / новый тренер». */
function MatchRow({ m }: { m: LivescoreMatchDTO }) {
  const score = matchScore(m);
  const time = new Date(m.kickoff);
  const timeStr = time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
  const dateStr = time.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "Europe/Moscow" });

  const s = m.signals;
  const important = s?.important;
  const elapsed = Math.floor((Date.now() - time.getTime()) / 60000);
  const liveMinute = elapsed >= 95 ? "90+" : `${Math.max(0, Math.min(90, elapsed))}'`;

  return (
    <button
      onClick={() => navigate(`/match/${m.id}`)}
      title={important?.flag ? important.reason : undefined}
      className={cn(
        "grid w-full grid-cols-[72px_minmax(0,1fr)_auto_minmax(0,1fr)_26px] items-center gap-2 border-b border-sline/40 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-s2/60",
        m.status === "LIVE" && "bg-live/[0.06]",
        important?.flag && "match-important"
      )}
    >
      {/* время / статус */}
      {m.status === "LIVE" ? (
        <span className="flex flex-col items-start leading-tight">
          <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-live">
            <span className="h-1.5 w-1.5 rounded-full bg-live live-dot" />
            {liveMinute}
          </span>
          <span className="text-xs text-ink3">с {timeStr}</span>
        </span>
      ) : m.status === "SCHEDULED" || m.status === "POSTPONED" ? (
        <span className="font-mono text-xs font-semibold tabular text-ink2">{timeStr}</span>
      ) : (
        <span className="font-mono text-xs tabular text-ink3">{dateStr}</span>
      )}

      {/* хозяева + сигналы */}
      <span className="flex min-w-0 items-center justify-end gap-1.5 text-sm">
        <TeamSignals side={s?.home} />
        <span className={cn("truncate", score && score.home > score.away ? "font-bold text-ink" : "font-medium text-ink2")}>
          {m.homeTeam.name}
        </span>
      </span>

      {/* счёт */}
      <span className="flex w-16 shrink-0 items-center justify-center rounded-md bg-s2 py-1 font-mono text-sm font-bold tabular">
        {score ? (
          <span className={m.status === "WALKOVER" ? "text-amber-400" : m.status === "LIVE" ? "text-live" : "text-ink"}>
            {score.home} : {score.away}
          </span>
        ) : (
          <span className="text-ink3">— : —</span>
        )}
      </span>

      {/* гости + сигналы */}
      <span className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className={cn("truncate", score && score.away > score.home ? "font-bold text-ink" : "font-medium text-ink2")}>
          {m.awayTeam.name}
        </span>
        <TeamSignals side={s?.away} />
      </span>

      {/* важность / стадион */}
      <span className="flex justify-self-end">
        {important?.flag ? (
          <Trophy className="h-4 w-4 text-gold" aria-label="Важный матч" />
        ) : (
          <span className="hidden text-ink3 md:block" title={m.stadium ? `${m.stadium.name}${m.stadium.city ? `, ${m.stadium.city}` : ""}` : undefined}>
            <MapPin className="h-3.5 w-3.5" />
          </span>
        )}
      </span>
    </button>
  );
}

/** Компактные значки-сигналы рядом с именем команды */
function TeamSignals({ side }: { side?: MatchSignalSideDTO }) {
  if (!side) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <StreakMark streak={side.streak} compact />
      {side.topScorerOut && (
        <span title={`Не сыграет лучший бомбардир: ${side.topScorer?.name} (${side.topScorer?.goals} голов) — дисквалификация`} className="text-live">
          <UserX className="h-3.5 w-3.5" />
        </span>
      )}
      {side.newCoach && (
        <span title={`Новый тренер: ${side.newCoach.name}`} className="text-amber-300">
          <UserCog className="h-3.5 w-3.5" />
        </span>
      )}
    </span>
  );
}

/** Легенда условных обозначений — сворачиваемая, чтобы не занимать экран */
function SignalsLegend() {
  const items: { icon: React.ReactNode; text: string }[] = [
    { icon: <Flame className="h-3.5 w-3.5 streak-hot streak-hot-glow" />, text: "команда «на огне» — 5+ побед подряд" },
    { icon: <Snowflake className="h-3.5 w-3.5 streak-cold" />, text: "кризис — 5+ поражений подряд" },
    { icon: <Trophy className="h-3.5 w-3.5 text-gold" />, text: "важный матч: борьба за 1-е место или призы, финиш турнира" },
    { icon: <UserX className="h-3.5 w-3.5 text-live" />, text: "у команды не сыграет лучший бомбардир (дисквалификация)" },
    { icon: <UserCog className="h-3.5 w-3.5 text-amber-300" />, text: "у команды новый тренер (последние 30 дней)" },
    { icon: <span className="h-1.5 w-1.5 rounded-full bg-live" />, text: "LIVE — счёт обновляется автоматически; рядом идущая минута и время начала" },
    { icon: <span className="text-xs font-bold text-warn">Т</span>, text: "форма: В/Н/П — результат, Т — техпоражение, тВ — техпобеда" },
    { icon: <span className="font-mono text-xs text-ink3">— : —</span>, text: "матч ещё не сыгран (дата и время слева)" },
  ];
  return (
    <details className="group rounded-xl border border-sline bg-s1">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-2.5 text-xs font-semibold text-ink2 transition-colors hover:text-ink">
        <Info className="h-3.5 w-3.5 text-gold" />
        Условные обозначения — что смотреть в первую очередь
        <ChevronDown className="ml-auto h-4 w-4 text-ink3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-x-6 gap-y-2 border-t border-sline/60 px-4 py-3 text-xs text-ink3 sm:grid-cols-2">
        {items.map((it, i) => (
          <span key={i} className="flex items-center gap-2.5">
            <span className="flex w-5 shrink-0 justify-center">{it.icon}</span>
            {it.text}
          </span>
        ))}
      </div>
    </details>
  );
}
