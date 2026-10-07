import { describe, expect, test } from "bun:test";
import { computeStreak, isHotStreak, isColdStreak, plural } from "@/lib/engine/signals";
import { STREAK_MIN } from "@/lib/labels";

/** Минимальный матч для computeStreak */
function match(round: number, home: string, away: string, hs: number, as: number) {
  return {
    id: `m${round}`,
    round,
    homeTeamId: home,
    awayTeamId: away,
    status: "COMPLETED",
    walkoverType: null,
    homeScore: hs,
    awayScore: as,
  };
}

function wo(round: number, home: string, away: string, type: string) {
  return {
    id: `w${round}`,
    round,
    homeTeamId: home,
    awayTeamId: away,
    status: "WALKOVER",
    walkoverType: type,
    homeScore: null,
    awayScore: null,
  };
}

describe("Стрики · computeStreak", () => {
  test("5 побед подряд → {W, 5}", () => {
    const matches = Array.from({ length: 5 }, (_, i) => match(i + 1, "A", "B", 2, 0));
    expect(computeStreak(matches, "A")).toEqual({ code: "W", count: 5 });
  });

  test("серия прерывается первым отличным результатом", () => {
    const matches = [
      match(1, "A", "B", 1, 0), // W
      match(2, "B", "A", 1, 0), // L для A
      match(3, "A", "B", 1, 0), // W
      match(4, "B", "A", 0, 3), // W для A (гость)
      match(5, "A", "B", 1, 1), // D — серия обрывается
      match(6, "A", "B", 2, 0), // W
    ];
    // A: W L W W D W → последняя серия {W, 1}
    expect(computeStreak(matches, "A")).toEqual({ code: "W", count: 1 });
    // B: L W L L D L → серия из одного поражения (предпоследняя — ничья)
    expect(computeStreak(matches, "B")).toEqual({ code: "L", count: 1 });
  });

  test("монотонная серия: 6 поражений подряд → {L,6}", () => {
    const matches = Array.from({ length: 6 }, (_, i) => match(i + 1, "A", "B", 1, 0));
    expect(computeStreak(matches, "B")).toEqual({ code: "L", count: 6 });
    expect(computeStreak(matches, "A")).toEqual({ code: "W", count: 6 });
  });

  test("ничейная серия: {D, 3}", () => {
    const matches = [match(1, "A", "B", 0, 0), match(2, "A", "B", 1, 1), match(3, "A", "B", 2, 2)];
    expect(computeStreak(matches, "A")).toEqual({ code: "D", count: 3 });
  });

  test("техпоражения в счёт серии: WO обоих — T", () => {
    const matches = [wo(1, "A", "B", "BOTH"), wo(2, "A", "B", "BOTH")];
    expect(computeStreak(matches, "A")).toEqual({ code: "T", count: 2 });
    expect(computeStreak(matches, "B")).toEqual({ code: "T", count: 2 });
  });

  test("техпобеда — 'w' и это победная серия", () => {
    // AWAY = неявка гостей (B) → A техпобеда
    const matches = [wo(1, "A", "B", "AWAY"), wo(2, "B", "A", "HOME")];
    expect(computeStreak(matches, "A")).toEqual({ code: "w", count: 2 });
    expect(computeStreak(matches, "B")).toEqual({ code: "T", count: 2 });
  });

  test("нет сыгранных матчей → null; незыгранные не считаются", () => {
    expect(computeStreak([], "A")).toBeNull();
    const scheduled = [
      { id: "s", round: 1, homeTeamId: "A", awayTeamId: "B", status: "SCHEDULED", walkoverType: null, homeScore: null, awayScore: null },
    ];
    expect(computeStreak(scheduled as never, "A")).toBeNull();
  });

  test("серия учитывает и домашние, и выездные матчи", () => {
    const matches = [
      match(1, "A", "B", 1, 0),
      match(2, "C", "A", 0, 1), // A выигрывает в гостях
      match(3, "A", "D", 1, 0),
    ];
    expect(computeStreak(matches, "A")).toEqual({ code: "W", count: 3 });
  });
});

describe("Стрики · порог «эмоции» (STREAK_MIN = 5)", () => {
  test("STREAK_MIN равен 5 (требование UX: огонь/снежинка от 5+)", () => {
    expect(STREAK_MIN).toBe(5);
  });

  test("isHotStreak: 4 победы — нет, 5+ — да; техпобеды считаются победами", () => {
    expect(isHotStreak({ code: "W", count: 4 })).toBe(false);
    expect(isHotStreak({ code: "W", count: 5 })).toBe(true);
    expect(isHotStreak({ code: "W", count: 9 })).toBe(true);
    expect(isHotStreak({ code: "w", count: 5 })).toBe(true); // техпобеда = победа
    expect(isHotStreak({ code: "D", count: 7 })).toBe(false);
    expect(isHotStreak(null)).toBe(false);
  });

  test("isColdStreak: поражения и техпоражения от 5+ (кризис команды)", () => {
    expect(isColdStreak({ code: "L", count: 4 })).toBe(false);
    expect(isColdStreak({ code: "L", count: 5 })).toBe(true);
    expect(isColdStreak({ code: "L", count: 12 })).toBe(true);
    expect(isColdStreak({ code: "T", count: 6 })).toBe(true); // техпоражение = сигнал кризиса
    expect(isColdStreak({ code: "D", count: 6 })).toBe(false);
    expect(isColdStreak(null)).toBe(false);
  });
});

describe("Плюрализация (русская морфология)", () => {
  test("1/2/5/11/21/111 форм", () => {
    expect(plural(1, "матч", "матча", "матчей")).toBe("матч");
    expect(plural(2, "матч", "матча", "матчей")).toBe("матча");
    expect(plural(5, "матч", "матча", "матчей")).toBe("матчей");
    expect(plural(11, "тур", "тура", "туров")).toBe("туров");
    expect(plural(21, "тур", "тура", "туров")).toBe("тур");
    expect(plural(111, "гол", "гола", "голов")).toBe("голов");
    expect(plural(0, "матч", "матча", "матчей")).toBe("матчей");
  });
});
