"use client";

// Страница матча «Ночь под прожекторами»: чистый геро — команды и счёт,
// статус — под счётом (единая точка знаний: вся фактура живёт во вкладке
// «Превью» — дата, стадион, турнир, серии, H2H, кто отсутствует, судейская
// бригада целиком). Протокол — таблица событий по образцу futbol24
// (минута слева, бегущий счёт в центре).

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MapPin, Flag, ClipboardPen, Info, CalendarDays, Layers, Trophy, Ban,
  TriangleAlert, UserCog, Flame, Snowflake, ShieldAlert,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch, fmtShortDate } from "./hooks";
import { navigate, useSession } from "./router";
import type { MatchDTO, SessionUserDTO, StandingRowDTO, MatchSignalsDTO } from "./types";
import { STREAK_LABELS, STREAK_MIN, GOAL_STREAK_MIN } from "@/lib/labels";
import { matchScore, LoadingBlock, EmptyState, FormBadges } from "./ui-bits";
import { Breadcrumbs, Crest, Avatar } from "./visuals";
import { BallIcon } from "./EventIcons";
import MatchTimeline from "./MatchTimeline";
import MatchLineupsTab from "./MatchLineupsTab";

/** «за 1 матч» / «за 2 матча» / «за 5 матчей» — короткая нейтральная
 *  форма (фидбек 2026-10-06: длинное «за последние 5 матчей» — убрать) */
function lastMatchesWord(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? "матч" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "матча" : "матчей";
  return `за ${n} ${word}`;
}

/** «матч подряд» / «матча подряд» / «матчей подряд» — для серий 10+ */
function streakWord(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "матч подряд";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "матча подряд";
  return "матчей подряд";
}

interface EventRow {
  id: string;
  minute: number;
  stoppage?: number | null;
  type: string;
  person: { id: string; name: string };
  assist: { id: string; name: string } | null;
  teamId: string;
}

interface TeamInsightDTO {
  last5: { scored: number; conceded: number; matches: number } | null;
  /** серии «забывает/пропускает в каждом матче» (v1.0.46, порог показа 10+) */
  streaks?: { scored: number; conceded: number } | null;
  rout: { goals: number; opponent: string; date: string; score: string } | null;
  collapse: { goals: number; opponent: string; date: string; score: string } | null;
}

interface MatchDetail {
  match: MatchDTO & {
    events: EventRow[];
    lineups: { id: string; teamId: string; person: { id: string; name: string; position: string | null }; isStarter: boolean; number: number | null; regRole: string }[];
    season: { id: string; name: string } | null;
    referee: { id: string; name: string } | null;
    officials: { id: string; role: string; person: { id: string; name: string } }[];
    league: { id: string; name: string; walkoverScore: number; yellowCardLimit: number; format: string };
  };
  standings: StandingRowDTO[];
  h2h: {
    list: {
      id: string; kickoff: string; status: string; walkoverType: string | null;
      homeTeam: { id: string; name: string }; awayTeam: { id: string; name: string };
      homeScore: number | null; awayScore: number | null; regulationScore: number;
      season: { name: string; league: string };
    }[];
    summary: { homeWins: number; draws: number; awayWins: number };
  };
  missing: { teamId: string; entries: { personId: string; name: string; kind: "SUSPENSION" | "AT_RISK"; detail: string }[] }[];
  signals: MatchSignalsDTO | null;
  insights: { home: TeamInsightDTO; away: TeamInsightDTO };
}

interface Props {
  matchId: string;
  initial?: MatchDetail | null;
}

type Tab = "preview" | "timeline" | "lineups" | "table";

/** LIVE-минута (обновляется каждые 15 секунд): «● 67'» — без слов,
 *  только минута (какой счёт и какая минута — одним взглядом). */
function LiveClock({ kickoff, size = "base" }: { kickoff: string; size?: "base" | "sm" }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);
  const start = new Date(kickoff);
  const elapsed = Math.floor((Date.now() - start.getTime()) / 60000);
  const minuteLabel = elapsed >= 95 ? "90+" : `${Math.max(0, Math.min(90, elapsed))}'`;
  return (
    <span className={cn("flex items-center gap-1.5 tabular font-bold text-live", size === "base" ? "text-base" : "text-[13px]")}>
      <span className={cn("rounded-full bg-live live-dot", size === "base" ? "h-2 w-2" : "h-1.5 w-1.5")} />
      {minuteLabel}
    </span>
  );
}

