"use client";

// Главная — livescore-лента «Ночь под прожекторами» (директива Р-09…Р-16):
// фильтры даты/статуса, матчи по лигам, избранное-звёзды, LIVE-минуты,
// «эмоции турнира» (серии, важные матчи, пропуски бомбардиров) + легенда.
// Р-11: панель даты — ОДНА строка 48px: ‹ [дата: жёлтый фон] › + календарь
// слева, ● Live / Завершённые справа (12px/600). Р-12: шапка группы лиги —
// одна строка, ☆ ≡ прижаты вправо. Р-13/14: строка матча — мобильная
// grid 48|1fr|32px min-h 52px (время слева, команды этажами слева, счёт
// этажами вправо), десктоп ≥768px — одна строка 44px со счёт-бейджем
// bg #1A1F2E. Р-29: слот AD-INFEED — после каждых 2 групп лиг.

import { Fragment, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Flame, Info, ListOrdered, MapPin, Snowflake, Star, Trophy, UserCog, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch } from "./hooks";
import { navigate, mskDay } from "./router";
import { useFavs, toggleFavLeague } from "./favs";
import type { BannerDTO, MatchDayDTO, OverviewDTO, LivescoreMatchDTO, MatchSignalSideDTO } from "./types";
import { FormatChip, AdSlot } from "./visuals";
import { LoadingBlock, matchScore, EmptyState, StreakMark } from "./ui-bits";

interface Props {
  format: string;
  overview: OverviewDTO | null;
  version: number;
  /** SSR-данные ленты «сегодня» — мгновенная гидратация без скелетона */
  initialDay?: { leagues: MatchDayDTO[] } | null;
  /** Р-29: слоты AD-INFEED — после каждых 2–3 групп лиг */
  infeedBanners?: BannerDTO[];
}

type StatusFilter = "all" | "live" | "finished";

/** Лимит промотки дат влево/вправо от сегодня */
const DATE_RANGE = 10;

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "finished", label: "Завершённые" },
];

