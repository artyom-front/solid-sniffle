// Юнит-тесты v1.0.52 · lib/engine/match-state — «на поле» / «на скамейке».
// Правила фидбека юзера 2026-10-08:
//   • замена: вход — ТОЛЬКО запасной (не выходивший), выход — ТОЛЬКО с поля;
//   • прочие события — ТОЛЬКО игроки на поле (запасной не участвует,
//     пока не вышел заменой);
//   • повторный выход после ухода — запрещён.

import { describe, expect, it } from "bun:test";
import { computeMatchState, canParticipateInEvent, canEnterAsSub, canLeaveField, type StateLineupRow, type StateEventRow } from "@/lib/engine/match-state";

const lineup = (spec: [string, boolean][]): StateLineupRow[] =>
  spec.map(([personId, isStarter]) => ({ personId, isStarter }));

const events = (spec: [string, string, string?][]): StateEventRow[] =>
  spec.map(([type, personId, assistPersonId]) => ({ type, personId, assistPersonId }));

describe("computeMatchState", () => {
  it("старт — на поле; запас — на скамейке", () => {
    const st = computeMatchState(
      lineup([["s1", true], ["s2", true], ["b1", false], ["b2", false]]),
      []
    );
    expect([...st.onField].sort()).toEqual(["s1", "s2"]);
    expect([...st.bench].sort()).toEqual(["b1", "b2"]);
    expect(st.hasLineup).toBe(true);
  });

  it("SUBSTITUTION: вышедший — на поле, ушедший — со поля, оба — usedInSub", () => {
    const st = computeMatchState(
      lineup([["s1", true], ["b1", false]]),
      events([["SUBSTITUTION", "b1", "s1"]])
    );
    expect(st.onField.has("b1")).toBe(true);
    expect(st.onField.has("s1")).toBe(false);
    expect(st.usedInSub.has("b1")).toBe(true);
    expect(st.usedInSub.has("s1")).toBe(true);
    // s1 ушёл, b1 на поле — скамейка пуста
    expect(st.bench.size).toBe(0);
  });

  it("легаси SUB_IN/SUB_OUT обрабатываются как замена", () => {
    const st = computeMatchState(
      lineup([["s1", true], ["b1", false]]),
      events([["SUB_OUT", "s1"], ["SUB_IN", "b1"]])
    );
    expect(st.onField.has("b1")).toBe(true);
    expect(st.onField.has("s1")).toBe(false);
    expect(st.usedInSub.has("s1")).toBe(true);
  });

  it("вышедший и ушедший заменой не может выйти повторно (правило футбола)", () => {
    const st = computeMatchState(
      lineup([["s1", true], ["b1", false], ["b2", false]]),
      events([["SUBSTITUTION", "b1", "s1"], ["SUBSTITUTION", "b2", "b1"]])
    );
    // b2 на поле; s1 и b1 уже отыграли
    expect(st.onField.has("b2")).toBe(true);
    expect(st.bench.size).toBe(0);
    expect(canEnterAsSub(st, "s1")).toBe(false);
    expect(canEnterAsSub(st, "b1")).toBe(false);
  });

  it("без состава (lineup пуст) — легаси-fallback: всё разрешено", () => {
    const st = computeMatchState([], events([["GOAL", "x1"]]));
    expect(st.hasLineup).toBe(false);
    expect(canParticipateInEvent(st, "x1")).toBe(true);
    expect(canEnterAsSub(st, "any")).toBe(true);
    expect(canLeaveField(st, "any")).toBe(true);
  });
});

describe("правила событий (canParticipate/canEnter/canLeave)", () => {
  it("запасной НЕ участвует в событиях (гол/карточка) до выхода на замену", () => {
    const st = computeMatchState(lineup([["s1", true], ["b1", false]]), []);
    expect(canParticipateInEvent(st, "s1")).toBe(true);
    expect(canParticipateInEvent(st, "b1")).toBe(false);
  });

  it("после выхода заменой запасной УЧАСТВУЕТ в событиях", () => {
    const st = computeMatchState(
      lineup([["s1", true], ["b1", false]]),
      events([["SUBSTITUTION", "b1", "s1"]])
    );
    expect(canParticipateInEvent(st, "b1")).toBe(true);
    expect(canParticipateInEvent(st, "s1")).toBe(false); // ушёл с поля
  });

  it("в замене: войти может только со скамейки, уйти — только с поля", () => {
    const st = computeMatchState(lineup([["s1", true], ["b1", false]]), []);
    expect(canEnterAsSub(st, "b1")).toBe(true);
    expect(canEnterAsSub(st, "s1")).toBe(false); // стартовый — уже на поле
    expect(canLeaveField(st, "s1")).toBe(true);
    expect(canLeaveField(st, "b1")).toBe(false); // запасной не уходит
  });

  it("красная карточка игрока на поле: остаётся «на поле» (замены его больше не касаются)", () => {
    // карточка не меняет состояние — так же, как в UI/валидаторе:
    // удалённого в реале уводят, но протокол ведёт замены явно
    const st = computeMatchState(
      lineup([["s1", true], ["b1", false]]),
      events([["RED_CARD", "s1"]])
    );
    expect(st.onField.has("s1")).toBe(true);
    expect(canParticipateInEvent(st, "s1")).toBe(true);
  });
});
