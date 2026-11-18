// ============================================================
// SCORESBOX · protocol-shared — общие константы/типы вкладок
// редактора протокола (разборка ProtocolEditor, v1.0.30).
// Держим здесь только то, что нужно ДВУМ и более модулям,
// чтобы вкладки не тянули друг друга импортами.
// ============================================================

import type { ProtocolData } from "./ProtocolLineupTab";

export type { ProtocolData } from "./ProtocolLineupTab";

/** Типы событий формы «Добавить событие» (вкладка «События») */
export const EVENT_TYPES = [
  { value: "GOAL", label: "Гол" },
  { value: "PENALTY", label: "Гол с пенальти" },
  { value: "OWN_GOAL", label: "Автогол" },
  { value: "YELLOW_CARD", label: "Жёлтая карточка" },
  { value: "RED_CARD", label: "Красная карточка" },
  { value: "SUBSTITUTION", label: "Замена (вышел + ушёл)" },
  { value: "VAR_GOAL_CONFIRM", label: "VAR: гол подтверждён" },
  { value: "VAR_GOAL_CANCEL", label: "VAR: гол отменён" },
  { value: "VAR_PENALTY", label: "VAR: назначен пенальти" },
] as const;

/** Подписи причин технического поражения (WO) */
export const WO_LABEL: Record<string, string> = {
  HOME: "неявка хозяев",
  AWAY: "неявка гостей",
  BOTH: "обе неявки / срыв",
};

/** Безопасные подписи статусов матча (без 500 на неизвестных) */
export function STATUS_SAFE(s: string): string {
  const map: Record<string, string> = { SCHEDULED: "запланирован", LIVE: "идёт", COMPLETED: "завершён", WALKOVER: "тех. поражение", POSTPONED: "перенесён" };
  return map[s] ?? s;
}

/** Протокол закрыт: статусы, при которых события/составы не редактируются */
export function isProtocolLocked(status: string): boolean {
  return status === "COMPLETED" || status === "WALKOVER";
}

/** Строка черновика судейской бригады (синхронизируется PATCH'ем массивом) */
export interface OfficialsRow {
  role: string;
  personId: string;
}

/** Общие пропсы вкладок редактора протокола */
export interface ProtocolTabProps {
  matchId: string;
  data: ProtocolData;
  /** перезагрузить данные матча (version++ + bump наверх) */
  onReload: () => void;
}