export default function MatchDayView({ format, version, initialDay, infeedBanners }: Props) {
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

  /** Дата в человекочитаемом виде: «Среда, 16 сентября» — без слов
 *  «сегодня/вчера/завтра»: кнопка фиксированной ширины, подпись не
 *  прыгает при перелистывании дней. На мобиле — без дня недели и с
 *  кратким месяцем («16 сент.»): фильтр в одну строку (фидбек
 *  2026-09-29: «убери подпись дня недели, всё в одну строку»). */
  const dateLabel = useMemo(() => {
    const d = new Date(`${dateParam}T12:00:00+03:00`);
    const label = d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Moscow" });
    return label.replace(/^./, (c) => c.toUpperCase());
  }, [dateParam]);
  const dateLabelShort = useMemo(() => {
    const d = new Date(`${dateParam}T12:00:00+03:00`);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Moscow" });
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

  /** Слот AD-INFEED: после каждой 2-й группы лиг (Р-29), ротация
   *  креативов по кругу, 100% × 100px (внешние) / auto (свои промо). */
  const infeedAfter = (groupIndex: number): BannerDTO | null => {
    if (!infeedBanners?.length) return null;
    if ((groupIndex + 1) % 2 !== 0) return null; // после 2-й, 4-й, 6-й…
    const slot = Math.floor((groupIndex + 1) / 2) - 1;
    return infeedBanners[slot % infeedBanners.length] ?? null;
  };

  return (
    <div className="space-y-3">
      {/* ---------- Панель даты и фильтров (Р-11 + фидбек 2026-10-01):
          ВСЕГДА ОДНА строка h-12 на ЛЮБОМ девайсе (даже iPhone SE 375px /
          Android 360px): [‹ 32] [дата] [› 32] … [● Live][Завершённые].
          Перенос на вторую строку ЗАПРЕЩЁН (верстка «ехала» на SE).
          Календарь — только ≥640px (на мобиле достаточно ‹ ›);
          на совсем узких (<340px) — горизонтальный скролл ВНУТРИ
          панели (страница не расширяется). ---------- */}
      <div className="overflow-hidden rounded-lg border border-sline bg-s1">
        <div className="flex h-12 items-center gap-x-2 overflow-x-auto px-3 scrollbar-none min-[480px]:gap-x-3">
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => { setDayOffset((o) => Math.max(-DATE_RANGE, o - 1)); setCustomDate(null); }}
              disabled={dayOffset <= -DATE_RANGE && !customDate}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-s2 text-ink2 transition-colors hover:bg-gold hover:text-goldink disabled:opacity-30 disabled:hover:bg-s2"
              aria-label="Предыдущий день"
              title={dayOffset <= -DATE_RANGE ? "Дальше 10 дней назад нельзя" : "На день назад"}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {/* кнопка даты: жёлтый фон, чёрный текст 12px/700 — главный
                контроль строки (Р-11). v1.0.44 (фидбек 2026-10-05):
                ФИКСИРОВАННАЯ ширина на любом экране — при перелистывании
                дат подпись («Среда, 16 сентября» ↔ «Суббота, 20 сентября»)
                меняет длину, и кнопка «дышала», дёргая строку фильтров.
                Ширины подобраны под самый длинный вариант подписи:
                мобайл «31 дек.» → w-[88px]; ≥640px «Понедельник, 30
                сентября» → w-[196px]; текст центрируется, tabular-цифры. */}
            <button
              onClick={() => { setDayOffset(0); setCustomDate(null); }}
              className={cn(
                "flex h-8 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular transition-colors w-[88px]",
                "sm:w-[196px]",
                isToday ? "bg-gold text-goldink hover:bg-gold/85" : "bg-gold/90 text-goldink hover:bg-gold"
              )}
              title={isToday ? "Текущая дата" : "Вернуться к сегодня"}
            >
              <span className="truncate whitespace-nowrap sm:hidden">{dateLabelShort}</span>
              <span className="hidden truncate whitespace-nowrap sm:inline">{dateLabel}</span>
            </button>
            <button
              onClick={() => { setDayOffset((o) => Math.min(DATE_RANGE, o + 1)); setCustomDate(null); }}
              disabled={dayOffset >= DATE_RANGE && !customDate}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-s2 text-ink2 transition-colors hover:bg-gold hover:text-goldink disabled:opacity-30 disabled:hover:bg-s2"
              aria-label="Следующий день"
              title={dayOffset >= DATE_RANGE ? "Дальше 10 дней вперёд нельзя" : "На день вперёд"}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {/* произвольная дата — иконка календаря ≥640px (на мобиле
                только ‹ › — фидбек 2026-09-29 + 2026-10-01 «одна строка») */}
            <label
              className="relative hidden h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-s2 text-ink2 transition-colors hover:bg-gold hover:text-goldink sm:flex"
              title="Выбрать дату в календаре"
            >
              <CalendarDays className="h-4 w-4" />
              <input
                type="date"
                value={customDate ?? ""}
                onChange={(e) => e.target.value && setCustomDate(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Выбор даты"
              />
            </label>
            {customDate && (
              <button onClick={() => setCustomDate(null)} className="shrink-0 whitespace-nowrap text-xs font-semibold text-gold hover:text-gold/80" title="Вернуться к сегодня">
                сброс
              </button>
            )}
          </div>
          {/* Статус: ● Live / Завершённые — 12px/600, точка+текст (Р-11);
              активный — цветной, без залитых плашек; компактные
              паддинги px-2 чтобы «Завершённые» влезала рядом с датой
              на 375px В ОДНУ СТРОКУ (фидбек 2026-10-01) */}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 min-[480px]:gap-2">
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
                    "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 min-[480px]:px-2.5 text-xs font-semibold transition-colors whitespace-nowrap",
                    active
                      ? t.id === "live"
                        ? "bg-live/10 text-live"
                        : "bg-s2 text-ink"
                      : "text-ink2 hover:text-ink"
                  )}
                >
                  {t.id === "live" && (
                    <span className={cn("inline-block h-1.5 w-1.5 rounded-full bg-live", active && "live-dot")} aria-hidden />
                  )}
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
        <EmptyState title="В этот день матчей нет" hint="Промотайте даты стрелками ‹ ›" />
      )}
      {leagues.map((l, i) => (
        <Fragment key={l.league.id}>
          <section className="overflow-hidden rounded-lg border border-sline bg-s1">
          {/* Заголовок лиги (Р-12): ОДНА строка — [название 13px/700 +
              «· Сезон 2026» 12px серый, flex:1, перенос по словам] |
              [☆ ≡ справа, nowrap]. Высота 40–44px. */}
          <div className="flex min-h-[40px] items-center gap-2 border-b border-sline/60 bg-s2/40 px-3 py-2">
            {/* бейдж формата: на мобильном скрыт — формат уже выбран
                фильтром в шапке, а имя лиги важнее */}
            <FormatChip format={l.league.format} className="max-sm:hidden" />
            <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5">
              {l.league.id !== "friendly" ? (
                <button
                  onClick={() => navigate(`/league/${l.league.id}`)}
                  className="min-w-0 break-words text-left text-[13px] font-bold text-ink hover:text-gold"
                >
                  {l.league.name}
                </button>
              ) : (
                <span className="min-w-0 break-words text-[13px] font-bold text-ink2">{l.league.name}</span>
              )}
              {l.season.name && <span className="text-xs text-ink3">· {l.season.name}</span>}
            </span>
            {l.league.id !== "friendly" && (
              <div className="flex shrink-0 flex-nowrap items-center gap-1">
                <button
                  onClick={() => toggleFavLeague(l.league.id)}
                  className={cn("flex h-7 w-7 items-center justify-center rounded-md transition-colors", favs.includes(l.league.id) ? "text-gold" : "text-ink3 hover:text-ink2")}
                  aria-label={favs.includes(l.league.id) ? "Убрать из избранного" : "Добавить в избранное"}
                  title={favs.includes(l.league.id) ? "Убрать из избранного" : "В избранное"}
                >
                  <Star className={cn("h-4 w-4", favs.includes(l.league.id) && "fill-gold")} />
                </button>
                <button
                  onClick={() => navigate(`/league/${l.league.id}/table`)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-gold transition-colors hover:bg-gold/10 hover:text-gold"
                  aria-label="Таблица лиги"
                  title="Таблица лиги"
                >
                  <ListOrdered className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
          {l.matches.map((m) => <MatchRow key={m.id} m={m} />)}
        </section>
          {/* Р-29: слот AD-INFEED — после каждой 2-й группы лиг,
              100% × 100px (внешний креатив) / auto (свой промо) */}
          <AdSlot banner={infeedAfter(i)} fixedHeight={100} />
        </Fragment>
      ))}

      <SignalsLegend />
    </div>
  );
}

/** Строка матча (директива Р-13/Р-14):
 *
 *  МОБАЙЛ (<768px) — grid 48px | 1fr | 32px, padding 8px 12px,
 *    min-height 52px, ДВА ЭТАЖА:
 *    [время/live-минута + «с 17:36» 11px] [имя хозяев······счёт]
 *                                        [имя гостей······счёт]
 *    имена — ПО ЛЕВОМУ КРАЮ колонки, 13px, line-height 18px,
 *    иконки-сигналы inline перед именем 14px; счёт 13px/700 вправо.
 *  ДЕСКТОП (≥768px) — ОДНА строка 44px:
 *    [время 44px][хозяева 1fr вправо][счёт-бейдж: bg #1A1F2E,
 *    radius 6px, padding 4px 10px, 13px/700][гости 1fr влево]
 *    [иконки 24px].
 *
 *  Типографика FS (Р-02): имя 13px/400 (bold — только LIVE),
 *  счёт 13px/700 tabular, время/статус 12px/400 серый (live —
 *  красный + пульс точки). ПРАВИЛО «НИ ОДНА БУКВА НЕ ОБРЕЗАЕТСЯ»:
 *  имена переносятся (break-words, высота строки auto по
 *  min-height), никаких ellipsis. */
function MatchRow({ m }: { m: LivescoreMatchDTO }) {
  const score = matchScore(m);
  const time = new Date(m.kickoff);
  const timeStr = time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
  const dateStr = time.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "Europe/Moscow" });

  const s = m.signals;
  const important = s?.important;
  const elapsed = Math.floor((Date.now() - time.getTime()) / 60000);
  const liveMinute = elapsed >= 95 ? "90+" : `${Math.max(0, Math.min(90, elapsed))}'`;

  // подсветка цифр: LIVE — красный, технический — янтарный, иначе
  // выигравшая сторона ярче (симметрично подсветке имён команд)
  const hot = m.status === "LIVE" ? "text-live" : m.status === "WALKOVER" ? "text-amber-400" : null;
  const digit = (win: boolean, empty: boolean) =>
    hot ?? (empty ? "text-ink3" : win ? "text-ink" : "text-ink2");
  // имя: вес 400 всегда (FS), bold — только у LIVE-матча
  const nameCls = (win: boolean) =>
    cn(
      "min-w-0 break-words text-[13px] leading-[18px]",
      m.status === "LIVE" && "font-semibold",
      m.status === "LIVE" ? "text-ink" : win ? "text-ink" : "text-ink2"
    );

  /** ячейка времени/статуса (Р-13): 12px/400 серый; LIVE — красный
   *  с пульсирующей точкой; на мобиле под ним «с 17:36» 11px */
  const StatusCell = ({ mobile }: { mobile?: boolean }) => (
    <span className={cn("flex min-w-0 flex-col items-center", mobile ? "items-center" : "items-center")}>
      {m.status === "LIVE" ? (
        <>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-live live-dot" />
            <span className="tabular text-xs text-live">{liveMinute}</span>
          </span>
          {mobile && <span className="tabular text-[11px] leading-tight text-ink3">с {timeStr}</span>}
        </>
      ) : m.status === "POSTPONED" ? (
        <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-ink3">перенесён</span>
      ) : m.status === "SCHEDULED" ? (
        <>
          {important?.flag && <Trophy className="h-3 w-3 shrink-0 text-gold" aria-label="Важный матч" />}
          <span className="tabular text-xs text-ink2">{timeStr}</span>
        </>
      ) : (
        <span className="tabular text-xs text-ink3">{dateStr}</span>
      )}
    </span>
  );

  return (
    <button
      data-match-row
      onClick={() => navigate(`/match/${m.id}`)}
      title={important?.flag ? important.reason : undefined}
      className={cn(
        "w-full border-b border-sline/40 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-shover min-h-[52px] min-[768px]:min-h-11",
        m.status === "LIVE" && "bg-live/[0.06]",
        important?.flag && "match-important"
      )}
    >
      {/* ---------- МОБАЙЛ (<768px): два этажа, время слева (Р-13).
          min-height 52px — на ВСЕЙ строке (с паддингом 8px 12px): этажи
          по 18px + 16px паддинга = ровно 52 ---------- */}
      <div className="grid grid-cols-[48px_minmax(0,1fr)_32px] grid-rows-2 items-center gap-x-2 min-[768px]:hidden">
        <span className="row-span-2 self-center">
          <StatusCell mobile />
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <TeamSignals side={s?.home} />
          <span className={nameCls(!!score && score.home > score.away)}>{m.homeTeam.name}</span>
        </span>
        <span className={cn("tabular text-right text-[13px] font-bold leading-[18px]", digit(!!score && score.home > score.away, !score))}>
          {score ? score.home : "—"}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <TeamSignals side={s?.away} />
          <span className={nameCls(!!score && score.away > score.home)}>{m.awayTeam.name}</span>
        </span>
        <span className={cn("tabular text-right text-[13px] font-bold leading-[18px]", digit(!!score && score.away > score.home, !score))}>
          {score ? score.away : "—"}
        </span>
      </div>

      {/* ---------- ДЕСКТОП (≥768px): одна строка, min-h 44px на кнопке
          (Р-14) ---------- */}
      <div className="hidden min-[768px]:grid min-[768px]:grid-cols-[44px_minmax(0,1fr)_auto_minmax(0,1fr)_24px] min-[768px]:items-center min-[768px]:gap-x-2">
        <StatusCell />
        {/* хозяева: имя прижато к счёту (вправо), сигналы левее */}
        <span className="flex min-w-0 flex-row-reverse items-center gap-1.5">
          <span className={nameCls(!!score && score.home > score.away)}>{m.homeTeam.name}</span>
          <TeamSignals side={s?.home} />
        </span>
        {/* счёт-бейдж (Р-14): bg #1A1F2E, radius 6px, padding 4px 10px,
            13px/700 tabular — «2:1» одним бейджем */}
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md bg-s2 px-2.5 py-1 tabular text-[13px] font-bold",
            hot ?? "text-ink"
          )}
          title="Счёт матча"
        >
          {score ? `${score.home}:${score.away}` : <span className="text-ink3">— : —</span>}
        </span>
        {/* гости: имя рядом со счётом (влево), сигналы правее */}
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={nameCls(!!score && score.away > score.home)}>{m.awayTeam.name}</span>
          <TeamSignals side={s?.away} />
        </span>
        {/* важность / стадион — колонка 24px */}
        <span className="flex items-center justify-end">
          {important?.flag ? (
            <Trophy className="h-4 w-4 text-gold" aria-label="Важный матч" />
          ) : (
            <span
              className="text-ink3"
              title={m.stadium ? `${m.stadium.name}${m.stadium.city ? `, ${m.stadium.city}` : ""}` : undefined}
            >
              <MapPin className="h-3.5 w-3.5" />
            </span>
          )}
        </span>
      </div>
    </button>
  );
}

