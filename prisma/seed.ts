// Seed: демо-данные портала «Футбол Чувашии».
// Использует боевые движки (schedule, lifecycle, discipline) — dogfooding логики.
// Даты — динамические относительно «сегодня» (МСК): Премьер-лига — туры 1–5 сыграны,
// 6-й сегодня (вкл. LIVE «за 1-е место»), 7-й — через неделю.

import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";
import { generateRoundRobin } from "../src/lib/engine/schedule";
import { completeMatch, assignWalkover } from "../src/lib/engine/lifecycle";

const db = new PrismaClient();

// ---------- Детерминированный RNG ----------
let seed = 20260831;
function rng(): number {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

// ---------- Даты (динамика от «сегодня», МСК) ----------
const MSK_OFFSET = 3 * 3600 * 1000;
const dayStr = (offsetDays: number): string => {
  const d = new Date(Date.now() + MSK_OFFSET + offsetDays * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};
const today = dayStr(0);
const MSK = (dateStr: string, hour: number) => {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, hour) - MSK_OFFSET);
};

// ---------- Справочники ----------
const FIRST = ["Алексей", "Иван", "Сергей", "Дмитрий", "Павел", "Евгений", "Михаил", "Андрей", "Максим", "Владислав", "Никита", "Артём", "Роман", "Кирилл", "Денис", "Юрий", "Илья", "Виктор", "Александр", "Егор", "Марат", "Рустам", "Айрат", "Наиль", "Ильдар", "Тимофей", "Владимир", "Григорий", "Олег", "Станислав"];
const LAST = ["Иванов", "Петров", "Кузнецов", "Смирнов", "Попов", "Васильев", "Павлов", "Семёнов", "Богданов", "Воробьёв", "Фёдоров", "Михайлов", "Белов", "Тарасов", "Комиссаров", "Давыдов", "Беляев", "Григорьев", "Панов", "Егоров", "Никитин", "Зайцев", "Артемьев", "Козлов", "Степанов", "Лебедев", "Антонов", "Максимов", "Крылов", "Гусев", "Денисов", "Коновалов", "Щербаков", "Тимофеев", "Орлов", "Афанасьев", "Филиппов", "Марков", "Романов", "Краснов", "Ерёмин", "Соловьёв", "Черкасов", "Николаев", "Гаврилов", "Захаров", "Яковлев", "Родионов", "Сафин", "Валиев"];
const MIDDLE = ["Александрович", "Иванович", "Сергеевич", "Дмитриевич", "Павлович", "Евгеньевич", "Михайлович", "Андреевич", "Максимович", "Владиславович", "Никитич", "Артёмович", "Романович", "Кириллович", "Юрьевич"];

const usedNames = new Set<string>();
function makePersonData(position: string) {
  for (let i = 0; i < 200; i++) {
    const first = pick(FIRST), last = pick(LAST), middle = pick(MIDDLE);
    const key = `${last}|${first}|${middle}`;
    if (usedNames.has(key)) continue;
    usedNames.add(key);
    return {
      firstName: first, lastName: last, middleName: middle,
      birthDate: new Date(`${ri(1985, 2005)}-${String(ri(1, 12)).padStart(2, "0")}-${String(ri(1, 28)).padStart(2, "0")}T00:00:00Z`),
      position,
    };
  }
  return { firstName: "Игорь", lastName: `Игрок${ri(1, 999)}`, middleName: "Иванович", birthDate: null, position };
}

