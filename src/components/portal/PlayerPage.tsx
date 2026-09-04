"use client";

// Профиль персоны «Ночь под прожекторами»: возраст, позиция, текущая команда
// и номер, роли (игрок/тренер/судья), статистика по лигам·сезонам·командам.
// Логика ролей (по примеру судьи): у судьи карьера — матчи и лиги, а НЕ клубы,
// вкладки «Статистика» (игрок) и «Дисциплина» ему не показываются; у тренера —
// команды, где руководил; комбинированные персоны видят все свои роли.

import { useState } from "react";
import { Flag, Star, Shield, UserCog, Ban, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useFetch, fmtDate, fmtShortDate } from "./hooks";
import { navigate } from "./router";
import { EVENT_LABELS, SOURCE_LABELS, POSITION_LABELS } from "@/lib/labels";
import { LoadingBlock, PositionBadge, EmptyState } from "./ui-bits";
import { EventIcon } from "./EventIcons";
import { Avatar, Breadcrumbs, Crest, StatTile } from "./visuals";

interface PlayerDetail {
  player: {
    id: string;
    name: string;
    birthDate: string | null;
    position: string | null;
    isReferee: boolean;
    referee: {
      matches: number; yellowAvg: number; redAvg: number; penaltyAvg: number;
      avgRating: number | null; ratingsCount: number; debut: string | null;
      byLeague: { league: string; matches: number; yellowAvg: number; redAvg: number; avgRating: number | null }[];
      matchList: { id: string; kickoff: string; home: string; away: string; status: string; league: string; homeScore: number | null; awayScore: number | null }[];
    } | null;
    registrations: {
      team: { id: string; name: string; clubName: string | null };
      season: { id: string; name: string; league: string };
      startDate: string;
      endDate: string | null;
      number: number | null;
      role: string;
    }[];
    suspensions: {
      league: string; source: string; reason: string | null;
      matchesTotal: number; matchesServed: number; isLifetime: boolean; isActive: boolean; createdAt: string;
    }[];
    statsBySeason: {
      season: { id: string; name: string; league: string };
      team: { id: string; name: string };
      stats: {
        games: number; goals: number; penalties: number; ownGoals: number; assists: number;
        yellowCards: number; redCards: number; cleanSheets: number;
      };
    }[];
    events: { id: string; type: string; minute: number; isAssist: boolean; match: { id: string; home: string; away: string; status: string; kickoff: string } }[];
  };
}

function ageOf(iso: string): number {
  const b = new Date(iso);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}
function ageWord(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "год";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "года";
  return "лет";
}
/** «1 матч» / «2 матча» / «5 матчей» */
function matchesWord(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} матч`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} матча`;
  return `${n} матчей`;
}

type Tab = "career" | "stats" | "discipline";

