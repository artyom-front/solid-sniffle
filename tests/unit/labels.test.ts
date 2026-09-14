import { describe, expect, test } from "bun:test";
import {
  FORMAT_LABELS,
  EVENT_LABELS,
  EVENT_SHORT_LABELS,
  STREAK_MIN,
  STREAK_LABELS,
  STATUS_LABELS,
  POSITION_LABELS,
  ROLE_LABELS,
  SOURCE_LABELS,
} from "@/lib/labels";

describe("Словари UI · инварианты нейминга", () => {
  test("«11×11» называется «Футбол» (решение UX-раунда v4)", () => {
    expect(FORMAT_LABELS.F11).toBe("Футбол");
    expect(FORMAT_LABELS.FUTSAL).toBe("Мини-футбол");
    expect(FORMAT_LABELS.F8).toBe("8×8");
    expect(FORMAT_LABELS.F6).toBe("6×6");
  });

  test("все 4 формата имеют подпись", () => {
    for (const f of ["F11", "F8", "F6", "FUTSAL"]) {
      expect(FORMAT_LABELS[f]).toBeTruthy();
    }
  });

  test("все статусы матча подписаны", () => {
    for (const s of ["SCHEDULED", "LIVE", "COMPLETED", "WALKOVER", "POSTPONED"]) {
      expect(STATUS_LABELS[s]).toBeTruthy();
    }
  });

  test("события протокола: полный набор + VAR + замены", () => {
    for (const e of [
      "GOAL", "PENALTY", "OWN_GOAL", "YELLOW_CARD", "RED_CARD",
      "SUB_OUT", "SUB_IN", "VAR_GOAL_CONFIRM", "VAR_GOAL_CANCEL", "VAR_PENALTY",
    ]) {
      expect(EVENT_LABELS[e]).toBeTruthy();
    }
    // короткие подписи — только там, где иконка не исчерпывающа
    expect(EVENT_SHORT_LABELS.PENALTY).toBeTruthy();
    expect(EVENT_SHORT_LABELS.GOAL).toBeUndefined();
    expect(EVENT_SHORT_LABELS.YELLOW_CARD).toBeUndefined();
  });

  test("порог стрика 5+ и словарь эмоций", () => {
    expect(STREAK_MIN).toBe(5);
    expect(STREAK_LABELS.W).toBeTruthy();
    expect(STREAK_LABELS.L).toBeTruthy();
  });

  test("позиции и роли", () => {
    expect(POSITION_LABELS.GK).toBe("Вратарь");
    for (const r of ["SUPER_ADMIN", "LEAGUE_ADMIN", "CLUB_ADMIN", "REFEREE", "PLAYER"]) {
      expect(ROLE_LABELS[r]).toBeTruthy();
    }
    for (const s of ["AUTO_RED", "AUTO_YELLOW", "MANUAL"]) {
      expect(SOURCE_LABELS[s]).toBeTruthy();
    }
  });
});