export default function MatchPage({ matchId, initial }: Props) {
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<Tab>("preview");
  // сессия — на клиенте (SSR-страница остаётся кэшируемой для SEO)
  const { user } = useSession<SessionUserDTO>();
  const { data, error } = useFetch<MatchDetail>(`/api/public/matches/${matchId}`, version, initial);

  // LIVE: авто-обновление каждые 30 секунд — счёт и события подтягиваются сами
  const isLive = data?.match.status === "LIVE";
  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => setVersion((v) => v + 1), 30000);
    return () => clearInterval(t);
  }, [isLive]);

  const m = data?.match;
  const canEdit = m && user && ["REFEREE", "LEAGUE_ADMIN", "SUPER_ADMIN"].includes(user.role);
  const hasLineups = m && m.lineups.length > 0;
  const missing = data?.missing ?? [];
  const signals = data?.signals;

  if (error) return <EmptyState title="Матч не найден" hint={error} />;
  if (!data || !m) return <LoadingBlock label="Загрузка матча..." />;

  const score = matchScore(m);
  // время/дата начала — для статуса шапки (Р-17/Р-18)
  const kickoffTime = new Date(m.kickoff).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
  const tabs: { id: Tab; label: string; count?: number; hidden?: boolean }[] = [
    { id: "preview", label: "Превью" },
    { id: "timeline", label: "Протокол", count: m.events.length || undefined },
    { id: "lineups", label: "Составы", hidden: !hasLineups },
    { id: "table", label: "Таблица", hidden: data.standings.length === 0 },
  ];

  return (
    <div className="space-y-3">
      <Breadcrumbs
        items={[
          { label: "Главная", onClick: () => navigate("/") },
          { label: m.league.name, onClick: () => navigate(`/league/${m.league.id}`) },
          { label: `${m.homeTeam.name} — ${m.awayTeam.name}` },
        ]}
        className="px-1"
      />

      {/* ---------- Шапка матча (Р-17/Р-18, FS-паттерн): ДЕСКТОП ≥768px —
          карточка ≤88px, грид 3 колонок [этажи команд 1fr | статус auto |
          этажи счёта auto]; пустот между строками нет. МОБАЙЛ <768px —
          ≤132px: строка команды 1 [имя | счёт] → статусная строка на всю
          ширину по центру + бейдж inline → строка команды 2. ---------- */}
      <div data-match-hero className={cn("overflow-hidden rounded-lg border border-sline bg-s1", signals?.important.flag && "border-gold/40")}>
        {/* ДЕСКТОП (≥768px): 3×2-грид — статус по центру вертикали */}
        <div data-match-hero-body className="hidden min-[768px]:grid min-[768px]:grid-cols-[minmax(0,1fr)_auto_minmax(56px,auto)] min-[768px]:grid-rows-2 min-[768px]:items-center min-[768px]:gap-x-5 min-[768px]:gap-y-2 min-[768px]:px-4 min-[768px]:py-3">
          <HeroTeamRow
            teamId={m.homeTeam.id}
            name={m.homeTeam.name}
            logoUrl={m.homeTeam.logoUrl}
            win={!!score && score.home > score.away}
            status={m.status}
          />
          {/* статус — колонка по центру вертикали: минута/время 12px,
              бейдж «Важный матч» 11px под ним */}
          <div className="row-span-2 flex flex-col items-center justify-center gap-1 text-center">
            <MatchStatus m={m} kickoffTime={kickoffTime} />
            {signals?.important.flag && <ImportantBadge reason={signals.important.reason} />}
          </div>
          <HeroScore digit={score ? score.home : null} status={m.status} win={!!score && score.home > score.away} />
          <HeroTeamRow
            teamId={m.awayTeam.id}
            name={m.awayTeam.name}
            logoUrl={m.awayTeam.logoUrl}
            win={!!score && score.away > score.home}
            status={m.status}
          />
          <HeroScore digit={score ? score.away : null} status={m.status} win={!!score && score.away > score.home} />
        </div>

        {/* МОБАЙЛ (<768px): команда → статус → команда */}
        <div data-match-hero-body className="px-3 py-2.5 min-[768px]:hidden">
          <HeroTeamRow
            teamId={m.homeTeam.id}
            name={m.homeTeam.name}
            logoUrl={m.homeTeam.logoUrl}
            digit={score ? score.home : null}
            win={!!score && score.home > score.away}
            status={m.status}
          />
          {/* статусная строка на всю ширину, по центру; бейдж inline */}
          <div className="flex min-h-[28px] flex-wrap items-center justify-center gap-x-2 gap-y-0.5 py-1 text-center">
            <MatchStatus m={m} kickoffTime={kickoffTime} />
            {signals?.important.flag && <ImportantBadge reason={signals.important.reason} />}
          </div>
          <HeroTeamRow
            teamId={m.awayTeam.id}
            name={m.awayTeam.name}
            logoUrl={m.awayTeam.logoUrl}
            digit={score ? score.away : null}
            win={!!score && score.away > score.home}
            status={m.status}
          />
        </div>

        {m.note && <p className="border-t border-sline/60 bg-amber-400/10 px-3 py-2 text-center text-xs text-amber-300">{m.note}</p>}

        {canEdit && (m.status === "SCHEDULED" || m.status === "LIVE") && (
          <div className="border-t border-sline/60 p-3">
            <Button className="w-full bg-gold text-goldink hover:bg-gold/85" onClick={() => navigate(`/admin?match=${m.id}`)}>
              <ClipboardPen className="mr-1 h-4 w-4" /> Ввод протокола матча
            </Button>
          </div>
        )}

        {m.status === "WALKOVER" && (
          <div className="flex items-start gap-2 border-t border-sline/60 bg-s2/40 p-3 text-xs text-ink2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p>Матч не проводился: неявка команды. Голы и карточки таких матчей не учитываются в индивидуальной статистике.</p>
          </div>
        )}

        {/* Скан бумажного протокола — прикрепляется в админке */}
        {m.protocolUrl && (
          <a
            href={m.protocolUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 border-t border-sline/60 bg-s2/40 px-3 py-2.5 text-xs font-semibold text-gold hover:bg-gold/10"
          >
            <FileText className="h-4 w-4" />
            {m.protocolFileName?.toLowerCase().endsWith(".pdf") ? (m.protocolFileName ?? "Файл протокола (PDF)") : "Скан протокола матча"} — открыть
          </a>
        )}
      </div>

      {/* ---------- Вкладки: 13px/600, активная — золото + подчёркивание
          2px; счётчик событий — серым («Протокол · 6») ---------- */}
      <div className="overflow-hidden rounded-lg border border-sline bg-s1">
        <div className="flex gap-1 overflow-x-auto border-b border-sline/60 px-2 scrollbar-none">
          {tabs.filter((t) => !t.hidden).map((t) => (
            <button
              key={t.id}
              data-tab
              data-active={tab === t.id ? "true" : undefined}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative shrink-0 px-4 py-2.5 text-[13px] font-semibold transition-colors",
                tab === t.id ? "text-gold" : "text-ink2 hover:text-ink"
              )}
            >
              {t.label}
              {t.count != null && <span className="ml-1 text-ink3">· {t.count}</span>}
              {tab === t.id && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-gold" />}
            </button>
          ))}
        </div>

        {tab === "preview" && (
          <PreviewTab
            m={m}
            standings={data.standings}
            h2h={data.h2h}
            missing={missing}
            signals={signals}
            insights={data.insights}
          />
        )}
        {tab === "timeline" && <TimelineTab m={m} />}
        {tab === "lineups" && hasLineups && <MatchLineupsTab m={m} />}
        {tab === "table" && <StandingsTab standings={data.standings} homeId={m.homeTeam.id} awayId={m.awayTeam.id} />}
      </div>
    </div>
  );
}