const POSITIONS_F11 = ["GK", "GK", "DF", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "MF", "MF", "FW", "FW", "FW"];
const POSITIONS_FUTSAL = ["GK", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW"];
const POSITIONS_F8 = ["GK", "DF", "DF", "DF", "MF", "MF", "FW", "FW"];
const POSITIONS_F6 = ["GK", "DF", "MF", "MF", "FW", "FW"];

async function main() {
  console.log("🧹 Очистка БД...");
  const tables = ["auditLog", "refereeRating", "suspension", "lineupEntry", "matchEvent", "registration", "match", "stage", "season", "league", "banner", "stadium", "team", "club", "person", "user"];
  for (const t of tables) {
    await (db as any)[t].deleteMany();
  }

  // ---------- Стадионы ----------
  console.log("🏟 Стадионы...");
  const stadiumNames: [string, string, number][] = [
    ["Центральный", "Чебоксары", 15000], ["Олимпийский", "Новочебоксарск", 3200], ["Спартаковец", "Чебоксары", 1200],
    ["Сокол", "Алатырь", 2500], ["Юность", "Шумерля", 1500], ["Динамо", "Чебоксары", 800], ["Заря", "Кугеси", 600],
  ];
  const stadiums = await Promise.all(
    stadiumNames.map(([name, city, capacity]) => db.stadium.create({ data: { name, city, capacity, address: `г. ${city}` } }))
  );

  // ---------- Клубы и команды (инвариант №1: Club ≠ Team) ----------
  console.log("⚽ Клубы и команды...");
  const teamDefsL1 = [
    ["Урняк", "Кугеси"], ["Спартак", "Чебоксары"], ["Энергия", "Новочебоксарск"], ["Сокол", "Алатырь"],
    ["Динамо", "Чебоксары"], ["Волга", "Чебоксары"], ["Химик", "Новочебоксарск"], ["Атал", "Шумерля"],
  ];
  const teamsL1: { id: string; name: string }[] = [];
  for (const [name, city] of teamDefsL1) {
    const club = await db.club.create({ data: { name: `ФК «${name}»`, city } });
    const team = await db.team.create({ data: { name: `${name}-${city.slice(0, 2).toUpperCase()}`, clubId: club.id, city } });
    teamsL1.push({ id: team.id, name: team.name });
  }

  const teamDefsL2 = [["Стрела", "Чебоксары"], ["Ярославль-м", "Чебоксары"], ["Звезда", "Новочебоксарск"], ["Торпедо", "Алатырь"], ["Сигнал", "Шумерля"], ["Олимп", "Цивильск"]];
  const teamsL2: { id: string; name: string }[] = [];
  for (const [name, city] of teamDefsL2) {
    const club = await db.club.create({ data: { name: `МФК «${name}»`, city } });
    const team = await db.team.create({ data: { name: `М-${name}`, clubId: club.id, city } });
    teamsL2.push({ id: team.id, name: team.name });
  }

  const teamDefsL3 = [["Труд", "Цивильск"], ["Смена", "Чебоксары"], ["Метеор", "Канаш"], ["Локомотив", "Новочебоксарск"], ["Родина", "Мариинский Посад"], ["Восход", "Ядрин"]];
  const teamsL3: { id: string; name: string }[] = [];
  for (const [name, city] of teamDefsL3) {
    const club = await db.club.create({ data: { name: `КК «${name}»`, city } });
    const team = await db.team.create({ data: { name: `${name}-8`, clubId: club.id, city } });
    teamsL3.push({ id: team.id, name: team.name });
  }

  const teamDefsL4 = [["Факел", "Чебоксары"], ["Ротор", "Канаш"], ["Полёт", "Шумерля"], ["Знамя", "Алатырь"], ["Молот", "Цивильск"], ["Орбита", "Новочебоксарск"]];
  const teamsL4: { id: string; name: string }[] = [];
  for (const [name, city] of teamDefsL4) {
    const club = await db.club.create({ data: { name: `ФК «${name}-6»`, city } });
    const team = await db.team.create({ data: { name: `${name}-6`, clubId: club.id, city } });
    teamsL4.push({ id: team.id, name: team.name });
  }

  // ---------- Лиги и сезоны ----------
  console.log("🏆 Лиги (4 формата)...");
  const league1 = await db.league.create({
    data: {
      name: "Премьер-лига ФФ Чувашии", shortName: "Премьер-лига", format: "F11",
      isPinned: true, priority: 1,
      yellowCardLimit: 3, yellowCardBanMatches: 1, redCardBanMatches: 1,
      walkoverScore: 3,
      transferWindowEnd: MSK(dayStr(15), 23),
    },
  });
  const league2 = await db.league.create({
    data: {
      name: "Мини-футбол. Высшая лига", shortName: "Высшая лига (мини)", format: "FUTSAL",
      isPinned: true, priority: 2,
      yellowCardLimit: 3, yellowCardBanMatches: 1, redCardBanMatches: 1,
      walkoverScore: 5,
    },
  });
  const league3 = await db.league.create({
    data: {
      name: "Восьмёрка. Высшая лига", shortName: "Высшая лига (8×8)", format: "F8",
      isPinned: true, priority: 3,
      yellowCardLimit: 3, yellowCardBanMatches: 1, redCardBanMatches: 1,
      walkoverScore: 3,
    },
  });
  const league4 = await db.league.create({
    data: {
      name: "Шестёрка. Открытая лига", shortName: "Открытая лига (6×6)", format: "F6",
      isPinned: false,
      yellowCardLimit: 4, yellowCardBanMatches: 1, redCardBanMatches: 1,
      walkoverScore: 3,
    },
  });

  const seasonStart = MSK(dayStr(-30), 12);
  const season1 = await db.season.create({ data: { leagueId: league1.id, name: "Сезон 2026", startDate: seasonStart, isCurrent: true } });
  const season2 = await db.season.create({ data: { leagueId: league2.id, name: "Сезон 2026", startDate: seasonStart, isCurrent: true } });
  const season3 = await db.season.create({ data: { leagueId: league3.id, name: "Сезон 2026", startDate: seasonStart, isCurrent: true } });
  const season4 = await db.season.create({ data: { leagueId: league4.id, name: "Сезон 2026", startDate: seasonStart, isCurrent: true } });

  // ---------- Игроки, тренеры и заявки ----------
  console.log("👥 Игроки, тренеры, заявки...");
  const createSquad = async (teamId: string, seasonId: string, positions: string[], startDate: Date) => {
    const players: { id: string; position: string }[] = [];
    let number = 1;
    for (const pos of positions) {
      const person = await db.person.create({ data: makePersonData(pos) });
      await db.registration.create({
        data: { personId: person.id, teamId, seasonId, startDate, number: number++ },
      });
      players.push({ id: person.id, position: pos });
    }
    // тренер (Registration.role = COACH — человек может быть тренером и игроком в разных лигах)
    const coach = await db.person.create({ data: makePersonData("MF") });
    await db.registration.create({
      data: { personId: coach.id, teamId, seasonId, startDate, role: "COACH" },
    });
    return players;
  };

  const squadsL1 = new Map<string, { id: string; position: string }[]>();
  for (const t of teamsL1) squadsL1.set(t.id, await createSquad(t.id, season1.id, POSITIONS_F11, seasonStart));
  const squadsL2 = new Map<string, { id: string; position: string }[]>();
  for (const t of teamsL2) squadsL2.set(t.id, await createSquad(t.id, season2.id, POSITIONS_FUTSAL, seasonStart));
  const squadsL3 = new Map<string, { id: string; position: string }[]>();
  for (const t of teamsL3) squadsL3.set(t.id, await createSquad(t.id, season3.id, POSITIONS_F8, seasonStart));
  const squadsL4 = new Map<string, { id: string; position: string }[]>();
  for (const t of teamsL4) squadsL4.set(t.id, await createSquad(t.id, season4.id, POSITIONS_F6, seasonStart));

  // ---------- Судьи ----------
  console.log("🧑‍⚖️ Судьи...");
  const refereeDefs = [
    ["Смирнов", "Александр", "Петрович"], ["Григорьев", "Николай", "Сергеевич"], ["Артемьев", "Владимир", "Иванович"],
  ];
  const referees = await Promise.all(
    refereeDefs.map(([lastName, firstName, middleName]) =>
      db.person.create({ data: { firstName, lastName, middleName, isReferee: true } })
    )
  );

  // ---------- Пользователи ----------
  console.log("🔐 Пользователи...");
  const [superAdmin, leagueAdmin, refereeUser, clubUser] = await Promise.all([
    db.user.create({ data: { email: "admin@ff21.ru", passwordHash: hashPassword("admin123"), role: "SUPER_ADMIN" } }),
    db.user.create({ data: { email: "liga@ff21.ru", passwordHash: hashPassword("liga123"), role: "LEAGUE_ADMIN" } }),
    db.user.create({ data: { email: "sudya@ff21.ru", passwordHash: hashPassword("sudya123"), role: "REFEREE", personId: referees[0].id } }),
    db.user.create({ data: { email: "club@ff21.ru", passwordHash: hashPassword("club123"), role: "CLUB_ADMIN", clubId: (await db.club.findFirst({ where: { name: { contains: "Урняк" } } }))!.id } }),
  ]);
  console.log(`   admin@ff21.ru / liga@ff21.ru / sudya@ff21.ru / club@ff21.ru · seed ${today}`);

  // ---------- Расписание (round-robin) ----------
  console.log("📅 Расписание...");
  const mkStage = (seasonId: string) =>
    db.stage.create({ data: { seasonId, name: "Регулярный чемпионат", type: "ROUND_ROBIN" } });
  const stage1 = await mkStage(season1.id);
  const stage2 = await mkStage(season2.id);
  const stage3 = await mkStage(season3.id);
  const stage4 = await mkStage(season4.id);

  const slots1 = generateRoundRobin(teamsL1.map((t) => t.id), false); // 7 туров
  const slots2 = generateRoundRobin(teamsL2.map((t) => t.id), false); // 5 туров
  const slots3 = generateRoundRobin(teamsL3.map((t) => t.id), false); // 5 туров
  const slots4 = generateRoundRobin(teamsL4.map((t) => t.id), false); // 5 туров

  const roundDatesL1 = [dayStr(-28), dayStr(-25), dayStr(-21), dayStr(-18), dayStr(-14), today, dayStr(7)];
  const roundDatesL2 = [dayStr(-14), dayStr(-7), today, dayStr(7), dayStr(14)];
  const roundDatesL3 = [dayStr(-7), today, dayStr(7), dayStr(14), dayStr(21)];
  const roundDatesL4 = [dayStr(-3), dayStr(1), dayStr(8), dayStr(15), dayStr(22)];
  const timesL1 = [11, 13, 15, 17];
  const timesL2 = [16, 18, 20];
  const timesL3 = [12, 14, 16];
  const timesL4 = [12, 14, 16];

  type SeedMatch = { id: string; round: number; home: string; away: string; kickoff: Date };

  const buildCalendar = async (
    slots: { round: number; homeTeamId: string; awayTeamId: string }[],
    stageId: string,
    roundDates: string[],
    times: number[],
    assignRefereesFrom?: number
  ): Promise<SeedMatch[]> => {
    const out: SeedMatch[] = [];
    const byRound = new Map<number, number>();
    for (const s of slots) {
      const idx = byRound.get(s.round) ?? 0;
      byRound.set(s.round, idx + 1);
      const stadium = stadiums[(s.round + idx) % stadiums.length];
      const hour = s.round === assignRefereesFrom ? times[idx % times.length] : times[idx % times.length];
      const refereeId = assignRefereesFrom && s.round >= assignRefereesFrom
        ? referees[(s.round + idx) % referees.length].id
        : null;
      const m = await db.match.create({
        data: {
          stageId, round: s.round,
          homeTeamId: s.homeTeamId, awayTeamId: s.awayTeamId,
          stadiumId: stadium.id,
          kickoff: MSK(roundDates[s.round - 1], hour),
          refereeId,
        },
      });
      out.push({ id: m.id, round: s.round, home: s.homeTeamId, away: s.awayTeamId, kickoff: m.kickoff });
    }
    return out;
  };

  const matchesL1 = await buildCalendar(slots1, stage1.id, roundDatesL1, timesL1, 4);
  const matchesL2 = await buildCalendar(slots2, stage2.id, roundDatesL2, timesL2, 3);
  const matchesL3 = await buildCalendar(slots3, stage3.id, roundDatesL3, timesL3, 2);
  const matchesL4 = await buildCalendar(slots4, stage4.id, roundDatesL4, timesL4, 2);

  // ---------- Симуляция сыгранных туров ----------
  console.log("📋 Протоколы сыгранных матчей...");
  const weightByPos: Record<string, number> = { FW: 5, MF: 3, DF: 1, GK: 0 };

  const simulate = async (
    m: SeedMatch,
    squads: Map<string, { id: string; position: string }[]>,
    lineupSize: number,
    forced?: { redCard?: { side: "home" | "away"; minute: number }; yellows?: { side: "home" | "away"; personId?: string }[]; score?: [number, number] }
  ) => {
    const ref = pick(referees);
    await db.match.update({ where: { id: m.id }, data: { refereeId: ref.id } });

    const homeSquad = squads.get(m.home)!;
    const awaySquad = squads.get(m.away)!;
    const choose = (squad: { id: string; position: string }[], mustInclude: string[] = []) => {
      const gk = squad.filter((p) => p.position === "GK");
      const must = squad.filter((p) => mustInclude.includes(p.id) && p.position !== "GK");
      const rest = squad.filter((p) => p.position !== "GK" && !mustInclude.includes(p.id));
      const shuffled = [...rest].sort(() => rng() - 0.5).slice(0, Math.max(0, lineupSize - gk.length - must.length));
      return [...gk, ...must, ...shuffled];
    };
    const mustHome = (forced?.yellows ?? []).filter((y) => y.side === "home" && y.personId).map((y) => y.personId!);
    const mustAway = (forced?.yellows ?? []).filter((y) => y.side === "away" && y.personId).map((y) => y.personId!);
    const homeLineup = choose(homeSquad, mustHome);
    const awayLineup = choose(awaySquad, mustAway);

    await db.lineupEntry.createMany({
      data: [
        ...homeLineup.map((p, i) => ({ matchId: m.id, teamId: m.home, personId: p.id, isStarter: i < lineupSize - 3, number: i + 1 })),
        ...awayLineup.map((p, i) => ({ matchId: m.id, teamId: m.away, personId: p.id, isStarter: i < lineupSize - 3, number: i + 1 })),
      ],
    });

    const homeGoals = forced?.score ? forced.score[0] : ri(0, 4);
    const awayGoals = forced?.score ? forced.score[1] : ri(0, 4);
    const events: { minute: number; type: string; personId: string; teamId: string; assistPersonId?: string }[] = [];
    const minutes = new Set<number>();
    const uniqueMinute = () => { let x = ri(1, 90); while (minutes.has(x)) x = ri(1, 90); minutes.add(x); return x; };
    const scorerFrom = (lineup: { id: string; position: string }[], team: { id: string; position: string }[]) => {
      const pool = [...lineup, ...team];
      const weighted: string[] = [];
      for (const p of pool) for (let i = 0; i < (weightByPos[p.position] ?? 1); i++) weighted.push(p.id);
      return pick(weighted);
    };

    for (let g = 0; g < homeGoals; g++) {
      const personId = scorerFrom(homeLineup, homeSquad);
      const isPen = rng() < 0.12;
      let assistPersonId: string | undefined;
      if (!isPen && rng() < 0.6) {
        const cand = pick(homeLineup).id;
        if (cand !== personId) assistPersonId = cand;
      }
      events.push({ minute: uniqueMinute(), type: isPen ? "PENALTY" : "GOAL", personId, teamId: m.home, assistPersonId });
    }
    for (let g = 0; g < awayGoals; g++) {
      const personId = scorerFrom(awayLineup, awaySquad);
      const isPen = rng() < 0.12;
      let assistPersonId: string | undefined;
      if (!isPen && rng() < 0.6) {
        const cand = pick(awayLineup).id;
        if (cand !== personId) assistPersonId = cand;
      }
      events.push({ minute: uniqueMinute(), type: isPen ? "PENALTY" : "GOAL", personId, teamId: m.away, assistPersonId });
    }

    const yc = ri(0, 3);
    for (let y = 0; y < yc; y++) {
      const home = rng() < 0.5;
      const lineup = home ? homeLineup : awayLineup;
      const p = pick(lineup);
      if (events.some((e) => e.personId === p.id && e.type === "RED_CARD")) continue;
      events.push({ minute: uniqueMinute(), type: "YELLOW_CARD", personId: p.id, teamId: home ? m.home : m.away });
    }

    if (forced?.redCard) {
      const lineup = forced.redCard.side === "home" ? homeLineup : awayLineup;
      const p = pick(lineup.filter((x) => x.position !== "GK"));
      events.push({ minute: forced.redCard.minute, type: "RED_CARD", personId: p.id, teamId: forced.redCard.side === "home" ? m.home : m.away });
    }
    if (forced?.yellows) {
      for (const y of forced.yellows) {
        const lineup = y.side === "home" ? homeLineup : awayLineup;
        const p = y.personId
          ? lineup.find((x) => x.id === y.personId)
          : pick(lineup.filter((x) => x.position === "DF"));
        if (!p) continue;
        if (events.some((e) => e.personId === p.id && (e.type === "RED_CARD" || e.type === "YELLOW_CARD"))) continue;
        events.push({ minute: uniqueMinute(), type: "YELLOW_CARD", personId: p.id, teamId: y.side === "home" ? m.home : m.away });
      }
    }

    events.sort((a, b) => a.minute - b.minute);
    for (const e of events) {
      await db.matchEvent.create({ data: { ...e, matchId: m.id } });
    }

    await completeMatch(m.id, null);
  };

  // LIVE-матч сегодня (тур 4): счёт в БД, события есть, завершения нет.
  // Начало — 38 минут назад: лента показывает «на какой минуте» и время старта.
  const startLive = async (m: SeedMatch, squads: Map<string, { id: string; position: string }[]>, lineupSize: number) => {
    await db.match.update({ where: { id: m.id }, data: { kickoff: new Date(Date.now() - 38 * 60000) } });
    const homeSquad = squads.get(m.home)!;
    const awaySquad = squads.get(m.away)!;
    const lineup = (squad: { id: string; position: string }[]) => [
      ...squad.filter((p) => p.position === "GK"),
      ...squad.filter((p) => p.position !== "GK").slice(0, lineupSize - 1),
    ];
    const homeLineup = lineup(homeSquad);
    const awayLineup = lineup(awaySquad);
    // запасные хозяев — для демонстрации замены
    const homeBench = homeSquad.filter((p) => !homeLineup.some((x) => x.id === p.id)).slice(0, 2);
    await db.lineupEntry.createMany({
      data: [
        ...homeLineup.map((p, i) => ({ matchId: m.id, teamId: m.home, personId: p.id, isStarter: true, number: i + 1 })),
        ...homeBench.map((p, i) => ({ matchId: m.id, teamId: m.home, personId: p.id, isStarter: false, number: 12 + i })),
        ...awayLineup.map((p, i) => ({ matchId: m.id, teamId: m.away, personId: p.id, isStarter: true, number: i + 1 })),
      ],
    });
    const scorer = pick(homeLineup.filter((p) => p.position !== "GK"));
    await db.matchEvent.create({
      data: { matchId: m.id, minute: 23, type: "GOAL", personId: scorer.id, teamId: m.home, assistPersonId: pick(homeLineup.filter((p) => p.id !== scorer.id && p.position !== "GK")).id },
    });
    await db.matchEvent.create({
      data: { matchId: m.id, minute: 41, type: "GOAL", personId: pick(awayLineup.filter((p) => p.position !== "GK") ?? awayLineup).id, teamId: m.away },
    });
    // VAR: проверка взятия ворот — гол подтверждён; у гостей гол отменён
    await db.matchEvent.create({
      data: { matchId: m.id, minute: 25, type: "VAR_GOAL_CONFIRM", personId: scorer.id, teamId: m.home },
    });
    await db.matchEvent.create({
      data: { matchId: m.id, minute: 31, type: "VAR_GOAL_CANCEL", personId: pick(awayLineup.filter((p) => p.position !== "GK") ?? awayLineup).id, teamId: m.away },
    });
    // замена хозяев (30'): уходит полузащитник, выходит запасный
    const outPlayer = homeLineup.filter((p) => p.position === "MF")[1] ?? homeLineup[5];
    const inPlayer = homeBench[0];
    if (outPlayer && inPlayer) {
      await db.matchEvent.createMany({
        data: [
          { matchId: m.id, minute: 30, type: "SUB_OUT", personId: outPlayer.id, teamId: m.home },
          { matchId: m.id, minute: 30, type: "SUB_IN", personId: inPlayer.id, teamId: m.home },
        ],
      });
    }
    await db.match.update({ where: { id: m.id }, data: { status: "LIVE", homeScore: 1, awayScore: 1 } });
  };

  // Лига 1 (F11): туры 1–5 сыграны; в 3-м туре — WO, в 5-м — красная (бан активен);
  // 6-й тур сегодня: 1 LIVE «за 1-е место» + 3 предстоящих, 7-й — через неделю
  const himikDF = squadsL1.get(teamsL1[6].id)!.find((p) => p.position === "DF")!;
  const himikSide = (m: { home: string; away: string }): "home" | "away" | null =>
    m.home === teamsL1[6].id ? "home" : m.away === teamsL1[6].id ? "away" : null;

  const r1 = matchesL1.filter((m) => m.round === 1);
  const r2 = matchesL1.filter((m) => m.round === 2);
  const r3 = matchesL1.filter((m) => m.round === 3);
  const r4 = matchesL1.filter((m) => m.round === 4);
  const r5 = matchesL1.filter((m) => m.round === 5);
  const r6 = matchesL1.filter((m) => m.round === 6);

  const woMatch = r3[1]; // Урняк-КУ vs Энергия-НБ — неявка хозяев

  // ---------- «Эмоции турнира»: гарантированные сигналы ----------
  // hotTeam — Волга и silverTeam — Атал: по 5 побед (🔥), в 6-м туре встречаются
  // за 1-е место (обе по 15 очков) — это LIVE-матч дня. coldTeam — Сокол:
  // 5 поражений (❄) + смена тренера. Не трогаем Химик (сценарий ЖК) и команды WO-матча.
  const woTeams = new Set([woMatch.home, woMatch.away]);
  const signalExcluded = new Set<string>([teamsL1[6].id, ...woTeams]);
  const hotTeam = teamsL1[5]; // Волга-ЧБ
  const silverTeam = teamsL1[7]; // Атал-ШМ
  const coldTeam = teamsL1.find((t) => !signalExcluded.has(t.id) && t.id !== hotTeam.id && t.id !== silverTeam.id)!; // Сокол-АЛ
  const forcedScoreFor = (m: SeedMatch, round: number): [number, number] | undefined => {
    const side = (id: string): "home" | "away" | null => (m.home === id ? "home" : m.away === id ? "away" : null);
    const hotSide = side(hotTeam.id);
    const silverSide = side(silverTeam.id);
    const coldSide = side(coldTeam.id);
    // «горячая» побеждает; в 4-м туре — разгром 10:1 (инсайт превью «забивала 10+»)
    if (hotSide) {
      if (round === 4) return hotSide === "home" ? [10, 1] : [1, 10];
      return hotSide === "home" ? [3, 1] : [1, 3];
    }
    if (silverSide) return silverSide === "home" ? [2, 0] : [0, 2];
    // «холодная» проигрывает; в 5-м туре — 0:10 (инсайт «пропускала 10+»)
    if (coldSide) {
      if (round === 5) return coldSide === "home" ? [0, 10] : [10, 0];
      return coldSide === "home" ? [0, 3] : [3, 0];
    }
    return undefined;
  };

  for (const m of r1) {
    await simulate(m, squadsL1, 11, { score: forcedScoreFor(m, 1) });
  }
  for (const m of r2) {
    await simulate(m, squadsL1, 11, { score: forcedScoreFor(m, 2) });
  }

  // туры 3–5: WO в 3-м, красная карточка в 5-м (бан не отсижен — активен);
  // ЖК-накопление Химика — по одной в турах 3–5: 3-я ЖК в последнем сыгранном
  // туре → бан активен и не «отсиживается» (игрок не играет под баном)
  const redCardMatch = r5.find((m) => !himikSide(m) && ![hotTeam.id, silverTeam.id, coldTeam.id].includes(m.home) && ![hotTeam.id, silverTeam.id, coldTeam.id].includes(m.away))!;
  for (const m of r3) {
    if (m.id === woMatch.id) continue;
    const side = himikSide(m);
    const extraY = side ? { yellows: [{ side, personId: himikDF.id }] } : {};
    await simulate(m, squadsL1, 11, { ...extraY, score: forcedScoreFor(m, 3) });
  }
  for (const m of r4) {
    const side = himikSide(m);
    const extraY = side ? { yellows: [{ side, personId: himikDF.id }] } : {};
    await simulate(m, squadsL1, 11, { ...extraY, score: forcedScoreFor(m, 4) });
  }
  for (const m of r5) {
    const side = himikSide(m);
    const extraY = side ? { yellows: [{ side, personId: himikDF.id }] } : {};
    const forced: { redCard?: { side: "home" | "away"; minute: number } } = m.id === redCardMatch.id ? { redCard: { side: "away", minute: 74 } } : {};
    await simulate(m, squadsL1, 11, { ...forced, ...extraY, score: forcedScoreFor(m, 5) });
  }
  await assignWalkover(woMatch.id, "HOME", null, "Неявка команды хозяев на матч (сообщение судьи)");
  // LIVE «за 1-е место»: Волга и Атал с 15 очками встречаются в 6-м туре
  await startLive(r6[0], squadsL1, 11);

  // Лига 2 (футзал): туры 1–2 сыграны (в 1-м — срыв WO_BOTH, во 2-м — разгром 11:2), тур 3 сегодня
  const r1L2 = matchesL2.filter((m) => m.round === 1);
  const r2L2 = matchesL2.filter((m) => m.round === 2);
  const woBoth = r1L2[0];
  for (const m of r1L2) {
    if (m.id === woBoth.id) continue;
    await simulate(m, squadsL2, 6);
  }
  let routIdx = 0;
  for (const m of r2L2) {
    // один матч — 11:2: инсайт «забивала 10+ в одном матче» для футзала
    await simulate(m, squadsL2, 6, routIdx === 1 ? { score: [11, 2] } : undefined);
    routIdx++;
  }
  await assignWalkover(woBoth.id, "BOTH", null, "Обе команды не явились — срыв матча");

  // Лига 3 (8×8): тур 1 сыгран
  for (const m of matchesL3.filter((x) => x.round === 1)) await simulate(m, squadsL3, 8);

  // Лига 4 (6×6): тур 1 сыгран
  for (const m of matchesL4.filter((x) => x.round === 1)) await simulate(m, squadsL4, 6);

  // ---------- Трансфер (Epic 3): полузащитник «Волги» перешёл в «Динамо» после 5-го тура ----------
  // (не FW: бомбардир должен оставаться в «Волге» — иначе сюжет «без бомбардира» теряет смысл)
  console.log("🔄 Трансфер...");
  const volgaSquad = squadsL1.get(teamsL1[5].id)!;
  const transferPlayer = volgaSquad.find((p) => p.position === "MF")!;
  await db.registration.updateMany({
    where: { personId: transferPlayer.id, teamId: teamsL1[5].id },
    data: { endDate: MSK(dayStr(-13), 23) },
  });
  await db.registration.create({
    data: {
      personId: transferPlayer.id, teamId: teamsL1[4].id, seasonId: season1.id,
      startDate: MSK(dayStr(-12), 0), number: 99,
    },
  });

  // ---------- Сигналы ленты: бан бомбардира и смена тренера ----------
  console.log("🔥 Сигналы турнира...");
  // лучший бомбардир «горячей» команды дисквалифицирован решением КДК —
  // лента покажет у её матчей значок «без бомбардира»
  const hotGoals = await db.matchEvent.findMany({
    where: { teamId: hotTeam.id, type: { in: ["GOAL", "PENALTY"] }, match: { status: "COMPLETED" } },
    select: { personId: true },
  });
  // бомбардир должен играть за «Волгу» сейчас: ушедший в «Динамо» не подходит
  const goalCount = new Map<string, number>();
  for (const e of hotGoals) {
    if (e.personId === transferPlayer.id) continue;
    goalCount.set(e.personId, (goalCount.get(e.personId) ?? 0) + 1);
  }
  const hotScorerId = [...goalCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (hotScorerId) {
    await db.suspension.create({
      data: {
        personId: hotScorerId, seasonId: season1.id, source: "MANUAL",
        reason: "Решение КДК: грубая игра в последнем матче (2 матча)",
        matchesTotal: 2, matchesServed: 0, isActive: true,
      },
    });
  }
  // в «холодной» команде сменился тренер (5 дней назад) — значок «новый тренер»
  const coldCoachReg = await db.registration.findFirst({
    where: { teamId: coldTeam.id, seasonId: season1.id, role: "COACH" },
  });
  if (coldCoachReg) {
    await db.registration.update({
      where: { id: coldCoachReg.id },
      data: { endDate: MSK(dayStr(-6), 23), status: "ENDED" },
    });
  }
  const newCoach = await db.person.create({ data: makePersonData("MF") });
  await db.registration.create({
    data: {
      personId: newCoach.id, teamId: coldTeam.id, seasonId: season1.id,
      startDate: MSK(dayStr(-5), 10), role: "COACH",
    },
  });

  // ---------- История личных встреч: прошлогодний сезон ----------
  // пары сегодняшнего тура уже встречались в сезоне-2025 — вкладка «Личные встречи»
  console.log("📜 Сезон 2025 (история H2H)...");
  const season1prev = await db.season.create({
    data: { leagueId: league1.id, name: "Сезон 2025", startDate: MSK(dayStr(-400), 12), endDate: MSK(dayStr(-120), 12), isCurrent: false },
  });
  const stage1prev = await mkStage(season1prev.id);
  const todayPairs = r6.map((m) => [m.home, m.away] as [string, string]);
  const h2hScores: [number, number][] = [[2, 1], [0, 3], [1, 1], [2, 0], [1, 2], [3, 1], [0, 0], [2, 2]];
  let h2hIdx = 0;
  for (const [home, away] of todayPairs) {
    for (const swap of [false, true]) {
      const [h, a] = swap ? [away, home] : [home, away];
      const [hs, as] = h2hScores[h2hIdx % h2hScores.length];
      await db.match.create({
        data: {
          stageId: stage1prev.id, round: swap ? 2 : 1,
          homeTeamId: h, awayTeamId: a,
          stadiumId: stadiums[h2hIdx % stadiums.length].id,
          kickoff: MSK(dayStr(-400 + h2hIdx * 35), 15),
          status: "COMPLETED", homeScore: hs, awayScore: as,
          refereeId: referees[h2hIdx % referees.length].id,
        },
      });
      h2hIdx++;
    }
  }

  // ---------- Оценки судей (Milestone 5) ----------
  console.log("⭐ Оценки судей...");
  const completed1 = await db.match.findMany({
    where: { status: "COMPLETED", stage: { seasonId: season1.id } },
    take: 8,
  });
  for (const m of completed1) {
    if (rng() < 0.7 && m.refereeId) {
      await db.refereeRating.create({
        data: {
          matchId: m.id, refereeId: m.refereeId, authorUserId: clubUser.id,
          rating: ri(3, 5), comment: rng() < 0.4 ? "Судейство на хорошем уровне" : null,
        },
      });
    }
    if (rng() < 0.4 && m.refereeId) {
      await db.refereeRating.create({
        data: { matchId: m.id, refereeId: m.refereeId, authorUserId: leagueAdmin.id, rating: ri(3, 5) },
      });
    }
  }

  // ---------- Дубликат профиля (демо Merge Persons, Epic 4) ----------
  console.log("🧹 Дубликат для Merge...");
  const victimRef = squadsL1.get(teamsL1[0].id)![2];
  const victim = (await db.person.findUnique({ where: { id: victimRef.id } }))!;
  const dup = await db.person.create({
    data: { firstName: victim.firstName.slice(0, 1) + ".", lastName: victim.lastName, position: victim.position },
  });
  await db.registration.create({
    data: { personId: dup.id, teamId: teamsL1[0].id, seasonId: season1.id, startDate: seasonStart, number: 88 },
  });

  // ---------- Баннеры (Milestone 4, слоты под баннеры) ----------
  console.log("📢 Баннеры...");
  await db.banner.createMany({
    data: [
      {
        placement: "TOP", title: "СпортСити — экипировка для вашего клуба",
        text: "Футбольная форма, бутсы и вратарские перчатки со скидкой 15% по промокоду SCORESBOX",
        linkUrl: "https://sportcity.example", priority: 1,
      },
      {
        placement: "RIGHT_TOP", title: "Кубок Чувашии 2026",
        text: "Приём заявок команд открыт до 15 сентября",
        linkUrl: "https://ff21.example/kubok", priority: 1,
      },
      {
        placement: "RIGHT_BOTTOM", title: "Судейский семинар ФФЧ",
        text: "14 сентября, старт в 10:00 — аудитория помощи начинающим арбитрам",
        linkUrl: "https://ff21.example/seminar", priority: 2,
      },
    ],
  });

  const counts = {
    persons: await db.person.count(),
    teams: await db.team.count(),
    matches: await db.match.count(),
    events: await db.matchEvent.count(),
    suspensions: await db.suspension.count(),
    ratings: await db.refereeRating.count(),
    banners: await db.banner.count(),
  };
  console.log("✅ Seed завершён:", counts);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
