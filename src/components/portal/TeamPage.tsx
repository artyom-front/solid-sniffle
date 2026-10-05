"use client";

// Профиль команды «Ночь под прожекторами»: геро с гербом, турнирное положение,
// состав по позициям с аватарами, календарь матчей с формой.

import { useState } from "react";
import { Building2, MapPin, UserCog, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch } from "./hooks";
import { navigate } from "./router";
import type { MatchDTO } from "./types";
import { FORMAT_LABELS } from "@/lib/labels";
import { LoadingBlock, EmptyState, FormBadges, matchScore, StreakMark } from "./ui-bits";
import { Avatar, Breadcrumbs, Crest, StatTile } from "./visuals";
import { BallIcon } from "./EventIcons";

interface TeamDetail {
  team: {
    id: string; name: string; city: string | null; logoUrl: string | null;
    club: { id: string; name: string; city: string | null; description: string | null } | null;
  };
  seasons: {
    season: { id: string; name: string; league: { id: string; name: string; format: string } };
    players: { id: string; name: string; position: string | null; number: number | null; endDate: string | null }[];
    coaches: { id: string; name: string; endDate: string | null; startDate: string }[];
  }[];
  standings: {
    season: { id: string; name: string; league: { id: string; name: string; format: string } };
    position: number; points: number; games: number; wins: number; draws: number; losses: number;
    goalsFor: number; goalsAgainst: number; form?: string[];
    streak?: { code: string; count: number } | null;
    topScorer?: { personId: string; name: string; goals: number; out?: boolean } | null;
    newCoach?: { name: string } | null;
  }[];
  matches: (MatchDTO & { league: { id: string; name: string; format: string } })[];
}

const POS_GROUPS: { id: string; title: string }[] = [
  { id: "GK", title: "Вратари" },
  { id: "DF", title: "Защитники" },
  { id: "MF", title: "Полузащитники" },
  { id: "FW", title: "Нападающие" },
];