export default function PlayerPage({ personId, initial }: { personId: string; initial?: PlayerDetail | null }) {
  const { data, error } = useFetch<PlayerDetail>(`/api/public/players/${personId}`, 0, initial);
  const [tab, setTab] = useState<Tab>("career");

  if (error) return <EmptyState title="Персона не найдена" hint={error} />;
  if (!data || !data.player) return <LoadingBlock label="Загрузка профиля..." />;

  const p = data.player;

  // ---------- Роли: профиль подстраивается под то, кем человек является ----------
  const isRef = p.isReferee && !!p.referee;
  const hasReg = p.registrations.length > 0;
  const hasPlayerRole = hasReg && p.registrations.some((r) => r.role === "PLAYER") || p.statsBySeason.length > 0;
  const hasCoachRole = hasReg && p.registrations.some((r) => r.role === "COACH");
  const isRefereeOnly = isRef && !hasReg;

  // Карьерные суммы по всем сезонам (игровая карьера)
  const career = p.statsBySeason.reduce(
    (a, s) => ({
      games: a.games + s.stats.games,
      goals: a.goals + s.stats.goals,
      assists: a.assists + s.stats.assists,
      yellow: a.yellow + s.stats.yellowCards,
      red: a.red + s.stats.redCards,
    }),
    { games: 0, goals: 0, assists: 0, yellow: 0, red: 0 }
  );

  const currentReg = p.registrations.find((r) => !r.endDate && r.role === "PLAYER") ?? p.registrations.find((r) => !r.endDate);
  const activeSusp = p.suspensions.filter((s) => s.isActive);
  const roles: string[] = [];
  if (isRef) roles.push("судья");
  if (hasCoachRole) roles.push("тренер");
  if (hasPlayerRole) roles.push("игрок");
  const age = p.birthDate ? ageOf(p.birthDate) : null;
  const currentNumber = currentReg?.role === "PLAYER" ? currentReg.number : null;

  // Вкладки — по фактическим ролям, а не «всем подряд»:
  // судья без игровой карьеры не видит ни игровой статистики, ни дисциплины
  const tabs: { id: Tab; label: string }[] = [{ id: "career", label: "Карьера" }];
  if (p.statsBySeason.length > 0) tabs.push({ id: "stats", label: "Статистика" });
  if (hasPlayerRole || p.suspensions.length > 0) tabs.push({ id: "discipline", label: `Дисциплина${p.suspensions.length ? ` · ${p.suspensions.length}` : ""}` });

  const crumb = isRefereeOnly ? "Судьи" : roles.length === 1 && roles[0] === "тренер" ? "Тренеры" : "Игроки";

  return (
    <div className="space-y-3">
      <Breadcrumbs
        items={[
          { label: "Главная", onClick: () => navigate("/") },
          { label: crumb, onClick: () => navigate("/") },
          { label: p.name },
        ]}
        className="px-1"
      />

      {/* ---------- Гери профиля ---------- */}
      <div className="overflow-hidden rounded-2xl border border-sline bg-s1">
        <div className="stadium-glow flex flex-wrap items-center gap-4 px-4 py-5 sm:px-6">
          <Avatar name={p.name} id={p.id} size="xl" className="ring-2 ring-gold/30" />
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-black tracking-tight text-ink">
              {p.name}
              <PositionBadge position={p.position} />
            </h1>
            {/* Роли человека: игрок / тренер / судья — инвариант «один человек — много ролей» */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {roles.map((r) => (
                <Badge
                  key={r}
                  variant="outline"
                  className={cn(
                    r === "судья" && "border-gold/40 bg-gold/10 text-gold",
                    r === "тренер" && "border-amber-400/40 bg-amber-400/10 text-amber-300",
                    r === "игрок" && "border-ok/40 bg-ok/10 text-ok"
                  )}
                >
                  {r === "судья" && <Flag className="mr-1 h-3 w-3" />}
                  {r === "тренер" && <UserCog className="mr-1 h-3 w-3" />}
                  {r}
                </Badge>
              ))}
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink3">
              {p.position && <span className="text-ink2">{POSITION_LABELS[p.position] ?? p.position}</span>}
              {age !== null && (
                <span className="text-ink2" title={p.birthDate ? `Дата рождения: ${new Date(p.birthDate).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}` : undefined}>
                  {age} {ageWord(age)}
                </span>
              )}
              {currentReg && (
                <button className="flex items-center gap-1.5 text-ink2 hover:text-gold" onClick={() => navigate(`/team/${currentReg.team.id}`)}>
                  <Crest name={currentReg.team.name} id={currentReg.team.id} size="xs" />
                  {currentReg.team.name}
                  {currentNumber && <span className="font-mono text-ink3">№{currentNumber}</span>
                  }
                </button>
              )}
              {p.referee?.debut && <span>в судействе с {new Date(p.referee.debut).getFullYear()}</span>}
            </p>
          </div>
          {activeSusp.length > 0 && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-live/15 px-3 py-1.5 text-xs font-bold text-live" title="Пропустит ближайшие матчи команды">
              <Ban className="h-3.5 w-3.5" /> дисквалифицирован
            </span>
          )}
        </div>

        {/* Карьерные показатели: у игрока — игровая карьера, у судьи — судейская */}
        {career.games > 0 && (
          <div className="grid grid-cols-5 gap-2 border-t border-sline/60 px-4 py-3">
            <StatTile value={career.games} label="матчи" />
            <StatTile value={career.goals} label="голы" accent />
            <StatTile value={career.assists} label="ассисты" />
            <StatTile value={career.yellow} label="ЖК" />
            <StatTile value={career.red} label="КК" />
          </div>
        )}
        {career.games === 0 && isRef && p.referee && (
          <div className="grid grid-cols-4 gap-2 border-t border-sline/60 px-4 py-3">
            <StatTile value={p.referee.matches} label="матчи" accent />
            <StatTile value={p.referee.yellowAvg} label="ЖК/матч" />
            <StatTile value={p.referee.redAvg} label="КК/матч" />
            <StatTile value={p.referee.avgRating ?? "—"} label="рейтинг" accent />
          </div>
        )}
      </div>

      {/* ---------- Вкладки ---------- */}
      <div className="overflow-hidden rounded-xl border border-sline bg-s1">
        <div className="flex gap-1 overflow-x-auto border-b border-sline/60 px-2 scrollbar-none">
          {tabs.map((t) => (
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

        {/* ---- Карьера: заявки/трансферы (игроки и тренеры) + судейская карьера (судьи) ---- */}
        {tab === "career" && (
          <div className="p-4">
            {/* Судейская карьера — самостоятельная, к клубам отношения не имеет */}
            {isRef && p.referee && (
              <div className={cn("rounded-xl border border-sline/50 p-3", hasReg && "mb-4")}>
                <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ink"><Flag className="h-4 w-4 text-gold" /> Судейская карьера</p>
                <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                  {[
                    ["Матчи", p.referee.matches],
                    ["ЖК/матч", p.referee.yellowAvg],
                    ["КК/матч", p.referee.redAvg],
                    ["Пен./матч", p.referee.penaltyAvg],
                    ["Рейтинг", p.referee.avgRating ?? "—"],
                    ["Оценок", p.referee.ratingsCount],
                  ].map(([label, value]) => (
                    <StatTile key={label as string} value={value as string} label={label as string} accent={label === "Рейтинг"} />
                  ))}
                </div>
                {p.referee.avgRating !== null && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-ink2">
                    <Star className="h-3.5 w-3.5 fill-gold text-gold" />
                    Средняя оценка капитанов: <b className="font-mono text-gold">{p.referee.avgRating}</b> из 5
                  </p>
                )}

                {/* Разбивка по лигам */}
                {p.referee.byLeague.length > 0 && (
                  <div className="mt-3 overflow-x-auto scrollbar-s21">
                    <table className="w-full min-w-[420px] text-sm">
                      <thead>
                        <tr className="border-b border-sline/60 text-xs uppercase tracking-wide text-ink3">
                          <th className="px-2 py-2 text-left font-semibold">Лига</th>
                          <th className="px-2 py-2 text-center font-semibold">Матчи</th>
                          <th className="px-2 py-2 text-center font-semibold">ЖК/м</th>
                          <th className="px-2 py-2 text-center font-semibold">КК/м</th>
                          <th className="px-2 py-2 text-center font-semibold">Рейтинг</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.referee.byLeague.map((l) => (
                          <tr key={l.league} className="border-b border-sline/40 last:border-b-0">
                            <td className="px-2 py-2 font-medium text-ink2">{l.league}</td>
                            <td className="px-2 py-2 text-center tabular text-ink">{l.matches}</td>
                            <td className="px-2 py-2 text-center tabular text-amber-400">{l.yellowAvg}</td>
                            <td className="px-2 py-2 text-center tabular text-live">{l.redAvg}</td>
                            <td className="px-2 py-2 text-center tabular font-bold text-gold">{l.avgRating ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {p.referee.matchList.length > 0 && (
                  <div className="mt-3 max-h-64 space-y-1 overflow-y-auto scrollbar-s21">
                    {p.referee.matchList.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => navigate(`/match/${m.id}`)}
                        className="flex w-full items-center gap-3 rounded-lg bg-s2/40 px-3 py-2 text-left text-sm hover:bg-s2/80"
                      >
                        <span className="w-20 shrink-0 text-xs text-ink3">{fmtShortDate(m.kickoff)}</span>
                        <span className="min-w-0 flex-1 truncate font-medium text-ink2">{m.home} — {m.away}</span>
                        <span className="shrink-0 font-mono text-sm font-bold text-gold">
                          {m.status === "COMPLETED" ? `${m.homeScore}:${m.awayScore}` : m.status === "WALKOVER" ? "WO" : "—"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Клубная карьера: заявки/трансферы — только у игроков и тренеров */}
            {hasReg && (
              <>
                <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ink"><ArrowRightLeft className="h-4 w-4 text-gold" /> Заявки и трансферы</p>
                <div className="space-y-1.5">
                  {p.registrations.map((r, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2.5 rounded-xl border border-sline/50 bg-s2/30 px-3 py-2.5 text-sm">
                      <Crest name={r.team.name} id={r.team.id} size="sm" />
                      <button className="min-w-0 font-semibold text-ink hover:text-gold" onClick={() => navigate(`/team/${r.team.id}`)}>
                        {r.team.name}
                      </button>
                      {r.role === "COACH" && (
                        <Badge variant="outline" className="border-amber-400/40 bg-amber-400/10 text-amber-300">
                          <UserCog className="mr-1 h-3 w-3" />тренер
                        </Badge>
                      )}
                      <span className="hidden text-xs text-ink3 sm:inline">{r.season.league} · {r.season.name}</span>
                      <span className="ml-auto text-xs text-ink3">
                        {fmtShortDate(r.startDate)} — {r.endDate ? fmtShortDate(r.endDate) : "н.в."}
                      </span>
                      {r.number && <Badge variant="secondary" className="bg-s2 font-mono text-ink2">№{r.number}</Badge>}
                      {r.endDate && <Badge variant="outline" className="border-amber-400/40 bg-amber-400/10 text-amber-300">отзаявлен</Badge>}
                    </div>
                  ))}
                </div>

                {p.events.length > 0 && (
                  <>
                    <p className="mb-2 mt-5 text-sm font-bold text-ink">Участие в событиях</p>
                    <div className="max-h-72 space-y-1 overflow-y-auto scrollbar-s21">
                      {p.events.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => navigate(`/match/${e.match.id}`)}
                          className="flex w-full items-center gap-2 rounded-lg bg-s2/40 px-3 py-2 text-left text-sm hover:bg-s2/80"
                        >
                          <EventIcon type={e.type} />
                          <span className="min-w-0 flex-1 truncate text-xs text-ink2">{e.match.home} — {e.match.away}</span>
                          <span className="ml-auto shrink-0 font-mono text-xs text-ink3">
                            {e.isAssist ? `ассист ${e.minute}&apos;` : e.type === "GOAL" || e.type === "PENALTY" ? `гол ${e.minute}&apos;` : `${EVENT_LABELS[e.type] ?? e.type} ${e.minute}&apos;`}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ---- Игровая статистика по сезонам: лига·сезон·команда ---- */}
        {tab === "stats" && (
          <div className="p-4">
            {p.statsBySeason.length > 0 ? (
              <div className="overflow-x-auto scrollbar-s21">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-sline/60 text-xs uppercase tracking-wide text-ink3">
                      <th className="px-2 py-2 text-left font-semibold">Лига · сезон</th>
                      <th className="px-2 py-2 text-left font-semibold">Команда</th>
                      <th className="px-2 py-2 text-center font-semibold" title="Матчи">И</th>
                      <th className="px-2 py-2 text-center font-semibold" title="Голы">Г</th>
                      <th className="px-2 py-2 text-center font-semibold" title="Пенальти">П</th>
                      <th className="px-2 py-2 text-center font-semibold" title="Ассисты">А</th>
                      <th className="px-2 py-2 text-center font-semibold" title="Жёлтые">ЖК</th>
                      <th className="px-2 py-2 text-center font-semibold" title="Красные">КК</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.statsBySeason.map((s, i) => (
                      <tr key={i} className="border-b border-sline/40 last:border-b-0 hover:bg-s2/40">
                        <td className="px-2 py-2.5">
                          <span className="block text-xs font-semibold text-ink">{s.season.league}</span>
                          <span className="block text-xs text-ink3">{s.season.name}</span>
                        </td>
                        <td className="px-2 py-2.5">
                          <button className="flex items-center gap-1.5 text-ink2 hover:text-gold" onClick={() => navigate(`/team/${s.team.id}`)}>
                            <Crest name={s.team.name} id={s.team.id} size="xs" />
                            <span className="truncate text-xs font-medium">{s.team.name}</span>
                          </button>
                        </td>
                        <td className="px-2 py-2.5 text-center tabular text-ink">{s.stats.games}</td>
                        <td className="px-2 py-2.5 text-center tabular font-bold text-gold">{s.stats.goals}</td>
                        <td className="px-2 py-2.5 text-center tabular text-ink2">{s.stats.penalties}</td>
                        <td className="px-2 py-2.5 text-center tabular text-ink2">{s.stats.assists}</td>
                        <td className="px-2 py-2.5 text-center tabular text-amber-400">{s.stats.yellowCards}</td>
                        <td className="px-2 py-2.5 text-center tabular text-live">{s.stats.redCards}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-2 pt-2 text-xs text-ink3">
                  Техпоражения (WO) не учитываются в индивидуальной статистике — инвариант Epic 2.
                </p>
              </div>
            ) : (
              <EmptyState icon={<Shield className="h-6 w-6 opacity-50" />} title="Игровой статистики нет" hint="Персона не участвовала в матчах как игрок" />
            )}
          </div>
        )}

        {/* ---- Дисциплина: только у игроков (судьям карточки не показывают) ---- */}
        {tab === "discipline" && (
          <div className="p-4">
            {p.suspensions.length === 0 && (
              <EmptyState icon={<Ban className="h-6 w-6 opacity-50" />} title="Дисциплинарная история чиста" hint="Дисквалификаций не было" />
            )}
            {p.suspensions.map((s, i) => {
              const served = s.isLifetime ? 100 : Math.round((s.matchesServed / s.matchesTotal) * 100);
              return (
                <div key={i} className={cn("mb-2 rounded-xl border px-3 py-2.5 text-sm last:mb-0", s.isActive ? "border-live/40 bg-live/10" : "border-sline/50 bg-s2/30")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{SOURCE_LABELS[s.source] ?? s.source}</span>
                    <span className="text-xs text-ink3">{s.league}</span>
                    <span className="text-xs text-ink3">{fmtDate(s.createdAt, false)}</span>
                    <span className={cn("ml-auto text-xs font-bold", s.isActive ? "text-live" : "text-ink3")}>
                      {s.isLifetime ? "пожизненно" : s.isActive ? `осталось ${matchesWord(s.matchesTotal - s.matchesServed)}` : `отбыто ${s.matchesServed}/${s.matchesTotal}`}
                    </span>
                  </div>
                  {!s.isLifetime && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-s2">
                      <div className={cn("h-full rounded-full", s.isActive ? "bg-live" : "bg-gold")} style={{ width: `${served}%` }} />
                    </div>
                  )}
                  {s.reason && <p className="mt-1.5 text-xs text-ink2">{s.reason}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
