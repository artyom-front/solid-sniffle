import { describe, expect, test } from "bun:test";
// Логика хронологии вынесена в чистую функцию buildRows — тестируем
// порядок событий и полосы периодов «1-й тайм / Перерыв / 2-й тайм /
// Завершён» (директива Р-20) без рендера.
import { buildRows } from "@/components/portal/MatchTimeline";

interface Ev {
  id: string;
  minute: number;
  stoppage?: number | null;
  type: string;
  person: string;
  assist?: string | null;
  teamId: string;
}

const HOME = "home";
const AWAY = "away";

function ev(id: string, minute: number, type: string, person: string, teamId = HOME, stoppage: number | null = null): Ev {
  return { id, minute, stoppage, type, person, assist: null, teamId };
}

/** Приводим строки к компактному описанию: 'GOAL 23' | 'M Перерыв 1:0' | ... */
function shape(rows: ReturnType<typeof buildRows>): string[] {
  return rows.map((r) => {
    if (r.kind === "marker") return `M ${r.label} ${r.score}`;
    if (r.kind === "sub") return `SUB ${r.e.minute}${r.e.stoppage ? `+${r.e.stoppage}` : ""}`;
    return `${r.e.type} ${r.e.minute}${r.e.stoppage ? `+${r.e.stoppage}` : ""}${r.score ? ` ${r.score}` : ""}`;
  });
}

const cast = (list: Ev[]) => list.map((e) => ({ ...e, person: { id: e.person, name: e.person }, assist: e.assist ? { id: e.assist, name: e.assist } : null })) as any;

describe("Хронология · порядок таймов и полосы периодов (Р-20)", () => {
  test("событие 45+3 стоит ДО «Перерыва»: перерыв — после конца первого тайма", () => {
    const rows = buildRows(cast([
      ev("a", 23, "GOAL", "Ильин", HOME),
      ev("b", 33, "GOAL", "Бельцов", AWAY),
      ev("c", 45, "GOAL", "Кирин", HOME, 3), // 45+3 — добавленное время 1-го тайма
      ev("d", 61, "GOAL", "Егоров", AWAY),
    ]), HOME, "COMPLETED", 2, 2);
    const s = shape(rows);
    // полоса «1-й тайм» — первая строка оси
    expect(s[0]).toBe("M 1-й тайм null");
    // 45+3 — до полос, второй тайм — после «2-й тайм»
    expect(s.indexOf("GOAL 45+3 2:1")).toBeLessThan(s.indexOf("M Перерыв 2:1"));
    expect(s.indexOf("M Перерыв 2:1")).toBeLessThan(s.indexOf("M 2-й тайм null"));
    expect(s.indexOf("M 2-й тайм null")).toBeLessThan(s.indexOf("GOAL 61 2:2"));
    expect(s[s.length - 1]).toBe("M Завершён 2:2");
  });

  test("45+3 идёт раньше 46-й минуты (добавленное время — всё ещё первый тайм)", () => {
    const rows = buildRows(cast([
      ev("a", 46, "YELLOW_CARD", "Позже"),
      ev("b", 45, "GOAL", "Раньше", HOME, 3),
    ]), HOME, "LIVE");
    const s = shape(rows);
    expect(s.indexOf("GOAL 45+3")).toBeLessThan(s.indexOf("YELLOW_CARD 46"));
    // полосы «Перерыв» + «2-й тайм» — между ними
    expect(s.indexOf("M Перерыв 1:0")).toBeGreaterThan(s.indexOf("GOAL 45+3"));
    expect(s.indexOf("M 2-й тайм null")).toBeLessThan(s.indexOf("YELLOW_CARD 46"));
  });

  test("завершённый матч без событий второго тайма всё равно показывает полосы периодов", () => {
    const rows = buildRows(cast([
      ev("a", 11, "GOAL", "Данилов"),
      ev("b", 44, "GOAL", "Кузьмин"),
    ]), HOME, "COMPLETED", 3, 0);
    const s = shape(rows);
    expect(s).toEqual([
      "M 1-й тайм null",
      "GOAL 11 1:0",
      "GOAL 44 2:0", // бегущий счёт в строке события
      "M Перерыв 2:0",
      "M 2-й тайм null",
      "M Завершён 3:0",
    ]);
  });

  test("завершённый матч без событий: полный скелет периодов (протокол пуст)", () => {
    const rows = buildRows(cast([]), HOME, "COMPLETED", 0, 0);
    expect(shape(rows)).toEqual([
      "M 1-й тайм null",
      "M Перерыв 0:0",
      "M 2-й тайм null",
      "M Завершён 0:0",
    ]);
  });

  test("незавершённый матч без событий второго тайма — без «Перерыва» (LIVE)", () => {
    const rows = buildRows(cast([ev("a", 20, "GOAL", "Гол")]), HOME, "LIVE");
    const s = shape(rows);
    expect(s.some((x) => x.startsWith("M Перерыв"))).toBe(false);
    expect(s.some((x) => x.startsWith("M 2-й тайм"))).toBe(false);
    expect(s.some((x) => x.startsWith("M Завершён"))).toBe(false);
    // но полоса «1-й тайм» — есть
    expect(s[0]).toBe("M 1-й тайм null");
  });

  test("запланированный матч без событий — маркеров нет", () => {
    const rows = buildRows(cast([]), HOME, "SCHEDULED");
    expect(shape(rows)).toEqual([]);
  });
});
