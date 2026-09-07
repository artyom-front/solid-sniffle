"use client";

// Страница матча «Ночь под прожекторами»: геро с формой и сериями обеих команд,
// LIVE-минута и время начала. Вкладки: Превью (открывается первой: дата, стадион,
// H2H в этом формате, кто отсутствует, серии 5+ и разгромы 10+) · Хронология ·
// Составы · Таблица. В хронологии иконки событий говорят сами за себя — подписи
// только там, где иконка не передаёт деталей (пенальти, автогол, вердикт VAR).

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Star, MapPin, Flag, ClipboardPen, Info, CalendarDays, Layers, Trophy, Ban,
  TriangleAlert, UserX, UserCog, ArrowDown, ArrowUp, Flame, Snowflake, ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch, fmtDate, fmtShortDate, apiPost } from "./hooks";
import { navigate, useSession } from "./router";
import type { MatchDTO, SessionUserDTO, StandingRowDTO, MatchSignalsDTO } from "./types";
import { EVENT_SHORT_LABELS, STREAK_LABELS, STREAK_MIN } from "@/lib/labels";
import { StatusBadge, matchScore, LoadingBlock, EmptyState, FormBadges, StreakMark } from "./ui-bits";
import { Breadcrumbs, Crest, Avatar } from "./visuals";
import { EventIcon, BallIcon } from "./EventIcons";

/** «за последний матч» / «за последние 2 матча» / «за последние 5 матчей» */
function lastMatchesWord(n: number): string {
  if (n === 1) return "последний матч";
  const m10 = n % 10, m100 = n % 100;
  const word = m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "матча" : "матчей";
  return `последние ${n} ${word}`;
}
/** «1 оценка» / «2 оценки» / «5 оценок» */
function ratingsWord(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} оценка`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} оценки`;
  return `${n} оценок`;
}

interface EventRow {
  id: string;
  minute: number;
  type: string;
  person: { id: string; name: string };
  assist: { id: string; name: string } | null;
  teamId: string;
}

interface TeamInsightDTO {
  last5: { scored: number; conceded: number; matches: number } | null;
  rout: { goals: number; opponent: string; date: string; score: string } | null;
  collapse: { goals: number; opponent: string; date: string; score: string } | null;
}