export default function TeamPage({ teamId, version = 0, initial }: { teamId: string; version?: number; initial?: TeamDetail | null }) {
  const { data, error } = useFetch<TeamDetail>(`/api/public/teams/${teamId}`, version, initial);
  const [matchFilter, setMatchFilter] = useState<"all" | "played" | "upcoming">("all");

  if (error) return <EmptyState title="Команда не найдена" hint={error} />;
  if (!data || !data.team) return <LoadingBlock label="Загрузка команды..." />;

  const { team, seasons, standings, matches } = data;
  const current = seasons[0];
  const top = standings[0];
  const matchesFiltered = matches.filter((m) => {
    if (matchFilter === "played") return m.status === "COMPLETED" || m.status === "WALKOVER";
    if (matchFilter === "upcoming") return m.status === "SCHEDULED" || m.status === "POSTPONED" || m.status === "LIVE";
    return true;
  });

  const wins = top?.wins ?? 0;
  const draws = top?.draws ?? 0;
  const losses = top?.losses ?? 0;
  const goalsFor = top?.goalsFor ?? 0;

  return (
    <div className="space-y-3">
      <Breadcrumbs
        items={[
          { label: "Главная", onClick: () => navigate("/") },
          ...(current ? [{ label: current.season.league.name, onClick: () => navigate(`/league/${current.season.league.id}`) }] : []),
          { label: team.name },
        ]}
        className="px-1"
      />

      {/* ---------- Шапка команды (директива 2026-09-30, FS-паттерн):
          горизонтальный флекс: лого 56px (radius 8px) слева | название
          22px/700 + мета ОДНОЙ строкой 12px серой (с переносом) +
          компактный ряд «форма · место · очки». Никаких свечений. ---------- */}
      <div className="overflow-hidden rounded-lg border border-sline bg-s1">
        <div className="flex flex-wrap items-center gap-3 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4">
          <Crest name={team.name} id={team.id} logoUrl={team.logoUrl} size="lg" className="rounded-lg ring-1 ring-white/10" />
          <div className="min-w-[180px] flex-1">
            <h1 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[22px] font-bold leading-tight text-ink">
              <span className="break-words">{team.name}</span>
              <StreakMark streak={top?.streak} />
            </h1>
            {/* мета — одной строкой с переносами (не колонкой) */}
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink3">
              {team.club && (
                <button className="hover:text-gold" onClick={() => navigate("/")} title="Клуб"><Building2 className="mr-0.5 inline h-3 w-3 align-[-1px]" />{team.club.name}</button>
              )}
              {(team.city ?? team.club?.city) && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{team.city ?? team.club?.city}</span>}
              {current && (
                <button className="hover:text-gold" onClick={() => navigate(`/league/${current.season.league.id}`)}>
                  {current.season.league.name} · {FORMAT_LABELS[current.season.league.format] ?? current.season.league.format}
                </button>
              )}
            </p>
            {/* компактный ряд: форма (круги 22px) + место · очки */}
            {top && (
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                {top.form && <FormBadges form={top.form.slice(-5)} />}
                <span className="text-xs text-ink2">
                  <span className="font-bold text-ink">{top.position}</span> место · <span className="font-bold text-ink">{top.points}</span> очк.
                </span>
                {top.topScorer && (
                  <button
                    className={cn("flex items-center gap-1 text-xs hover:text-gold", top.topScorer.out ? "text-live" : "text-ink3")}
                    onClick={() => navigate(`/player/${top.topScorer!.personId}`)}
                    title={top.topScorer.out ? "Лучший бомбардир дисквалифицирован — не сыграет" : "Лучший бомбардир команды в сезоне"}
                  >
                    <BallIcon className="h-3 w-3" />
                    бомбардир: {top.topScorer.name} · {top.topScorer.goals}
                    {top.topScorer.out && <UserX className="h-3 w-3" />}
                  </button>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Сводные показатели сезона (Р-24): равные карточки auto-fit
            minmax(96px, 1fr), gap 8px — переносятся на следующий ряд,
            а не скроллятся; «В-Н-П» значением «1-2-2» в одну строку */}
        {top && (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-2 border-t border-sline/60 px-3 py-3 sm:px-5">
            <StatTile value={top.games} label="матчи" />
            <StatTile value={`${wins}-${draws}-${losses}`} label="В-Н-П" />
            <StatTile value={goalsFor} label="голы" accent />
            <StatTile value={top.goalsFor - top.goalsAgainst > 0 ? `+${top.goalsFor - top.goalsAgainst}` : top.goalsFor - top.goalsAgainst} label="разница" />
            <StatTile value={top.points} label="очки" accent />
          </div>
        )}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {/* ---------- Состав + тренер ---------- */}
        {current && (
          <div className="overflow-hidden rounded-lg border border-sline bg-s1">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sline/60 bg-s2/40 px-3 py-2.5">
              <p className="text-[13px] font-bold text-ink">Состав · {current.season.name}</p>
              <span className="text-[11px] text-ink3">{current.players.filter((p) => !p.endDate).length} в заявке</span>
            </div>
            <div className="p-3">
              {/* ШТАБ (директива): тренер — первая строка группы «Штаб»
                  с иконкой и подписью 11px серой «тренерский штаб» —
                  вместо жёлтой плашки */}
              {current.coaches.filter((c) => !c.endDate).length > 0 && (
                <div className="mb-1">
                  <p className="px-1 pb-1 text-[11px] font-bold uppercase tracking-[0.6px] text-ink3">Штаб</p>
                  {current.coaches.filter((c) => !c.endDate).map((c) => {
                    const isNew = new Date(c.startDate).getTime() >= Date.now() - 30 * 86400000;
                    return (
                      <button
                        key={c.id}
                        onClick={() => navigate(`/player/${c.id}`)}
                        className="flex w-full items-center gap-2.5 rounded-md px-1 py-1.5 text-left hover:bg-shover"
                        title={isNew ? "Возглавил команду недавно (до 30 дней)" : "Действующий тренер"}
                      >
                        <UserCog className="h-4 w-4 shrink-0 text-amber-300" />
                        <Avatar name={c.name} id={c.id} size="xs" />
                        <span className="min-w-0 flex-1 break-words text-[13px] font-semibold text-ink">{c.name}</span>
                        <span className="shrink-0 text-[11px] text-ink3">тренерский штаб</span>
                        {isNew && (
                          <span className="shrink-0 rounded-md bg-amber-400/20 px-1.5 py-0.5 text-[11px] font-bold text-amber-300">новый</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {current.coaches.some((c) => c.endDate) && (
                <p className="mb-3 px-1 text-xs text-ink3">
                  Ранее командой руководили: {current.coaches.filter((c) => c.endDate).map((c) => c.name).join(", ")}
                </p>
              )}
              <div className="space-y-1">
                {POS_GROUPS.map((pos) => {
                  const group = current.players.filter((p) => p.position === pos.id);
                  if (group.length === 0) return null;
                  return (
                    <div key={pos.id}>
                      <p className="px-1 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.6px] text-ink3">{pos.title}</p>
                      {group.map((p) => <PlayerRow key={p.id} p={p} />)}
                    </div>
                  );
                })}
                {current.players.filter((p) => !p.position).length > 0 && (
                  <div>
                    <p className="px-1 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.6px] text-ink3">Без позиции</p>
                    {current.players.filter((p) => !p.position).map((p) => <PlayerRow key={p.id} p={p} />)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ---------- Матчи ---------- */}
        <div className="overflow-hidden rounded-lg border border-sline bg-s1">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sline/60 bg-s2/40 px-3 py-2.5">
            <p className="text-[13px] font-bold text-ink">Матчи</p>
            <div className="flex flex-wrap gap-1">
              {([["all", "Все"], ["played", "Сыгранные"], ["upcoming", "Предстоящие"]] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setMatchFilter(id)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                    matchFilter === id ? "bg-gold text-goldink" : "bg-s2 text-ink2 hover:text-ink"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[520px] space-y-1 overflow-y-auto p-3 scrollbar-s21">
            {matchesFiltered.length === 0 && <p className="py-6 text-center text-xs text-ink3">Нет матчей</p>}
            {matchesFiltered.map((m) => {
              const isHome = m.homeTeam.id === teamId;
              const score = matchScore(m);
              const time = new Date(m.kickoff);
              const rival = isHome ? m.awayTeam : m.homeTeam;
              const rivalScore = score ? (isHome ? score.away : score.home) : null;
              const myScore = score ? (isHome ? score.home : score.away) : null;
              const res = score ? (myScore! > rivalScore! ? "W" : myScore! < rivalScore! ? "L" : "D") : null;
              return (
                <button
                  key={m.id}
                  onClick={() => navigate(`/match/${m.id}`)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-sline/50 bg-s2/30 px-3 py-2 text-left text-[13px] hover:border-gold/40"
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                      res === "W" ? "bg-ok text-white" : res === "L" ? "bg-live text-white" : res === "D" ? "bg-ink3 text-s0" : "bg-s2 text-ink3"
                    )}
                    title={res === "W" ? "Победа" : res === "L" ? "Поражение" : res === "D" ? "Ничья" : "Не сыгран"}
                  >
                    {res ?? "·"}
                  </span>
                  <span className="w-14 shrink-0 tabular text-xs text-ink3">
                    {time.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "Europe/Moscow" })}
                  </span>
                  <Crest name={rival.name} id={rival.id} size="xs" />
                  <span className="min-w-0 flex-1 break-words text-ink2">
                    <span className="text-ink3">{isHome ? "дома vs" : "в гостях у"}</span> {rival.name}
                  </span>
                  <span className={cn("shrink-0 tabular text-[13px] font-bold", m.status === "WALKOVER" ? "text-amber-400" : "text-ink")}>
                    {score ? `${score.home}:${score.away}` : time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---------- Выступления по сезонам ---------- */}
      {standings.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-sline bg-s1">
          <div className="border-b border-sline/60 bg-s2/40 px-3 py-2.5">
            <p className="text-[13px] font-bold text-ink">Выступления по сезонам</p>
          </div>
          <div className="space-y-2 p-3">
            {standings.map((s) => (
              <button
                key={s.season.id}
                onClick={() => navigate(`/league/${s.season.league.id}/table`)}
                className="flex w-full flex-wrap items-center gap-3 rounded-lg border border-sline/50 px-3 py-2.5 text-left hover:border-gold/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-s2 tabular text-sm font-bold text-gold">
                  {s.position}
                </span>
                <div className="min-w-0">
                  <p className="break-words text-[13px] font-semibold text-ink">{s.season.league.name}</p>
                  <p className="text-xs text-ink3">{s.season.name}</p>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-3 text-center tabular text-xs text-ink2">
                  <span><b className="block text-sm text-ink">{s.games}</b>игр</span>
                  <span><b className="block text-sm text-ink">{s.wins}-{s.draws}-{s.losses}</b>В-Н-П</span>
                  <span><b className="block text-sm text-ink">{s.goalsFor}:{s.goalsAgainst}</b>голы</span>
                  <span><b className="block text-base text-gold">{s.points}</b>очки</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Строка игрока состава (FS-паттерн, директива): номер в боксе 24px
 *  серым · аватар · имя 13px (переносится, НЕ усекается) · «отзаявлен». */
function PlayerRow({ p }: { p: { id: string; name: string; number: number | null; endDate: string | null } }) {
  return (
    <button
      onClick={() => navigate(`/player/${p.id}`)}
      className="flex w-full items-center gap-2.5 rounded-md px-1 py-1.5 text-left hover:bg-shover"
    >
      <span className="w-6 shrink-0 text-center tabular text-xs text-ink3">{p.number ?? "—"}</span>
      <Avatar name={p.name} id={p.id} size="xs" />
      <span className="min-w-0 flex-1 break-words text-[13px] text-ink2">{p.name}</span>
      {p.endDate && <span className="shrink-0 text-[11px] text-amber-400">отзаявлен</span>}
    </button>
  );
}
