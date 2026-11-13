import { describe, expect, test } from "bun:test";
import { computeStandings, walkoverScore, resolveScore } from "@/lib/engine/standings";
import type { StandingsMatch, StandingsTeam } from "@/lib/engine/standings";

const TEAMS: StandingsTeam[] = [
  { id: "A", name: "Альфа" },
  { id: "B", name: "Бета" },
  { id: "C", name: "Гамма" },
];

function m(partial: Partial<StandingsMatch> & { homeTeamId: string; awayTeamId: string }): StandingsMatch {
  return {
    id: Math.random().toString(36).slice(2),
    round: 1,
    status: "COMPLETED",
    walkoverType: null,
    homeScore: null,
    awayScore: null,
    ...partial,
  };
}

describe("Таблица · очки и базовая арифметика", () => {
  test("3-1-0: победа/ничья/поражение, мячи и разница", () => {
    const rows = computeStandings(TEAMS, [
      m({ round: 1, homeTeamId: "A", awayTeamId: "B", homeScore: 3, awayScore: 1 }),
      m({ round: 1, homeTeamId: "C", awayTeamId: "A", homeScore: 0, awayScore: 2 }),
    ]);
    const a = rows.find((r) => r.teamId === "A")!;
    expect(a.games).toBe(2);
    expect(a.wins).toBe(2);
    expect(a.points).toBe(6);
    expect(a.goalsFor).toBe(5);
    expect(a.goalsAgainst).toBe(1);
    expect(a.goalDiff).toBe(4);
    expect(a.form).toEqual(["W", "W"]);

    const b = rows.find((r) => r.teamId === "B")!;
    expect(b.points).toBe(0);
    expect(b.losses).toBe(1);

    const c = rows.find((r) => r.teamId === "C")!;
    expect(c.losses).toBe(1);
    expect(c.goalsFor).toBe(0);
  });

  test("ничья — по 1 очку обеим, форма D", () => {
    const rows = computeStandings(TEAMS, [m({ homeTeamId: "A", awayTeamId: "B", homeScore: 1, awayScore: 1 })]);
    expect(rows.find((r) => r.teamId === "A")!.points).toBe(1);
    expect(rows.find((r) => r.teamId === "B")!.points).toBe(1);
    expect(rows.find((r) => r.teamId === "A")!.form).toEqual(["D"]);
  });

  test("SCHEDULED/POSTPONED/LIVE не учитываются", () => {
    const rows = computeStandings(TEAMS, [
      m({ homeTeamId: "A", awayTeamId: "B", status: "SCHEDULED" }),
      m({ homeTeamId: "B", awayTeamId: "C", status: "POSTPONED" }),
      m({ homeTeamId: "C", awayTeamId: "A", status: "LIVE", homeScore: 1, awayScore: 0 }),
    ]);
    for (const r of rows) {
      expect(r.games).toBe(0);
      expect(r.points).toBe(0);
      expect(r.form).toEqual([]);
    }
  });

  test("позиции сортируются по очкам, гандикапы — по разнице мячей", () => {
    const rows = computeStandings(TEAMS, [
      m({ round: 1, homeTeamId: "A", awayTeamId: "B", homeScore: 5, awayScore: 0 }),
      m({ round: 1, homeTeamId: "C", awayTeamId: "A", homeScore: 0, awayScore: 0 }),
    ]);
    // A: 4 очка (+5), B: 0, C: 1 → A первый
    expect(rows[0].teamId).toBe("A");
    expect(rows.map((r) => r.teamId)).toContain("C");
    expect(rows[0].position).toBe(1);
    expect(rows[rows.length - 1].position).toBe(3);
  });
});

