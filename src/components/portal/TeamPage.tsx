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

      {/* ---------- Гери команды ---------- */}
      <div className="overflow-hidden rounded-2xl border border-sline bg-s1">
        <div className="stadium-glow flex flex-wrap items-center gap-4 px-4 py-5 sm:px-6">
          <Crest name={team.name} id={team.id} size="xl" className="ring-1 ring-white/10" />
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-black tracking-tight text-ink">
              {team.name}
              <StreakMark streak={top?.streak} />
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink3">
              {team.club && (
                <button className="flex items-center gap-1 hover:text-gold" onClick={() => navigate("/")} title="Клуб"><Building2 className="h-3 w-3" />{team.club.name}</button>
              )}
              {(team.city ?? team.club?.city) && (
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{team.city ?? team.club?.city}</span>
              )}
              {current && (
                <button className="hover:text-gold" onClick={() => navigate(`/league/${current.season.league.id}`)}>
                  {current.season.league.name} · {FORMAT_LABELS[current.season.league.format] ?? current.season.league.format}
                </button>
              )}
            </p>
            {top?.topScorer && (
              <button
                className={cn("mt-1.5 flex items-center gap-1.5 text-xs font-semibold hover:text-gold", top.topScorer.out ? "text-live" : "text-ink2")}
                onClick={() => navigate(`/player/${top.topScorer!.personId}`)}
                title={top.topScorer.out ? "Лучший бомбардир дисквалифицирован — не сыграет" : "Лучший бомбардир команды в сезоне"}
              >
                <BallIcon className="h-3 w-3" />
                бомбардир: {top.topScorer.name} · {top.topScorer.goals}
                {top.topScorer.out && <UserX className="h-3 w-3" />}
              </button>
            )}
          </div>
          {top && (
            <div className="flex shrink-0 items-center gap-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-2.5">
              <span className="font-mono text-2xl font-black text-gold">{top.position}</span>
              <span className="text-xs text-ink2">
                место<br />
                <span className="font-mono font-bold text-ink">{top.points} очк.</span>
              </span>
              {top.form && <FormBadges form={top.form.slice(-5)} />}
            </div>
          )}
        </div>

        {/* Сводные показатели сезона */}
        {top && (
          <div className="grid grid-cols-5 gap-2 border-t border-sline/60 px-4 py-3">
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
          <div className="overflow-hidden rounded-xl border border-sline bg-s1">
            <div className="flex items-center justify-between border-b border-sline/60 bg-s2/50 px-4 py-3">
              <p className="text-sm font-bold text-ink">Состав · {current.season.name}</p>
              <span className="text-xs text-ink3">{current.players.filter((p) => !p.endDate).length} в заявке</span>
            </div>
            <div className="p-3">
              {/* Тренерский штаб: действующие тренеры; «новый» — если пришёл недавно */}
              {current.coaches.filter((c) => !c.endDate).length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5">
                  <UserCog className="h-4 w-4 text-amber-400" />
                  {current.coaches.filter((c) => !c.endDate).map((c) => {
                    const isNew = new Date(c.startDate).getTime() >= Date.now() - 30 * 86400000;
                    return (
                      <button
                        key={c.id}
                        onClick={() => navigate(`/player/${c.id}`)}
                        className="flex items-center gap-2 text-sm font-semibold text-ink hover:text-gold"
                        title={isNew ? "Возглавил команду недавно (до 30 дней)" : "Действующий тренер"}
                      >
                        <Avatar name={c.name} id={c.id} size="xs" />
                        {c.name}
                        {isNew && (
                          <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-xs font-bold text-amber-300">новый тренер</span>
                        )}
                      </button>
                    );
                  })}
                  <span className="text-xs text-ink3">тренерский штаб</span>
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
                      <p className="px-1 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-ink3">{pos.title}</p>
                      {group.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => navigate(`/player/${p.id}`)}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-s2/60"
                        >
                          <span className="w-7 shrink-0 text-center font-mono text-xs text-ink3">{p.number ?? "—"}</span>
                          <Avatar name={p.name} id={p.id} size="xs" />
                          <span className="min-w-0 flex-1 truncate text-ink2">{p.name}</span>
                          {p.endDate && <span className="text-xs text-amber-400">отзаявлен</span>}
                        </button>
                      ))}
                    </div>
                  );
                })}
                {current.players.filter((p) => !p.position).length > 0 && (
                  <div>
                    <p className="px-1 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-ink3">Без позиции</p>
                    {current.players.filter((p) => !p.position).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/player/${p.id}`)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-s2/60"
                      >
                        <span className="w-7 shrink-0 text-center font-mono text-xs text-ink3">{p.number ?? "—"}</span>
                        <Avatar name={p.name} id={p.id} size="xs" />
                        <span className="min-w-0 flex-1 truncate text-ink2">{p.name}</span>
                        {p.endDate && <span className="text-xs text-amber-400">отзаявлен</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ---------- Матчи ---------- */}
        <div className="overflow-hidden rounded-xl border border-sline bg-s1">
          <div className="flex items-center justify-between border-b border-sline/60 bg-s2/50 px-4 py-3">
            <p className="text-sm font-bold text-ink">Матчи</p>
            <div className="flex gap-1">
              {([["all", "Все"], ["played", "Сыгранные"], ["upcoming", "Предстоящие"]] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setMatchFilter(id)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
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
                  className="flex w-full items-center gap-3 rounded-xl border border-sline/50 bg-s2/30 px-3 py-2.5 text-left text-sm hover:border-gold/40"
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                      res === "W" ? "bg-emerald-500 text-white" : res === "L" ? "bg-live text-white" : res === "D" ? "bg-ink3 text-s0" : "bg-s2 text-ink3"
                    )}
                    title={res === "W" ? "Победа" : res === "L" ? "Поражение" : res === "D" ? "Ничья" : "Не сыгран"}
                  >
                    {res ?? "·"}
                  </span>
                  <span className="w-16 shrink-0 text-xs text-ink3">
                    {time.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "Europe/Moscow" })}
                  </span>
                  <Crest name={rival.name} id={rival.id} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-ink2">
                    <span className="text-ink3">{isHome ? "дома vs" : "в гостях у"}</span> {rival.name}
                  </span>
                  <span className={cn("shrink-0 font-mono text-sm font-bold", m.status === "WALKOVER" ? "text-amber-400" : "text-ink")}>
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
        <div className="overflow-hidden rounded-xl border border-sline bg-s1">
          <div className="border-b border-sline/60 bg-s2/50 px-4 py-3">
            <p className="text-sm font-bold text-ink">Выступления по сезонам</p>
          </div>
          <div className="space-y-2 p-3">
            {standings.map((s) => (
              <button
                key={s.season.id}
                onClick={() => navigate(`/league/${s.season.league.id}/table`)}
                className="flex w-full items-center gap-3 rounded-xl border border-sline/50 px-4 py-3 text-left hover:border-gold/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-s2 font-mono text-sm font-bold text-gold">
                  {s.position}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{s.season.league.name}</p>
                  <p className="text-xs text-ink3">{s.season.name}</p>
                </div>
                <div className="ml-auto flex items-center gap-3 text-center font-mono text-xs text-ink2">
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
