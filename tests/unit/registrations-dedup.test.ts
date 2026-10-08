// v1.0.46 · дедуп заявок в списке протокола: одна персона = одна строка.
// pickBestRegistrationPerPerson — чистая функция (без БД), покрывает:
//   - перекрытие окон при трансфере (ввод протокола задним числом);
//   - аудит №9 — две ACTIVE заявки одного игрока в одной команде;
//   - приоритет: заявка, ПОКРЫВАЮЩАЯ дату матча; из покрывающих — свежее.
import { describe, expect, test } from "bun:test";
import { pickBestRegistrationPerPerson } from "@/lib/engine/lifecycle";

const d = (iso: string) => new Date(iso);

describe("Дедуп заявок в протоколе (v1.0.46)", () => {
  const kickoff = d("2026-10-01T18:00:00Z");

  test("одна заявка на персону — проходит как есть", () => {
    const regs = [
      { personId: "p1", startDate: d("2026-06-01") },
      { personId: "p2", startDate: d("2026-07-15") },
    ];
    const out = pickBestRegistrationPerPerson(regs, kickoff);
    expect(out.length).toBe(2);
    expect(out.map((r) => r.personId).sort()).toEqual(["p1", "p2"]);
  });

  test("трансфер задним числом: старая покрывает матч, новая поздняя — выбирается старая (без дубля)", () => {
    const regs = [
      { personId: "p1", startDate: d("2026-06-01") }, // покрывает
      { personId: "p1", startDate: d("2026-10-06") }, // поздняя, позднее матча
    ];
    const out = pickBestRegistrationPerPerson(regs, kickoff);
    expect(out.length).toBe(1);
    expect(out[0].startDate.getTime()).toBe(d("2026-06-01").getTime());
  });

  test("две покрывающие (аудит №9, ACTIVE+ACTIVE) — берётся свежая", () => {
    const regs = [
      { personId: "p1", startDate: d("2026-05-01") },
      { personId: "p1", startDate: d("2026-09-01") },
    ];
    const out = pickBestRegistrationPerPerson(regs, kickoff);
    expect(out.length).toBe(1);
    expect(out[0].startDate.getTime()).toBe(d("2026-09-01").getTime());
  });

  test("обе поздние (заявлен после матча) — берётся свежая (для пометки «заявлен после»)", () => {
    const regs = [
      { personId: "p1", startDate: d("2026-10-03") },
      { personId: "p1", startDate: d("2026-10-05") },
    ];
    const out = pickBestRegistrationPerPerson(regs, kickoff);
    expect(out.length).toBe(1);
    expect(out[0].startDate.getTime()).toBe(d("2026-10-05").getTime());
  });

  test("порядок строк не влияет на выбор (стабильность)", () => {
    const a = [
      { personId: "p1", startDate: d("2026-06-01") },
      { personId: "p1", startDate: d("2026-10-06") },
    ];
    const b = [...a].reverse();
    const outA = pickBestRegistrationPerPerson(a, kickoff);
    const outB = pickBestRegistrationPerPerson(b, kickoff);
    expect(outA.length).toBe(1);
    expect(outB.length).toBe(1);
    expect(outA[0].startDate.getTime()).toBe(outB[0].startDate.getTime());
    expect(outA[0].startDate.getTime()).toBe(d("2026-06-01").getTime());
  });

  test("разные персоны не смешиваются: дедуп строго по personId", () => {
    const regs = [
      { personId: "p1", startDate: d("2026-06-01") },
      { personId: "p1", startDate: d("2026-10-06") },
      { personId: "p2", startDate: d("2026-10-06") },
      { personId: "p3", startDate: d("2026-09-30T23:59:59Z") }, // ровно к матчу — покрывает
    ];
    const out = pickBestRegistrationPerPerson(regs, kickoff);
    expect(out.length).toBe(3);
    const byId = new Map(out.map((r) => [r.personId, r.startDate.getTime()]));
    expect(byId.get("p1")).toBe(d("2026-06-01").getTime());
    expect(byId.get("p2")).toBe(d("2026-10-06").getTime());
    expect(byId.get("p3")).toBe(d("2026-09-30T23:59:59Z").getTime());
  });

  test("kickoff ровно в момент startDate — считается покрывающей (граница «<=»)", () => {
    const regs = [
      { personId: "p1", startDate: kickoff },
      { personId: "p1", startDate: d("2026-10-06") },
    ];
    const out = pickBestRegistrationPerPerson(regs, kickoff);
    expect(out.length).toBe(1);
    expect(out[0].startDate.getTime()).toBe(kickoff.getTime());
  });

  test("пустой список — пустой результат", () => {
    expect(pickBestRegistrationPerPerson([], kickoff)).toEqual([]);
  });
});