/** Компактные значки-сигналы рядом с именем команды (14px, Р-13) */
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
    { icon: <Trophy className="h-3.5 w-3.5 text-gold" />, text: "важный матч — помечен администратором в карточке матча (дерби, борьба за 1-е место, плей-офф)" },
    { icon: <UserX className="h-3.5 w-3.5 text-live" />, text: "у команды не сыграет лучший бомбардир (дисквалификация)" },
    { icon: <UserCog className="h-3.5 w-3.5 text-amber-300" />, text: "у команды новый тренер (последние 30 дней)" },
    { icon: <span className="h-1.5 w-1.5 rounded-full bg-live" />, text: "LIVE — счёт обновляется автоматически; идущая минута — красным, слева от команд" },
    { icon: <span className="text-xs font-bold text-warn">Т</span>, text: "форма: В/Н/П — результат, Т — техпоражение, тВ — техпобеда" },
    { icon: <span className="font-mono text-xs text-ink3">— : —</span>, text: "матч ещё не сыгран (время начала — слева, в колонке статуса)" },
  ];
  return (
    <details className="group rounded-lg border border-sline bg-s1">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2.5 text-xs font-semibold text-ink2 transition-colors hover:text-ink">
        <Info className="h-3.5 w-3.5 text-gold" />
        Условные обозначения — что смотреть в первую очередь
        <ChevronDown className="ml-auto h-4 w-4 text-ink3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-x-6 gap-y-2 border-t border-sline/60 px-3 py-3 text-xs text-ink3 sm:grid-cols-2">
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