interface MatchDetail {
  match: MatchDTO & {
    events: EventRow[];
    lineups: { id: string; teamId: string; person: { id: string; name: string; position: string | null }; isStarter: boolean; number: number | null }[];
    ratings: { id: string; rating: number; comment: string | null; authorRole: string }[];
    season: { id: string; name: string };
    referee: { id: string; name: string } | null;
    league: { id: string; name: string; walkoverScore: number; yellowCardLimit: number };
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
  signals: MatchSignalsDTO;
  insights: { home: TeamInsightDTO; away: TeamInsightDTO };
}

interface Props {
  matchId: string;
  initial?: MatchDetail | null;
}

type Tab = "preview" | "timeline" | "lineups" | "table";

/** LIVE-часы: идущая минута + время начала (обновляется каждые 15 секунд) */
function LiveClock({ kickoff }: { kickoff: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);
  const start = new Date(kickoff);
  const startStr = start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
  const elapsed = Math.floor((Date.now() - start.getTime()) / 60000);
  const minuteLabel = elapsed >= 95 ? "90+" : `${Math.max(0, Math.min(90, elapsed))}'`;
  return (
    <span className="flex items-center justify-center gap-1.5 text-xs font-bold text-live">
      <span className="h-1.5 w-1.5 rounded-full bg-live live-dot" />
      матч идёт · {minuteLabel} · с {startStr}
    </span>
  );
}

export default function MatchPage({ matchId, initial }: Props) {
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<Tab>("preview");
  // сессия — на клиенте (SSR-страница остаётся кэшируемой для SEO)
  const { user } = useSession<SessionUserDTO>();
  const { data, error } = useFetch<MatchDetail>(`/api/public/matches/${matchId}`, version, initial);
  const onRated = () => setVersion((v) => v + 1);

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
  const tabs: { id: Tab; label: string; hidden?: boolean }[] = [
    { id: "preview", label: "Превью" },
    { id: "timeline", label: `Хронология${m.events.length ? ` · ${m.events.length}` : ""}` },
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

      {/* ---------- Гери матча ---------- */}
      <div className={cn("overflow-hidden rounded-2xl border border-sline bg-s1", signals?.important.flag && "border-gold/40")}>
        <div className="stadium-glow px-4 py-6 sm:px-8">
          <div className="flex items-center justify-center gap-3">
            {/* Хозяева: герб + позиция + форма + серия */}
            <TeamHeroColumn teamId={m.homeTeam.id} name={m.homeTeam.name} sideLabel="хозяева" signals={signals?.home} />

            <div className="shrink-0 px-2 text-center">
              <div className="font-mono text-4xl font-black tabular sm:text-5xl">
                {score ? (
                  <span className={m.status === "LIVE" ? "text-live" : "text-gold"}>
                    {score.home}<span className="mx-1.5 text-ink3">:</span>{score.away}
                  </span>
                ) : (
                  <span className="text-ink3">— : —</span>
                )}
              </div>
              {m.status === "LIVE" && <LiveClock kickoff={m.kickoff} />}
              {m.status === "WALKOVER" && (
                <p className="mt-1.5 text-xs text-amber-400">
                  {m.walkoverType === "HOME" && `неявка хозяев · регламент ${m.regulationScore}:0`}
                  {m.walkoverType === "AWAY" && `неявка гостей · регламент ${m.regulationScore}:0`}
                  {m.walkoverType === "BOTH" && "обе неявки · 0:0, обеим 0 очков"}
                </p>
              )}
              {m.status === "POSTPONED" && <p className="mt-1.5 text-xs text-ink3">перенесён</p>}
              {signals?.important.flag && (
                <p className="mx-auto mt-2 flex w-fit items-center gap-1.5 rounded-full badge-important px-2.5 py-1 text-xs font-bold" title={signals.important.reason}>
                  <Trophy className="h-3 w-3" /> Важный матч
                </p>
              )}
            </div>

            <TeamHeroColumn teamId={m.awayTeam.id} name={m.awayTeam.name} sideLabel="гости" signals={signals?.away} />
          </div>
        </div>

        {/* Инфо-чипы */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-sline/60 px-4 py-3 text-xs text-ink2">
          <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-ink3" />{fmtDate(m.kickoff)}</span>
          {m.round && (
            <span className="flex items-center gap-1.5" title={signals?.roundsLeft != null ? `до конца турнира ${signals.roundsLeft} ${signals.roundsLeft === 1 ? "тур" : signals.roundsLeft < 5 ? "тура" : "туров"}` : undefined}>
              <Layers className="h-3.5 w-3.5 text-ink3" />{m.round}-й тур · {m.season.name}
            </span>
          )}
          {m.stadium && (
            <button className="flex items-center gap-1.5 hover:text-gold" onClick={() => navigate(`/stadium/${m.stadium!.id}`)}>
              <MapPin className="h-3.5 w-3.5 text-ink3" />{m.stadium.name}
            </button>
          )}
          <span className="flex items-center gap-1.5">
            <Flag className="h-3.5 w-3.5 text-ink3" />
            {m.referee ? (
              <button className="hover:text-gold" onClick={() => navigate(`/player/${m.referee!.id}`)}>судья: {m.referee.name}</button>
            ) : (
              "судья не назначен"
            )}
          </span>
          <span className="ml-auto"><StatusBadge status={m.status} /></span>
        </div>

        {m.note && <p className="border-t border-sline/60 bg-amber-400/10 px-4 py-2.5 text-center text-xs text-amber-300">{m.note}</p>}

        {canEdit && (m.status === "SCHEDULED" || m.status === "LIVE") && (
          <div className="border-t border-sline/60 p-3">
            <Button className="w-full bg-gold text-goldink hover:bg-gold/85" onClick={() => navigate(`/admin?match=${m.id}`)}>
              <ClipboardPen className="mr-1 h-4 w-4" /> Ввод протокола матча
            </Button>
          </div>
        )}

        {m.status === "WALKOVER" && (
          <div className="flex items-start gap-2 border-t border-sline/60 bg-s2/50 p-3 text-xs text-ink2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p>Матч не проводился. Голы и карточки WO-матчей не учитываются в индивидуальной статистике (инвариант Epic 2).</p>
          </div>
        )}
      </div>

      {/* ---------- Вкладки ---------- */}
      <div className="overflow-hidden rounded-xl border border-sline bg-s1">
        <div className="flex gap-1 overflow-x-auto border-b border-sline/60 px-2 scrollbar-none">
          {tabs.filter((t) => !t.hidden).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative shrink-0 px-4 py-2.5 text-sm font-semibold transition-colors",
                tab === t.id ? "text-gold" : "text-ink2 hover:text-ink"
              )}
            >
              {t.label}
              {tab === t.id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gold" />}
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
            user={user}
            refresh={() => setVersion((v) => v + 1)}
            onRated={onRated}
          />
        )}
        {tab === "timeline" && <TimelineTab m={m} />}
        {tab === "lineups" && hasLineups && <LineupsTab m={m} />}
        {tab === "table" && <StandingsTab standings={data.standings} homeId={m.homeTeam.id} awayId={m.awayTeam.id} />}
      </div>
    </div>
  );
}