// ================= Шапка: строка команды / счёт / статус =================

/** Строка команды шапки матча (Р-17/Р-18): герб 24px + название
 *  14px/600 слева; на мобиле — счёт 16px/700 справа (десктоп-грид
 *  рендерит счёт отдельной колонкой этажей). Имя ПЕРЕНОСИТСЯ
 *  (break-words) — ни одна буква не обрезается. */
function HeroTeamRow({
  teamId,
  name,
  logoUrl,
  digit,
  status,
  win,
}: {
  teamId: string;
  name: string;
  logoUrl?: string | null;
  digit?: number | null;
  status: string;
  win: boolean;
}) {
  const color = status === "LIVE" ? "text-live" : digit == null ? "text-ink3" : win ? "text-gold" : "text-ink2";
  return (
    <button className="flex w-full items-center gap-2.5 text-left" onClick={() => navigate(`/team/${teamId}`)}>
      <Crest name={name} id={teamId} logoUrl={logoUrl} size="xs" className="ring-1 ring-white/10" />
      <span className={cn("min-w-0 flex-1 break-words text-sm font-semibold", status === "LIVE" || win ? "text-ink" : "text-ink2")}>{name}</span>
      {digit != null && <span className={cn("shrink-0 tabular text-base font-bold", color)}>{digit}</span>}
    </button>
  );
}

/** Этаж счёта десктоп-гридa (Р-17): 16px/700, вправо; отдельная
 *  колонка «два этажа счёта», выровненная со строками команд. */
function HeroScore({ digit, status, win }: { digit: number | null; status: string; win: boolean }) {
  const color = status === "LIVE" ? "text-live" : digit === null ? "text-ink3" : win ? "text-gold" : "text-ink2";
  return (
    <span className={cn("tabular text-right text-base font-bold leading-tight", color)}>
      {digit ?? "—"}
    </span>
  );
}

/** Статус шапки (Р-17/Р-18): минута LIVE красным / время начала
 *  серым 12px; WO/перенос — свои строки. Одна точка знаний. */
