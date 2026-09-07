import { describe, expect, test } from "bun:test";
import { generateRoundRobin } from "@/lib/engine/schedule";

function pairKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

describe("Расписание · круговая система (Round-Robin)", () => {
  test("8 команд, один круг: 28 матчей, 7 туров, каждая пара ровно один раз", () => {
    const slots = generateRoundRobin(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(slots).toHaveLength(28); // 8×7/2
    const pairs = new Map<string, number>();
    for (const s of slots) {
      expect(s.homeTeamId).not.toBe(s.awayTeamId);
      const k = pairKey(s.homeTeamId, s.awayTeamId);
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
    expect(pairs.size).toBe(28);
    expect([...pairs.values()].every((n) => n === 1)).toBe(true);
    expect(new Set(slots.map((s) => s.round))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
  });

  test("каждая команда играет ровно один матч в туре", () => {
    const slots = generateRoundRobin(["A", "B", "C", "D", "E", "F"]);
    for (let r = 1; r <= 5; r++) {
      const round = slots.filter((s) => s.round === r);
      const teams = round.flatMap((s) => [s.homeTeamId, s.awayTeamId]);
      expect(teams).toHaveLength(6);
      expect(new Set(teams).size).toBe(6);
    }
  });

  test("двойной круг: 6 команд → 30 матчей, ответные с реверсом поля", () => {
    const slots = generateRoundRobin(["A", "B", "C", "D", "E", "F"], true);
    expect(slots).toHaveLength(30); // 2×(6×5/2)
    const pairCount = new Map<string, number>();
    const directed = new Map<string, number>();
    for (const s of slots) {
      const k = pairKey(s.homeTeamId, s.awayTeamId);
      pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
      directed.set(`${s.homeTeamId}>${s.awayTeamId}`, (directed.get(`${s.homeTeamId}>${s.awayTeamId}`) ?? 0) + 1);
    }
    // каждая пара — дважды
    expect([...pairCount.values()].every((n) => n === 2)).toBe(true);
    // и каждый конкретный порядок хозяева/гости — ровно один раз
    expect([...directed.values()].every((n) => n === 1)).toBe(true);
  });

  test("нечётное число (5 команд): пары без «пустышки», у каждой по одному пропуску", () => {
    const slots = generateRoundRobin(["A", "B", "C", "D", "E"]);
    expect(slots).toHaveLength(10); // 5×4/2
    const pairs = new Set(slots.map((s) => pairKey(s.homeTeamId, s.awayTeamId)));
    expect(pairs.size).toBe(10);
    expect(slots.some((s) => s.homeTeamId === "__BYE__" || s.awayTeamId === "__BYE__")).toBe(false);
    // в каждом из 5 туров играет 4 команды (одна отдыхает)
    for (let r = 1; r <= 5; r++) {
      const teams = slots.filter((s) => s.round === r).flatMap((s) => [s.homeTeamId, s.awayTeamId]);
      expect(teams).toHaveLength(4);
    }
  });

  test("баланс дома/в гостях: расхождение не больше 1", () => {
    const teams = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const slots = generateRoundRobin(teams);
    for (const t of teams) {
      const home = slots.filter((s) => s.homeTeamId === t).length;
      const away = slots.filter((s) => s.awayTeamId === t).length;
      expect(Math.abs(home - away)).toBeLessThanOrEqual(1);
    }
  });

  test("меньше 2 команд — пустое расписание", () => {
    expect(generateRoundRobin([])).toEqual([]);
    expect(generateRoundRobin(["A"])).toEqual([]);
  });
});