// ================= Гери: колонка команды =================

function TeamHeroColumn({ teamId, name, sideLabel, signals }: {
  teamId: string; name: string; sideLabel: string;
  signals?: { position: number | null; points: number | null; streak: { code: string; count: number } | null; topScorer: { personId: string; name: string; goals: number } | null; topScorerOut: boolean; newCoach: { personId: string; name: string } | null };
}) {
  return (
    <button className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center" onClick={() => navigate(`/team/${teamId}`)}>
      <Crest name={name} id={teamId} size="xl" className="ring-1 ring-white/10" />
      <span className="min-w-0">
        <span className="flex items-center justify-center gap-1.5">
          <span className="block truncate text-base font-bold text-ink hover:text-gold">{name}</span>
          <StreakMark streak={signals?.streak} compact />
        </span>
        <span className="text-xs text-ink3">
          {sideLabel}
          {signals?.position != null && ` · №${signals.position}${signals.points != null ? ` · ${signals.points} очк.` : ""}`}
        </span>
        {signals?.newCoach && (
          <span className="mt-1 flex items-center justify-center gap-1 text-xs font-bold text-amber-300" title={`Новый тренер: ${signals.newCoach.name}`}>
            <UserCog className="h-3 w-3" /> новый тренер
          </span>
        )}
        {signals?.topScorer && (
          <span className={cn("mt-1 hidden items-center justify-center gap-1 text-xs sm:flex", signals.topScorerOut ? "text-live" : "text-ink3")}>
            <BallIcon className="h-3 w-3" />
            бомбардир: {signals.topScorer.name} ({signals.topScorer.goals})
            {signals.topScorerOut && (
              <span title="дисквалифицирован — не сыграет">
                <Ban className="h-3 w-3" />
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}

// ================= Превью матча =================

function PreviewTab({ m, standings, h2h, missing, signals, insights, user, refresh, onRated }: {
  m: NonNullable<MatchDetail["match"]>;
  standings: StandingRowDTO[];
  h2h: MatchDetail["h2h"];
  missing: MatchDetail["missing"];
  signals: MatchSignalsDTO | undefined;
  insights: { home: TeamInsightDTO; away: TeamInsightDTO };
  user: SessionUserDTO | null;
  refresh: () => void;
  onRated: () => void;
}) {
  const kickoff = new Date(m.kickoff);
  const timeStr = kickoff.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
  const avgRating = m.ratings.length > 0 ? m.ratings.reduce((a, r) => a + r.rating, 0) / m.ratings.length : null;

  return (
    <div className="space-y-4 p-4">
      {/* ---------- Дата, стадион, тур, судья ---------- */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-sline/50 bg-s2/30 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink3"><CalendarDays className="h-3.5 w-3.5" />Начало</p>
          <p className="mt-1 text-sm font-bold text-ink">{fmtDate(m.kickoff, false)}</p>
          <p className="font-mono text-sm text-ink2">{timeStr} МСК</p>
        </div>
        <div className="rounded-xl border border-sline/50 bg-s2/30 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink3"><MapPin className="h-3.5 w-3.5" />Стадион</p>
          {m.stadium ? (
            <button className="mt-1 block text-left text-sm font-bold text-ink hover:text-gold" onClick={() => navigate(`/stadium/${m.stadium!.id}`)}>
              {m.stadium.name}
              {m.stadium.city && <span className="block text-xs font-normal text-ink3">{m.stadium.city}</span>}
            </button>
          ) : (
            <p className="mt-1 text-sm text-ink3">не указан</p>
          )}
        </div>
        <div className="rounded-xl border border-sline/50 bg-s2/30 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink3"><Layers className="h-3.5 w-3.5" />Турнир</p>
          <p className="mt-1 text-sm font-bold text-ink">
            {m.round ? `${m.round}-й тур · ` : ""}{m.season.name}
          </p>
          <button className="block text-xs text-ink2 hover:text-gold" onClick={() => navigate(`/league/${m.league.id}`)}>{m.league.name}</button>
        </div>
        <div className="rounded-xl border border-sline/50 bg-s2/30 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink3"><Flag className="h-3.5 w-3.5" />Судья</p>
          {m.referee ? (
            <button className="mt-1 block text-left text-sm font-bold text-ink hover:text-gold" onClick={() => navigate(`/player/${m.referee!.id}`)}>
              {m.referee.name}
              {avgRating !== null && <span className="ml-1.5 font-mono text-xs text-gold">★ {avgRating.toFixed(1)}</span>}
            </button>
          ) : (
            <p className="mt-1 text-sm text-ink3">не назначен</p>
          )}
        </div>
      </div>

      {/* ---------- Соперники: серии, форма, атака и оборона ---------- */}
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
            <div key={team.id} className="rounded-xl border border-sline/50 p-3">
              <button className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left hover:text-gold" onClick={() => navigate(`/team/${team.id}`)}>
                <Crest name={team.name} id={team.id} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{team.name}</span>
                  <span className="block text-xs text-ink3">
                    {sig?.position != null ? `№${sig.position} в таблице · ${sig.points} очк. за ${sig.games} игр` : "дебют сезона"}
                  </span>
                </span>
                {row?.form && <FormBadges form={row.form.slice(-5)} />}
              </button>

              <div className="mt-2 space-y-1.5 text-xs">
                {/* серия 5+ — главный факт превью */}
                {streakHot && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-ok/10 px-2.5 py-1.5 font-bold text-ok">
                    <Flame className="h-4 w-4 streak-hot-glow" />
                    {streak.count} {STREAK_LABELS[streak.code] ?? "матчей"} подряд — команда на огне
                  </p>
                )}
                {streakCold && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-live/10 px-2.5 py-1.5 font-bold text-live">
                    <Snowflake className="h-4 w-4" />
                    {streak.count} {STREAK_LABELS[streak.code] ?? "матчей"} подряд — команда в кризисе
                  </p>
                )}
                {sig?.newCoach && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-amber-400/10 px-2.5 py-1.5 font-semibold text-amber-300">
                    <UserCog className="h-4 w-4" />
                    новый тренер: {sig.newCoach.name}
                  </p>
                )}
                {sig?.topScorer && (
                  <p className={cn("flex items-center gap-1.5 px-2.5 py-1", sig.topScorerOut ? "text-live" : "text-ink2")}>
                    <BallIcon className="h-3.5 w-3.5" />
                    бомбардир: {sig.topScorer.name} · {sig.topScorer.goals}
                    {sig.topScorerOut && <span className="font-semibold"> — пропускает матч (дисквалификация)</span>}
                  </p>
                )}
                {/* атака/оборона в последних матчах */}
                {insight.last5 && (
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2.5 py-1 text-ink2">
                    за {lastMatchesWord(insight.last5.matches)}:
                    <span className={cn("font-bold", insight.last5.scored >= 10 ? "text-gold" : "text-ink")}>
                      {insight.last5.scored} забито{insight.last5.scored >= 10 && " — мощная атака"}
                    </span>
                    <span className="text-ink3">·</span>
                    <span className={cn("font-bold", insight.last5.conceded >= 10 ? "text-live" : "text-ink")}>
                      {insight.last5.conceded} пропущено{insight.last5.conceded >= 10 && " — проблемы в обороне"}
                    </span>
                  </p>
                )}
                {/* разгромы и провалы из истории */}
                {insight.rout && (
                  <p className="flex items-center gap-1.5 px-2.5 py-1 text-ink2" title="Самый результативный матч команды">
                    <Trophy className="h-3.5 w-3.5 text-gold" />
                    забивала {insight.rout.score} — {insight.rout.opponent} ({fmtShortDate(insight.rout.date)})
                  </p>
                )}
                {insight.collapse && (
                  <p className="flex items-center gap-1.5 px-2.5 py-1 text-ink2" title="Самое крупное поражение команды">
                    <ShieldAlert className="h-3.5 w-3.5 text-live" />
                    пропускала {insight.collapse.score} от {insight.collapse.opponent} ({fmtShortDate(insight.collapse.date)})
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ---------- Личные встречи (в этом формате футбола) ---------- */}
      <section>
        <p className="mb-2 px-1 text-sm font-bold text-ink">Личные встречи</p>
        {h2h.list.length === 0 ? (
          <p className="rounded-xl border border-dashed border-sline px-3 py-4 text-center text-sm text-ink3">
            Команды ещё не встречались — это их первый матч в этом формате
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-ok/10 px-3 py-2 text-center">
                <p className="font-mono text-xl font-bold text-ok">{h2h.summary.homeWins}</p>
                <p className="truncate text-xs font-medium uppercase tracking-wide text-ink3">победы · {m.homeTeam.name}</p>
              </div>
              <div className="rounded-xl bg-s2 px-3 py-2 text-center">
                <p className="font-mono text-xl font-bold text-ink">{h2h.summary.draws}</p>
                <p className="text-xs font-medium uppercase tracking-wide text-ink3">ничьи</p>
              </div>
              <div className="rounded-xl bg-live/10 px-3 py-2 text-center">
                <p className="font-mono text-xl font-bold text-live">{h2h.summary.awayWins}</p>
                <p className="truncate text-xs font-medium uppercase tracking-wide text-ink3">победы · {m.awayTeam.name}</p>
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
                    className="flex w-full items-center gap-3 rounded-xl border border-sline/50 bg-s2/30 px-3 py-2.5 text-left text-sm transition-colors hover:border-gold/40"
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
                    <span className="min-w-0 flex-1 truncate text-ink2">{g.homeTeam.name} — {g.awayTeam.name}</span>
                    <span className="hidden truncate text-xs text-ink3 md:block">{g.season.league}</span>
                    <span className={cn("shrink-0 font-mono text-sm font-bold", g.status === "WALKOVER" ? "text-amber-400" : "text-ink")}>
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
          <p className="mb-2 px-1 text-sm font-bold text-ink">Кто пропускает матч</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[m.homeTeam, m.awayTeam].map((team) => {
              const entries = missing.find((x) => x.teamId === team.id)?.entries ?? [];
              return (
                <div key={team.id} className="rounded-xl border border-sline/50 p-3">
                  <button className="mb-2 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:text-gold" onClick={() => navigate(`/team/${team.id}`)}>
                    <Crest name={team.name} id={team.id} size="sm" />
                    <span className="text-xs font-bold text-ink2">{team.name}</span>
                  </button>
                  {entries.length === 0 ? (
                    <p className="flex items-center gap-1.5 px-1 py-2 text-xs text-ink3">
                      <UserX className="h-3.5 w-3.5 text-ok" /> Все лидеры в строю
                    </p>
                  ) : (
                    entries.map((e) => (
                      <button
                        key={e.personId}
                        onClick={() => navigate(`/player/${e.personId}`)}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-s2/60",
                          e.kind === "SUSPENSION" ? "bg-live/[0.06]" : "bg-warn/[0.06]"
                        )}
                      >
                        {e.kind === "SUSPENSION" ? <Ban className="mt-0.5 h-4 w-4 shrink-0 text-live" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink">{e.name}</span>
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

      {/* ---------- Судья и оценка судейства ---------- */}
      {m.referee && <RefereeBlock m={m} referee={m.referee} user={user} avgRating={avgRating} refresh={refresh} onRated={onRated} />}
    </div>
  );
}

/** Блок судьи: карточка-ссылка на профиль + средняя оценка + форма голосования */
function RefereeBlock({ m, referee, user, avgRating, refresh, onRated }: {
  m: NonNullable<MatchDetail["match"]>;
  referee: { id: string; name: string };
  user: SessionUserDTO | null;
  avgRating: number | null;
  refresh: () => void;
  onRated: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitRating() {
    if (!m || !rating) return;
    setSubmitting(true);
    const res = await apiPost("/api/admin/ratings", { matchId: m.id, rating, comment });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Оценка судьи сохранена");
    setRating(0);
    setComment("");
    refresh();
    onRated();
  }

  return (
    <section>
      <p className="mb-2 px-1 text-sm font-bold text-ink">Судейская бригада</p>
      <div className="rounded-xl border border-sline/50 p-3">
        <button
          onClick={() => navigate(`/player/${m.referee!.id}`)}
          className="flex w-full items-center gap-3 rounded-xl border border-sline/50 bg-s2/30 p-3 text-left transition-colors hover:border-gold/40"
        >
          <Avatar name={m.referee!.name} id={m.referee!.id} size="lg" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold text-ink">{m.referee!.name}</span>
            <span className="text-xs text-ink3">главный судья матча · профиль →</span>
          </span>
          <Flag className="h-4 w-4 shrink-0 text-gold" />
        </button>

        <div className="mt-3">
          {m.ratings.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink3">Оценка судейства:</span>
              <div className="flex">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className={cn("h-4 w-4", i <= Math.round(avgRating!) ? "fill-gold text-gold" : "text-ink3")} />
                ))}
              </div>
              <span className="font-mono text-sm font-bold text-gold">{avgRating!.toFixed(1)}</span>
              <span className="text-xs text-ink3">({ratingsWord(m.ratings.length)}, авторы скрыты)</span>
            </div>
          ) : (
            <p className="text-xs text-ink3">Оценок судейства пока нет</p>
          )}

          {user && user.personId !== referee.id && m.status === "COMPLETED" && (
            <div className="mt-3 space-y-2 border-t border-sline/60 pt-3">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button key={i} onClick={() => setRating(i)} className="transition-transform hover:scale-110" aria-label={`Оценка ${i}`}>
                    <Star className={cn("h-6 w-6", i <= rating ? "fill-gold text-gold" : "text-ink3")} />
                  </button>
                ))}
              </div>
              <Textarea
                placeholder="Комментарий (необязательно, анонимно)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                className="border-sline bg-s1 text-ink placeholder:text-ink3"
              />
              <Button size="sm" disabled={!rating || submitting} onClick={submitRating} className="bg-gold text-goldink hover:bg-gold/85">
                Отправить оценку
              </Button>
            </div>
          )}
          {!user && m.status === "COMPLETED" && <p className="mt-2 text-xs text-ink3">Войдите в систему, чтобы оценить судью</p>}
          {user && user.personId === referee.id && <p className="mt-2 text-xs text-ink3">Судья не может оценивать сам себя</p>}
        </div>
      </div>
    </section>
  );
}

// ================= Хронология =================

function TimelineTab({ m }: { m: NonNullable<MatchDetail["match"]> }) {
  if (m.events.length === 0) {
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

  // объединяем SUB_OUT + SUB_IN одной минуты и команды в одну строку «Замена»
  type Row =
    | { kind: "event"; e: EventRow }
    | { kind: "sub"; minute: number; teamId: string; out: EventRow; inEvent: EventRow | null };
  const rows: Row[] = [];
  const consumed = new Set<string>();
  for (const e of m.events) {
    if (consumed.has(e.id)) continue;
    if (e.type === "SUB_OUT") {
      const partner = m.events.find(
        (x) => x.id !== e.id && !consumed.has(x.id) && x.type === "SUB_IN" && x.teamId === e.teamId && Math.abs(x.minute - e.minute) <= 1
      );
      if (partner) {
        consumed.add(partner.id);
        rows.push({ kind: "sub", minute: e.minute, teamId: e.teamId, out: e, inEvent: partner });
        continue;
      }
    }
    rows.push({ kind: "event", e });
  }

  // текущий счёт после каждого гола (бегущий счёт в хронологии)
  let runHome = 0, runAway = 0;
  const runningScore = (e: EventRow): { home: number; away: number } | null => {
    if (e.type !== "GOAL" && e.type !== "PENALTY" && e.type !== "OWN_GOAL") return null;
    const forHome = e.teamId === m.homeTeam.id;
    const own = e.type === "OWN_GOAL";
    if ((forHome && !own) || (!forHome && own)) runHome++;
    else runAway++;
    return { home: runHome, away: runAway };
  };

  return (
    <div className="p-3">
      <div className="space-y-1">
        {rows.map((row) => {
          if (row.kind === "sub") {
            const isHome = row.teamId === m.homeTeam.id;
            return (
              <div
                key={row.out.id}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border border-sline/50 bg-s2/30 px-3 py-2 text-sm",
                  !isHome && "flex-row-reverse text-right"
                )}
              >
                <span className="flex w-11 shrink-0 items-center justify-center rounded-md bg-s2 py-0.5 font-mono text-xs text-ink2">
                  {row.minute}&apos;
                </span>
                <span className="flex shrink-0 items-center justify-center"><EventIcon type="SUB_OUT" /></span>
                <span className="min-w-0 flex-1">
                  <button onClick={() => navigate(`/player/${row.out.person.id}`)} className="font-medium text-ink2 hover:text-gold">
                    <ArrowDown className="mr-0.5 inline h-3 w-3 text-live" />{row.out.person.name}
                  </button>
                  {row.inEvent && (
                    <>
                      <span className="mx-1 text-ink3">→</span>
                      <button onClick={() => navigate(`/player/${row.inEvent!.person.id}`)} className="font-medium text-ink hover:text-gold">
                        <ArrowUp className="mr-0.5 inline h-3 w-3 text-ok" />{row.inEvent.person.name}
                      </button>
                    </>
                  )}
                </span>
              </div>
            );
          }

          const e = row.e;
          const score = runningScore(e);
          const isHome = e.teamId === m.homeTeam.id;
          // подпись только там, где иконка не исчерпывающа: пенальти, автогол, VAR
          const note = EVENT_SHORT_LABELS[e.type];
          return (
            <button
              key={e.id}
              onClick={() => navigate(`/player/${e.person.id}`)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border border-sline/50 bg-s2/30 px-3 py-2 text-left text-sm transition-colors hover:border-gold/40 hover:bg-s2/70",
                !isHome && "flex-row-reverse text-right"
              )}
            >
              <span className="flex w-11 shrink-0 items-center justify-center rounded-md bg-s2 py-0.5 font-mono text-xs text-ink2">
                {e.minute}&apos;
              </span>
              <span className="flex shrink-0 items-center justify-center"><EventIcon type={e.type} /></span>
              <span className="min-w-0 flex-1">
                {/* кто забил — ярче; чья передача — темнее */}
                <span className={cn(e.type === "GOAL" || e.type === "PENALTY" ? "font-bold text-ink" : "font-medium text-ink")}>{e.person.name}</span>
                {note && <span className="ml-2 text-xs text-ink3">{note}</span>}
                {e.assist && (
                  <span className="ml-1.5 text-xs text-ink3">
                    с подачи <span className="font-medium text-ink2 hover:text-gold">{e.assist.name}</span>
                  </span>
                )}
              </span>
              {score && (
                <span className="shrink-0 rounded-md bg-s2 px-1.5 py-0.5 font-mono text-xs font-bold text-gold" title="Счёт после гола">
                  {score.home}:{score.away}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ================= Составы =================

function LineupsTab({ m }: { m: NonNullable<MatchDetail["match"]> }) {
  return (
    <div className="grid grid-cols-1 gap-3 p-3 text-sm sm:grid-cols-2">
      {[m.homeTeam, m.awayTeam].map((team) => {
        const rows = m.lineups.filter((l) => l.teamId === team.id);
        const starters = rows.filter((l) => l.isStarter);
        const bench = rows.filter((l) => !l.isStarter);
        return (
          <div key={team.id} className="rounded-xl border border-sline/50 p-3">
            <button
              className="mb-2 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:text-gold"
              onClick={() => navigate(`/team/${team.id}`)}
            >
              <Crest name={team.name} id={team.id} size="sm" />
              <span className="text-xs font-bold text-ink2">{team.name}</span>
            </button>
            <p className="px-1 pb-1 text-xs font-bold uppercase tracking-wide text-ink3">Стартовый состав</p>
            {starters.map((l) => (
              <button key={l.id} className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-ink2 hover:text-ink" onClick={() => navigate(`/player/${l.person.id}`)}>
                <span className="w-6 text-center font-mono text-xs text-ink3">{l.number ?? "—"}</span>
                <Avatar name={l.person.name} id={l.person.id} size="xs" />
                <span className="min-w-0 flex-1 truncate">{l.person.name}</span>
              </button>
            ))}
            {bench.length > 0 && (
              <>
                <p className="px-1 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-ink3">Запас</p>
                {bench.map((l) => (
                  <button key={l.id} className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-ink2 hover:text-ink" onClick={() => navigate(`/player/${l.person.id}`)}>
                    <span className="w-6 text-center font-mono text-xs text-ink3">{l.number ?? "—"}</span>
                    <Avatar name={l.person.name} id={l.person.id} size="xs" />
                    <span className="min-w-0 flex-1 truncate">{l.person.name}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ================= Таблица (обе команды подсвечены) =================

function StandingsTab({ standings, homeId, awayId }: { standings: StandingRowDTO[]; homeId: string; awayId: string }) {
  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-2 px-1 text-xs text-ink3">
        <span className="inline-flex h-4 w-1 rounded bg-gold" />
        Подсвечены команды этого матча — места до/после
      </div>
      <div className="overflow-x-auto scrollbar-s21">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-sline/60 text-xs uppercase tracking-wide text-ink3">
              <th className="w-10 px-2 py-2 text-center font-semibold">#</th>
              <th className="px-2 py-2 text-left font-semibold">Команда</th>
              <th className="w-12 px-2 py-2 text-center font-semibold" title="Игры">И</th>
              <th className="w-20 px-2 py-2 text-center font-semibold" title="Победы-ничьи-поражения">В-Н-П</th>
              <th className="w-20 px-2 py-2 text-center font-semibold" title="Забито:Пропущено">Мячи</th>
              <th className="w-12 px-2 py-2 text-center font-semibold" title="Очки">О</th>
              <th className="w-28 px-2 py-2 text-center font-semibold" title="Последние 5 матчей">Форма</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((r) => {
              const hl = r.teamId === homeId || r.teamId === awayId;
              return (
                <tr
                  key={r.teamId}
                  data-clickable
                  className={cn("border-b border-sline/40 transition-colors last:border-b-0 hover:bg-s2/60", hl && "row-hl")}
                  onClick={() => navigate(`/team/${r.teamId}`)}
                >
                  <td className="px-2 py-2 text-center">
                    <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold", r.position === 1 ? "bg-gold text-goldink" : "text-ink2")}>
                      {r.position}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex items-center gap-2">
                      <Crest name={r.teamName} id={r.teamId} size="xs" />
                      <span className={cn("truncate", hl ? "font-bold text-ink" : "font-medium text-ink2")}>{r.teamName}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center tabular text-ink2">{r.games}</td>
                  <td className="px-2 py-2 text-center tabular text-ink2">{r.wins}-{r.draws}-{r.losses}</td>
                  <td className="px-2 py-2 text-center font-mono text-xs tabular text-ink2">{r.goalsFor}:{r.goalsAgainst}</td>
                  <td className="px-2 py-2 text-center text-base font-bold tabular text-gold">{r.points}</td>
                  <td className="px-2 py-2"><div className="flex justify-center"><FormBadges form={r.form} /></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