function MatchStatus({ m, kickoffTime }: { m: NonNullable<MatchDetail["match"]>; kickoffTime: string }) {
  if (m.status === "LIVE") {
    return (
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
        <LiveClock kickoff={m.kickoff} size="sm" />
        <span className="text-xs text-ink3">с {kickoffTime}</span>
      </p>
    );
  }
  if (m.status === "SCHEDULED") {
    return (
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-xs">
        <span className="tabular font-semibold text-ink2">{kickoffTime}</span>
        <span className="text-ink3">
          {new Date(m.kickoff).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" })}
        </span>
      </p>
    );
  }
  if (m.status === "POSTPONED") {
    return <p className="text-xs font-semibold uppercase tracking-wide text-ink3">перенесён</p>;
  }
  if (m.status === "COMPLETED") {
    return <p className="text-xs text-ink3">Завершён</p>;
  }
  if (m.status === "WALKOVER") {
    return (
      <p className="text-xs text-amber-400">
        {m.walkoverType === "HOME" && `неявка хозяев · регламент ${m.regulationScore}:0`}
        {m.walkoverType === "AWAY" && `неявка гостей · регламент ${m.regulationScore}:0`}
        {m.walkoverType === "BOTH" && "обе неявки · 0:0"}
      </p>
    );
  }
  return null;
}

/** Бейдж «Важный матч» (Р-17): 11px, жёлтый на тёмной подложке */
function ImportantBadge({ reason }: { reason?: string }) {
  return (
    <p className="flex items-center gap-1.5 rounded-md badge-important px-2 py-0.5 text-[11px] font-bold" title={reason}>
      <Trophy className="h-3 w-3" /> Важный матч
    </p>
  );
}

/** Единый стиль строк статистики (фидбек 2026-10-06): «первая часть
 *  темнее, сама статистика — светлым». Метка — text-ink3 (приглушена),
 *  значение — text-ink/700 (ярко); note — приглушённый суффикс
 *  (соперник/дата). Иконка слева — опционально. */
function StatLine({
  icon,
  label,
  value,
  note,
  title,
  className,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-0.5 py-1 text-xs", className)} title={title}>
      {icon}
      <span className="min-w-0 break-words text-ink3">{label}</span>
      <span className="min-w-0 break-words font-bold text-ink">{value}</span>
      {note != null && <span className="min-w-0 break-words text-ink3">{note}</span>}
    </p>
  );
}

// ================= Превью матча =================

function PreviewTab({ m, standings, h2h, missing, signals, insights }: {
  m: NonNullable<MatchDetail["match"]>;
  standings: StandingRowDTO[];
  h2h: MatchDetail["h2h"];
  missing: MatchDetail["missing"];
  signals: MatchSignalsDTO | null | undefined;
  insights: { home: TeamInsightDTO; away: TeamInsightDTO };
}) {
  const kickoff = new Date(m.kickoff);
  const timeStr = kickoff.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

  return (
    <div className="space-y-3 p-3 sm:p-4">
      {/* ---------- Дата, стадион, турнир (Р-19 → фидбек 2026-10-06):
          каждая секция — ТРИ строки: [иконка + лейбл 10px UPPERCASE
          серый] → [значение 15px/700 белым] → [подстрока 12px]. Дата —
          ЦИФРАМИ (06.10.26), время — отдельной строкой (10:42 МСК).
          Десктоп ≥768px: 3 секции в ряд; мобильный: 3 блока друг под
          другом — всё коротко и с новой строки. ---------- */}
      <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-sline/50 bg-s2/30 min-[768px]:grid-cols-3">
        <div className="flex flex-col justify-center gap-0.5 border-b border-sline/60 px-3 py-2.5 min-[768px]:border-b-0 min-[768px]:border-r">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.6px] text-ink3">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" /> Начало
          </p>
          <p className="tabular text-[15px] font-bold leading-tight text-ink">{fmtShortDate(m.kickoff)}</p>
          <p className="tabular text-xs text-ink2">{timeStr} МСК</p>
        </div>
        <div className="flex flex-col justify-center gap-0.5 border-b border-sline/60 px-3 py-2.5 min-[768px]:border-b-0 min-[768px]:border-r">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.6px] text-ink3">
            <MapPin className="h-3.5 w-3.5 shrink-0" /> Стадион
          </p>
          {m.stadium ? (
            <button className="block min-w-0 text-left" onClick={() => navigate(`/stadium/${m.stadium!.id}`)}>
              <span className="block min-w-0 break-words text-[15px] font-bold leading-tight text-ink hover:text-gold">{m.stadium.name}</span>
              {m.stadium.city && <span className="block break-words text-xs text-ink2">{m.stadium.city}</span>}
            </button>
          ) : (
            <p className="text-[15px] font-bold text-ink3">не указан</p>
          )}
        </div>
        <div className="flex flex-col justify-center gap-0.5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.6px] text-ink3">
            <Layers className="h-3.5 w-3.5 shrink-0" /> Турнир
          </p>
          <button className="block min-w-0 text-left" onClick={() => navigate(`/league/${m.league.id}`)}>
            <span className="block min-w-0 break-words text-[15px] font-bold leading-tight text-ink hover:text-gold">
              {m.isFriendly ? "Товарищеский матч" : m.league.name}
            </span>
            {!m.isFriendly && (m.round || m.season?.name) && (
              <span className="block break-words text-xs text-ink2">
                {[m.round ? `${m.round}-й тур` : null, m.season?.name ?? null].filter(Boolean).join(" · ")}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ---------- Соперники: серии, форма, атака и оборона (Р-21):
          строка команды = [лого 24px + имя 14px/600] + кружки формы
          20px справа; под ней мета 12px серым; баннер серии — строка
          32px; примечание о дисквалификации — полноширинная строка
          12px красным у НИЖНЕЙ границы карточки. ---------- */}
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { team: m.homeTeam, side: "home" as const, sig: signals?.home, insight: insights.home },
          { team: m.awayTeam, side: "away" as const, sig: signals?.away, insight: insights.away },
        ].map(({ team, side, sig, insight }) => {
          const row = standings.find((r) => r.teamId === team.id);
          const streak = sig?.streak ?? null;
          const streakHot = !!streak && (streak.code === "W" || streak.code === "w") && streak.count >= STREAK_MIN;
          const streakCold = !!streak && (streak.code === "L" || streak.code === "T") && streak.count >= STREAK_MIN;
          return (
            <div key={team.id} className="flex flex-col overflow-hidden rounded-lg border border-sline/50">
              {/* строка команды: лого + имя + форма справа */}
              <button className="flex w-full items-center gap-2.5 px-3 pt-3 text-left hover:text-gold" onClick={() => navigate(`/team/${team.id}`)}>
                <Crest name={team.name} id={team.id} size="xs" />
                <span className="min-w-0 flex-1 break-words text-sm font-semibold text-ink">{team.name}</span>
                {row?.form && <FormBadges form={row.form.slice(-5)} size="sm" />}
              </button>
              {/* мета — 12px серым, значения чуть светлее (двухтон,
                фидбек 2026-10-06); одна-две строки с переносом */}
              <p className="px-3 pt-1 text-xs text-ink3">
                {sig?.position != null ? (
                  <>
                    №<span className="font-bold text-ink2">{sig.position}</span> в таблице ·{" "}
                    <span className="font-bold text-ink2">{sig.points}</span> очк. за {sig.games} игр
                  </>
                ) : (
                  "дебют сезона"
                )}
              </p>

              <div className="space-y-1.5 px-3 pb-3 pt-2 text-xs">
                {/* баннер серии 5+ — строка 32px (Р-21); без оценочных
                    подписей — эмодзи и счёт серии говорят сами */}
                {streakHot && (
                  <p className="flex h-8 items-center gap-1.5 rounded-md bg-ok/15 px-2.5 font-bold text-ok" title="Команда на серии побед">
                    <Flame className="h-4 w-4 streak-hot" />
                    {streak.count} {STREAK_LABELS[streak.code] ?? "матчей"} подряд
                  </p>
                )}
                {streakCold && (
                  <p className="flex h-8 items-center gap-1.5 rounded-md bg-live/10 px-2.5 font-bold text-live" title="Команда на серии поражений">
                    <Snowflake className="h-4 w-4" />
                    {streak.count} {STREAK_LABELS[streak.code] ?? "матчей"} подряд
                  </p>
                )}
                {sig?.newCoach && (
                  <p className="flex items-center gap-1.5 rounded-md bg-amber-400/10 px-2.5 py-1.5 font-semibold text-amber-300">
                    <UserCog className="h-4 w-4" />
                    новый тренер: {sig.newCoach.name}
                  </p>
                )}
                {sig?.topScorer && (
                  <StatLine
                    icon={<BallIcon className="h-3.5 w-3.5 shrink-0 text-gold" />}
                    label="бомбардир:"
                    value={`${sig.topScorer.name} · ${sig.topScorer.goals}`}
                    title="Лучший бомбардир команды в сезоне"
                  />
                )}
                {/* атака/оборона — только факты, в среднем за игру; форма
                    «за 5 матчей: 4,4 гола» (фидбек 2026-10-06: коротко и
                    нейтрально); пропущено — ТОЛЬКО за нормой (среднее ≥ 3,
                    фидбек: «не обязательно, если не выбивается за норму») */}
                {insight.last5 && (
                  <StatLine
                    label={`${lastMatchesWord(insight.last5.matches)}:`}
                    value={`${(insight.last5.scored / insight.last5.matches).toFixed(1).replace(".", ",")} гола`}
                    note={
                      insight.last5.conceded / insight.last5.matches >= 3
                        ? `пропущено ${(insight.last5.conceded / insight.last5.matches).toFixed(1).replace(".", ",")}`
                        : undefined
                    }
                    title="Средняя результативность за последние матчи"
                  />
                )}
                {/* серии «в каждом матче» — только 10+ (фидбек 2026-10-06) */}
                {insight.streaks != null && insight.streaks.scored >= GOAL_STREAK_MIN && (
                  <StatLine
                    icon={<BallIcon className="h-3.5 w-3.5 shrink-0 text-gold" />}
                    label="забивает:"
                    value={`${insight.streaks.scored} ${streakWord(insight.streaks.scored)}`}
                    title="Команда забивает в каждом матче — серия 10 и более"
                  />
                )}
                {insight.streaks != null && insight.streaks.conceded >= GOAL_STREAK_MIN && (
                  <StatLine
                    icon={<ShieldAlert className="h-3.5 w-3.5 shrink-0 text-live" />}
                    label="пропускает:"
                    value={`${insight.streaks.conceded} ${streakWord(insight.streaks.conceded)}`}
                    title="Команда пропускает в каждом матче — серия 10 и более"
                  />
                )}
                {/* максимальы из истории — нейтрально и коротко (фидбек
                    2026-10-06: «забивала/пропускала» — заменить) */}
                {insight.rout && (
                  <StatLine
                    icon={<Trophy className="h-3.5 w-3.5 shrink-0 text-gold" />}
                    label="макс. забито:"
                    value={insight.rout.score}
                    note={`— ${insight.rout.opponent} (${fmtShortDate(insight.rout.date)})`}
                    title="Самый результативный матч команды"
                  />
                )}
                {insight.collapse && (
                  <StatLine
                    icon={<ShieldAlert className="h-3.5 w-3.5 shrink-0 text-live" />}
                    label="макс. пропущено:"
                    value={insight.collapse.score}
                    note={`— ${insight.collapse.opponent} (${fmtShortDate(insight.collapse.date)})`}
                    title="Больше всех пропущено в одном матче"
                  />
                )}
              </div>

              {/* примечание о пропуске — полноширинная строка 12px
                  красным с ℹ у НИЖНЕЙ границы карточки (Р-21) */}
              {sig?.topScorerOut && (
                <p className="flex items-center gap-1.5 border-t border-sline/60 bg-live/[0.06] px-3 py-2 text-xs text-live" title="Лучший бомбардир дисквалифицирован — не сыграет">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 break-words">бомбардир {sig.topScorer?.name} пропускает матч (дисквалификация)</span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ---------- Личные встречи (в этом формате футбола) ---------- */}
      <section>
        <p className="mb-2 px-1 text-[13px] font-bold text-ink">Личные встречи</p>
        {h2h.list.length === 0 ? (
          <p className="rounded-lg border border-dashed border-sline px-3 py-4 text-center text-[13px] text-ink3">
            Команды ещё не встречались — это их первый матч в этом формате
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-ok/10 px-3 py-2 text-center">
                <p className="tabular text-lg font-bold text-ok">{h2h.summary.homeWins}</p>
                <p className="break-words text-[11px] font-medium uppercase tracking-[0.6px] text-ink3">победы · {m.homeTeam.name}</p>
              </div>
              <div className="rounded-lg bg-s2 px-3 py-2 text-center">
                <p className="tabular text-lg font-bold text-ink">{h2h.summary.draws}</p>
                <p className="text-[11px] font-medium uppercase tracking-[0.6px] text-ink3">ничьи</p>
              </div>
              <div className="rounded-lg bg-live/10 px-3 py-2 text-center">
                <p className="tabular text-lg font-bold text-live">{h2h.summary.awayWins}</p>
                <p className="break-words text-[11px] font-medium uppercase tracking-[0.6px] text-ink3">победы · {m.awayTeam.name}</p>
              </div>
            </div>
            <div className="mt-2 space-y-1">
              {h2h.list.slice(0, 5).map((g) => {
                const homeIsOurHome = g.homeTeam.id === m.homeTeam.id;
                const gscore = matchScore(g);
                const ourGoals = gscore ? (homeIsOurHome ? gscore.home : gscore.away) : null;
                const theirGoals = gscore ? (homeIsOurHome ? gscore.away : gscore.home) : null;
                const res = gscore ? (ourGoals! > theirGoals! ? "W" : ourGoals! < theirGoals! ? "L" : "D") : null;
                return (
                  <button
                    key={g.id}
                    onClick={() => navigate(`/match/${g.id}`)}
                    className="flex w-full items-center gap-3 rounded-lg border border-sline/50 bg-s2/30 px-3 py-2 text-left text-[13px] transition-colors hover:border-gold/40"
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                        res === "W" ? "bg-ok text-white" : res === "L" ? "bg-live text-white" : "bg-ink3 text-s0"
                      )}
                      title={res === "W" ? `Победа ${m.homeTeam.name}` : res === "L" ? `Победа ${m.awayTeam.name}` : "Ничья"}
                    >
                      {res ?? "·"}
                    </span>
                    <span className="w-14 shrink-0 text-xs text-ink3">{fmtShortDate(g.kickoff)}</span>
                    {/* имена переносятся (в две строки на мобиле), не режутся */}
                    <span className="min-w-0 flex-1 break-words text-ink2">
                      <span className="max-sm:block max-sm:break-words">{g.homeTeam.name}</span>
                      <span className="max-sm:hidden"> — </span>
                      <span className="max-sm:block max-sm:break-words">{g.awayTeam.name}</span>
                    </span>
                    <span className="hidden break-words text-xs text-ink3 md:block">{g.season.league}</span>
                    <span className={cn("shrink-0 tabular text-[13px] font-bold", g.status === "WALKOVER" ? "text-amber-400" : "text-ink")}>
                      {gscore ? `${gscore.home}:${gscore.away}` : "WO"}
                    </span>
                  </button>
                );
              })}
              {h2h.list.length > 5 && (
                <p className="px-3 pt-1 text-xs text-ink3">и ещё {h2h.list.length - 5} встреч в истории</p>
              )}
            </div>
          </>
        )}
      </section>

      {/* ---------- Кто пропускает матч ---------- */}
      {missing.length > 0 && (
        <section>
          <p className="mb-2 px-1 text-[13px] font-bold text-ink">Кто пропускает матч</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[m.homeTeam, m.awayTeam].map((team) => {
              const entries = missing.find((x) => x.teamId === team.id)?.entries ?? [];
              return (
                <div key={team.id} className="rounded-lg border border-sline/50 p-3">
                  <button className="mb-2 flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:text-gold" onClick={() => navigate(`/team/${team.id}`)}>
                    <Crest name={team.name} id={team.id} size="sm" />
                    <span className="text-[13px] font-bold text-ink2">{team.name}</span>
                  </button>
                  {entries.length === 0 ? null : (
                    entries.map((e) => (
                      <button
                        key={e.personId}
                        onClick={() => navigate(`/player/${e.personId}`)}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-shover",
                          e.kind === "SUSPENSION" ? "bg-live/[0.06]" : "bg-warn/[0.06]"
                        )}
                      >
                        {e.kind === "SUSPENSION" ? <Ban className="mt-0.5 h-4 w-4 shrink-0 text-live" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />}
                        <span className="min-w-0">
                          <span className="block break-words text-[13px] font-medium text-ink">{e.name}</span>
                          <span className="block text-xs text-ink3">{e.detail}</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ---------- Судейская бригада: только состав, без оценок ---------- */}
      {(m.referee || (m.officials?.length ?? 0) > 0) && <RefereeBlock m={m} referee={m.referee} />}
    </div>
  );
}

/** Блок судейской бригады: главный судья + официальные лица.
 *  Оценки судейства и комментарии убраны (фидбек v1.0.20): о судьях —
 *  только информация, кто обслуживал матч. */
function RefereeBlock({ m, referee }: {
  m: NonNullable<MatchDetail["match"]>;
  referee: { id: string; name: string } | null;
}) {
  const ROLE_NAMES: Record<string, string> = {
    REFEREE: "Главный судья",
    ASSISTANT_REFEREE: "Помощник судьи",
    FOURTH_OFFICIAL: "Резервный судья",
    VAR: "VAR-судья",
    AVAR: "Помощник VAR-судьи",
    INSPECTOR: "Инспектор",
    DELEGATE: "Делегат матча",
    DOCTOR: "Врач",
  };
  // бригада без главного судьи (он — отдельной карточкой выше)
  const brigade = (m.officials ?? []).filter((o) => !(o.role === "REFEREE" && referee && o.person.id === referee.id));

  return (
    <section>
      <p className="mb-2 px-1 text-[13px] font-bold text-ink">Судейская бригада</p>
      <div className="space-y-2 rounded-lg border border-sline/50 p-3">
        {referee ? (
          <button
            onClick={() => navigate(`/player/${referee.id}`)}
            className="flex w-full items-center gap-3 rounded-lg border border-sline/50 bg-s2/30 p-2.5 text-left transition-colors hover:border-gold/40"
          >
            <Avatar name={referee.name} id={referee.id} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block break-words font-bold text-ink">{referee.name}</span>
              <span className="text-xs text-ink3">главный судья матча · профиль →</span>
            </span>
            <Flag className="h-4 w-4 shrink-0 text-gold" />
          </button>
        ) : (
          <p className="px-1 text-xs text-ink3">главный судья не назначен</p>
        )}

        {brigade.length > 0 && (
          <div className="grid gap-1 sm:grid-cols-2">
            {brigade.map((o) => (
              <button
                key={o.id}
                onClick={() => navigate(`/player/${o.person.id}`)}
                className="flex items-center gap-2.5 rounded-md border border-sline/40 bg-s2/20 px-3 py-2 text-left transition-colors hover:border-gold/40"
              >
                <Avatar name={o.person.name} id={o.person.id} size="xs" />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[13px] font-medium text-ink2">{o.person.name}</span>
                  <span className="block text-xs text-ink3">{ROLE_NAMES[o.role] ?? o.role}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ================= Протокол (бывш. «Хронология»; v1.0.41 — переимено-
// вано по фидбеку 2026-10-02, состав вкладки — в MatchTimeline) =================

function TimelineTab({ m }: { m: NonNullable<MatchDetail["match"]> }) {
  // Завершённый матч: ось рендерится даже без событий — маркеры
  // «Перерыв 0:0 / Завершён» показывают, что матч сыгран до конца.
  if (m.events.length === 0 && m.status !== "COMPLETED") {
    return (
      <div className="p-3">
        <EmptyState
          icon={<BallIcon className="h-6 w-6 opacity-50 text-ink3" />}
          title="Событий пока нет"
          hint={m.status === "SCHEDULED" ? "Матч ещё не начался — события появятся во время игры" : "Протокол пуст"}
        />
      </div>
    );
  }

  return (
    // без обёртки-паддинга (Р-20/Р-30): строки таймлайна несут свои
    // 6px 12px — максимум событий в первый экран мобильного
    <div>
      <MatchTimeline
        events={m.events}
        homeTeamId={m.homeTeam.id}
        status={m.status}
        homeScore={m.homeScore}
        awayScore={m.awayScore}
        theme="dark"
        onPersonClick={(personId) => navigate(`/player/${personId}`)}
        className="[&>div:first-child]:border-t-0"
      />
    </div>
  );
}

// ================= Составы =================
// Вынесены в MatchLineupsTab (v1.0.28: старт/запас/штаб + номера на матч)

// ================= Таблица (обе команды подсвечены) =================

function StandingsTab({ standings, homeId, awayId }: { standings: StandingRowDTO[]; homeId: string; awayId: string }) {
  return (
    <div className="p-3">
      {/* Таблица (Р-28): [# | команда | И | В-Н-П | РМ | О (+ форма ≥768)],
          строки 36px, топ-3 — номер жёлтым, очки 13px/700. Мобильный
          (<480px): [# | команда | И | О], В-Н-П и РМ — второй строкой
          внутри ячейки команды; БЕЗ обрезаний и скрытых данных. */}
      <table className="w-full text-xs min-[480px]:text-[13px]">
        <thead className="hidden border-b border-sline/60 text-[11px] uppercase tracking-[0.6px] text-ink3 min-[480px]:table-header-group">
          <tr>
            <th className="w-6 px-1 py-2 text-center font-semibold">#</th>
            <th className="px-2 py-2 text-left font-semibold">Команда</th>
            <th className="w-10 px-1 py-2 text-center font-semibold" title="Игры">И</th>
            <th className="w-16 px-1 py-2 text-center font-semibold" title="Победы-ничьи-поражения">В-Н-П</th>
            <th className="w-10 px-1 py-2 text-center font-semibold" title="Разница мячей">РМ</th>
            <th className="w-10 px-1 py-2 text-center font-semibold" title="Очки">О</th>
            <th className="hidden w-28 px-1 py-2 text-center font-semibold min-[768px]:table-cell" title="Последние 5 матчей">Форма</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((r) => {
            const hl = r.teamId === homeId || r.teamId === awayId;
            return (
              <tr
                key={r.teamId}
                data-clickable
                className={cn("h-9 border-b border-sline/40 transition-colors last:border-b-0 hover:bg-shover", hl && "row-hl")}
                onClick={() => navigate(`/team/${r.teamId}`)}
              >
                <td className="px-1.5 text-center">
                  <span className={cn("tabular text-xs font-bold", r.position <= 3 ? "text-gold" : "text-ink2")}>{r.position}</span>
                </td>
                <td className="px-1.5 max-sm:px-1.5">
                  <span className="flex items-center gap-2">
                    <Crest name={r.teamName} id={r.teamId} size="xs" />
                    <span className={cn("min-w-0 break-words", hl ? "font-bold text-ink" : "font-medium text-ink2")}>{r.teamName}</span>
                  </span>
                  {/* мобайл: В-Н-П, мячи и форма — второй строкой под командой */}
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 tabular text-[11px] text-ink3 min-[480px]:hidden">
                    <span>В-Н-П {r.wins}-{r.draws}-{r.losses}</span>
                    <span title={`Забито ${r.goalsFor} : пропущено ${r.goalsAgainst}`}>
                      РМ {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
                    </span>
                    <FormBadges form={r.form.slice(-3)} />
                  </span>
                </td>
                <td className="px-1 text-center tabular text-ink2">{r.games}</td>
                <td className="hidden px-1 text-center tabular text-ink2 min-[480px]:table-cell">{r.wins}-{r.draws}-{r.losses}</td>
                <td className="hidden px-1 text-center tabular text-ink2 min-[480px]:table-cell" title={`Забито ${r.goalsFor} : пропущено ${r.goalsAgainst}`}>
                  {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
                </td>
                <td className="px-1.5 text-center">
                  <span className="tabular text-[13px] font-bold text-gold">{r.points}</span>
                </td>
                <td className="hidden px-1 min-[768px]:table-cell"><div className="flex justify-center"><FormBadges form={r.form} /></div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
