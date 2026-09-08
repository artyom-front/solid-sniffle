"use client";

// Главная — livescore-лента «Ночь под прожекторами»:
// фильтры даты/статуса, матчи по лигам, избранное-звёзды, LIVE-минуты,
// «эмоции турнира» (серии, важные матчи, пропуски бомбардиров) + легенда.

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Flame, Info, MapPin, Snowflake, Star, Trophy, UserCog, UserX } from "lucide-react";
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

/** Лимит промотки дат в обе стороны от сегодня (дней) */
const DATE_SPAN = 10;

type StatusFilter = "all" | "live" | "finished";

export default function MatchDayView({ format, version, initialDay }: Props) {
  // дата: смещение от сегодня в днях, −DATE_SPAN…+DATE_SPAN
  const [dayOffset, setDayOffset] = useState(0);
  // статусы — два взаимоисключающих тумблера; оба отжаты = «все»
  const [liveOnly, setLiveOnly] = useState(false);
  const [finishedOnly, setFinishedOnly] = useState(false);
  const [liveTick, setLiveTick] = useState(0); // авто-обновление при LIVE
  const favs = useFavs();

  const isToday = dayOffset === 0;
  const dateParam = mskDay(dayOffset);
  const status: StatusFilter = liveOnly ? "live" : finishedOnly ? "finished" : "all";
  const { data, loading, error } = useFetch<{ leagues: MatchDayDTO[] }>(
    `/api/public/matches/day?date=${dateParam}&format=${format}`,
    version + liveTick,
    // SSR отдаёт ленту «сегодня» в текущем формате — используем её как стартовое состояние
    isToday && initialDay ? initialDay : null
  );

  // дата в шапке фильтра: «пт 05.09» (МСК), сегодня — с подписью «Сегодня»
  const dateLabel = useMemo(() => {
    const d = new Date(`${dateParam}T12:00:00Z`);
    const short = d
      .toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Moscow" })
      .replace(",", "");
    return short;
  }, [dateParam]);

  const shiftDay = (delta: number) => {
    setDayOffset((o) => Math.max(-DATE_SPAN, Math.min(DATE_SPAN, o + delta)));
  };

  // тумблер Live: нажатие — только лайвы (возвращаемся к сегодня: лайвы
  // бывают только сегодня); отжатие — все статусы
  const toggleLive = () => {
    setLiveOnly((on) => {
      if (!on) {
        setFinishedOnly(false);
        setDayOffset(0);
      }
      return !on;
    });
  };

  // тумблер «Завершённые»: взаимоисключающ с Live; фильтр — текущая дата
  // (сегодня), поэтому при включении возвращаемся к сегодня
  const toggleFinished = () => {
    setFinishedOnly((on) => {
      if (!on) {
        setLiveOnly(false);
        setDayOffset(0);
      }
      return !on;
    });
  };

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
    // Избранные лиги — вверху ленты
    return filtered.sort((a, b) => Number(favs.includes(b.league.id)) - Number(favs.includes(a.league.id)));
  }, [data, status, favs]);

  const totalMatches = leagues.reduce((sum, l) => sum + l.matches.length, 0);

  // пустое состояние: подсказка зависит от включённых фильтров и даты
  const emptyHint =
    liveOnly && !isToday
      ? "LIVE-матчи бывают только сегодня — вернитесь кнопкой «Сегодня»"
      : liveOnly
        ? "Сейчас нет идущих матчей — счёт обновится автоматически"
        : finishedOnly
          ? "Завершённых матчей в этот день пока нет"
          : "Листайте стрелками соседние дни — матчи неподалёку";

  return (
    <div className="space-y-3">
      {/* ---------- Фильтры: дата (< Сегодня >) + статусы (Live / Завершённые) ---------- */}
      <div className="rounded-xl border border-sline bg-s1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          {/* промотка дат: назад/вперёд максимум на DATE_SPAN дней */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => shiftDay(-1)}
              disabled={dayOffset <= -DATE_SPAN}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-s2 text-ink2 transition-colors hover:bg-s3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Предыдущий день"
              title={dayOffset <= -DATE_SPAN ? `Дальше ${DATE_SPAN} дней назад — нельзя` : "Предыдущий день"}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="min-w-[112px] text-center text-sm font-semibold tabular text-ink">
              {isToday ? (
                <>
                  <span className="text-gold">Сегодня</span>
                  <span className="ml-1.5 font-medium text-ink3">{dateLabel}</span>
                </>
              ) : (
                dateLabel
              )}
            </span>

            <button
              onClick={() => shiftDay(1)}
              disabled={dayOffset >= DATE_SPAN}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-s2 text-ink2 transition-colors hover:bg-s3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Следующий день"
              title={dayOffset >= DATE_SPAN ? `Дальше ${DATE_SPAN} дней вперёд — нельзя` : "Следующий день"}
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            {/* быстрый возврат к сегодня */}
            <button
              onClick={() => setDayOffset(0)}
              disabled={isToday}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:cursor-default",
                isToday ? "text-ink3" : "bg-s2 text-ink2 hover:bg-s3 hover:text-ink"
              )}
            >
              Сегодня
            </button>
          </div>

          {/* статусы: два тумблера, оба отжаты = все матчи */}
          <div className="ml-auto flex gap-1">
            <button
              onClick={toggleLive}
              aria-pressed={liveOnly}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                liveOnly ? "bg-live text-white" : "bg-s2 text-ink2 hover:text-ink"
              )}
            >
              <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle", liveOnly ? "bg-white live-dot" : "bg-live")} />
              Live
            </button>
            <button
              onClick={toggleFinished}
              aria-pressed={finishedOnly}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                finishedOnly ? "bg-gold text-goldink" : "bg-s2 text-ink2 hover:text-ink"
              )}
            >
              Завершённые
            </button>
          </div>
        </div>
      </div>

      {/* ---------- Лента матчей по лигам ---------- */}
      {loading && !data && <LoadingBlock label="Загрузка матчей..." />}
      {error && <EmptyState title="Не удалось загрузить матчи" hint={error} />}
      {data && totalMatches === 0 && (
        <EmptyState title="Матчей не найдено" hint={emptyHint} />
      )}
      {leagues.map((l) => (
        <section key={l.league.id} className="overflow-hidden rounded-xl border border-sline bg-s1">
          {/* Заголовок лиги */}
          <div className="flex items-center gap-2 border-b border-sline/60 bg-s2/50 px-4 py-2.5">
            <FormatChip format={l.league.format} />
            <button
              onClick={() => navigate(`/league/${l.league.id}`)}
              className="text-sm font-bold text-ink hover:text-gold"
            >
              {l.league.name}
            </button>
            <span className="hidden text-xs text-ink3 sm:inline">· {l.season.name}</span>
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