describe("Таблица · Epic 2: техпоражения (COALESCE)", () => {
  test("WO_HOME: 0:3 регламентом, хозяевам техпоражение, гостям техпобеда", () => {
    const rows = computeStandings(TEAMS, [
      m({ homeTeamId: "A", awayTeamId: "B", status: "WALKOVER", walkoverType: "HOME" }),
    ]);
    const a = rows.find((r) => r.teamId === "A")!;
    const b = rows.find((r) => r.teamId === "B")!;
    expect(a.points).toBe(0);
    expect(a.techLosses).toBe(1);
    expect(a.techWins).toBe(0);
    expect(a.goalsFor).toBe(0);
    expect(a.goalsAgainst).toBe(3); // регламентный счёт в статистику команды
    expect(b.points).toBe(3);
    expect(b.techWins).toBe(1);
    expect(b.goalsFor).toBe(3);
    expect(a.form).toEqual(["T"]);
    expect(b.form).toEqual(["w"]);
  });

  test("WO_AWAY: хозяевам техпобеда 3:0", () => {
    const rows = computeStandings(TEAMS, [
      m({ homeTeamId: "A", awayTeamId: "B", status: "WALKOVER", walkoverType: "AWAY" }),
    ]);
    expect(rows.find((r) => r.teamId === "A")!.points).toBe(3);
    expect(rows.find((r) => r.teamId === "A")!.techWins).toBe(1);
    expect(rows.find((r) => r.teamId === "B")!.techLosses).toBe(1);
  });

  test("WO_BOTH: 0:0, обеим 0 очков и техпоражение каждой", () => {
    const rows = computeStandings(TEAMS, [
      m({ homeTeamId: "A", awayTeamId: "B", status: "WALKOVER", walkoverType: "BOTH" }),
    ]);
    const a = rows.find((r) => r.teamId === "A")!;
    const b = rows.find((r) => r.teamId === "B")!;
    expect(a.points).toBe(0);
    expect(b.points).toBe(0);
    expect(a.techLosses).toBe(1);
    expect(b.techLosses).toBe(1);
    expect(a.goalsFor).toBe(0);
    expect(b.goalsFor).toBe(0);
    expect(a.form).toEqual(["T"]);
  });

  test("регламентный счёт мини-футбола (5) подставляется корректно", () => {
    const rows = computeStandings(TEAMS, [
      m({ homeTeamId: "A", awayTeamId: "B", status: "WALKOVER", walkoverType: "HOME" }),
    ], [], undefined, 5);
    expect(rows.find((r) => r.teamId === "B")!.goalsFor).toBe(5);
    expect(rows.find((r) => r.teamId === "A")!.goalsAgainst).toBe(5);
  });

  test("walkoverScore: маппинг типов неявки", () => {
    expect(walkoverScore("HOME", 3)).toEqual({ home: 0, away: 3, homePoints: 0, awayPoints: 3 });
    expect(walkoverScore("AWAY", 3)).toEqual({ home: 3, away: 0, homePoints: 3, awayPoints: 0 });
    expect(walkoverScore("BOTH", 3)).toEqual({ home: 0, away: 0, homePoints: 0, awayPoints: 0 });
    expect(walkoverScore("???", 3)).toEqual({ home: 0, away: 0, homePoints: 0, awayPoints: 0 });
  });

  test("resolveScore: отображаемый счёт (COALESCE на чтении)", () => {
    expect(resolveScore(m({ homeTeamId: "A", awayTeamId: "B", homeScore: 2, awayScore: 1 }))).toEqual({ home: 2, away: 1 });
    expect(resolveScore(m({ homeTeamId: "A", awayTeamId: "B", status: "WALKOVER", walkoverType: "AWAY" }))).toEqual({ home: 3, away: 0 });
    expect(resolveScore(m({ homeTeamId: "A", awayTeamId: "B", status: "SCHEDULED" }))).toEqual({ home: 0, away: 0 });
  });
});

describe("Таблица · fair play и тай-брейкеры", () => {
  test("карточки дают fair play-баллы: ЖК=1, КК=3", () => {
    const rows = computeStandings(
      TEAMS,
      [m({ homeTeamId: "A", awayTeamId: "B", homeScore: 1, awayScore: 1 })],
      [
        { teamId: "A", type: "YELLOW_CARD" },
        { teamId: "A", type: "YELLOW_CARD" },
        { teamId: "A", type: "RED_CARD" },
        { teamId: "B", type: "YELLOW_CARD" },
      ]
    );
    const a = rows.find((r) => r.teamId === "A")!;
    expect(a.fairPlay).toBe(5); // 2×1 + 3
    expect(a.yellowCards).toBe(2);
    expect(a.redCards).toBe(1);
    expect(rows.find((r) => r.teamId === "B")!.fairPlay).toBe(1);
  });

  test("при равных очках fair play выше в таблице (меньше баллов — выше место)", () => {
    // A и B: по 1 очку (ничья между собой), у A больше ЖК
    const rows = computeStandings(
      TEAMS,
      [m({ homeTeamId: "A", awayTeamId: "B", homeScore: 1, awayScore: 1 })],
      [
        { teamId: "A", type: "YELLOW_CARD" },
        { teamId: "A", type: "YELLOW_CARD" },
      ],
      "points,fair_play,goal_diff,goals_for,wins,head_to_head,name"
    );
    expect(rows.find((r) => r.teamId === "B")!.position).toBe(1);
    expect(rows.find((r) => r.teamId === "A")!.position).toBe(2);
  });
});

describe("Таблица · форма", () => {
  test("форма — последние 5 результатов в хронологии туров", () => {
    const matches: StandingsMatch[] = [];
    for (let r = 1; r <= 7; r++) {
      matches.push(m({ round: r, homeTeamId: "A", awayTeamId: "B", homeScore: r % 2, awayScore: 0 }));
    }
    const rows = computeStandings(TEAMS, matches);
    const a = rows.find((r) => r.teamId === "A")!;
    expect(a.form).toHaveLength(5); // обрезана до 5
    expect(a.games).toBe(7);
  });
});
