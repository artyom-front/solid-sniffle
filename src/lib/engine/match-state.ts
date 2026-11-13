// ============================================================
// v1.0.52 · СОСТОЯНИЕ МАТЧА: «на поле» / «на скамейке».
//
// Чистые функции (без БД) — один источник правды для:
//   • UI вкладки «События» (кого предлагать в селекторах);
//   • серверной валидации validateEvent (что пропускать в протокол).
//
// ПРАВИЛА (фидбек юзера 2026-10-08):
//   1. НА ПОЛЕ — стартовые + вышедшие заменой − ушедшие заменой.
//   2. Запасной НЕ участвует ни в каком событии, КРОМЕ замены
//      (запасной попадает на поле только через замену).
//   3. В замене: выходить может ТОЛЬКО запасной, ещё не выходивший;
//      уходить — ТОЛЬКО игрок на поле. Выйдя и уйдя, игрок больше
//      не может ни выйти, ни попасть в события (футбольное правило
//      повторного выхода).
//
// Легаси SUB_IN/SUB_OUT (старые протоколы, читаются, но не создаются)
// обрабатываются так же, как SUBSTITUTION.
// ============================================================

export interface StateLineupRow {
  personId: string;
  isStarter: boolean;
}

export interface StateEventRow {
  type: string;
  /** SUBSTITUTION/SUB_IN: вышедший; SUB_OUT: ушедший */
  personId: string;
  /** SUBSTITUTION/SUB_OUT: ушедший (null — обычное событие) */
  assistPersonId?: string | null;
}

export interface MatchState {
  /** на поле сейчас (старт + вышли − ушли) */
  onField: Set<string>;
  /** может выйти заменой: запас в протоколе, ещё не выходил */
  bench: Set<string>;
  /** участники хоть одной замены (вышел и/или ушёл) — повторный выход запрещён */
  usedInSub: Set<string>;
  /** стартовый состав подан (есть строки протокола) */
  hasLineup: boolean;
}

/** Вычислить состояние по составу и событиям (SCOPE — одна команда). */
export function computeMatchState(lineup: StateLineupRow[], events: StateEventRow[]): MatchState {
  const onField = new Set<string>();
  const starters = new Set<string>();
  const inLineup = new Set<string>();
  for (const l of lineup) {
    inLineup.add(l.personId);
    if (l.isStarter) {
      starters.add(l.personId);
      onField.add(l.personId);
    }
  }
  const usedInSub = new Set<string>();
  for (const e of events) {
    switch (e.type) {
      case "SUBSTITUTION":
        // personId — вышедший, assistPersonId — ушедший
        usedInSub.add(e.personId);
        onField.add(e.personId);
        if (e.assistPersonId) {
          usedInSub.add(e.assistPersonId);
          onField.delete(e.assistPersonId);
        }
        break;
      case "SUB_IN":
        usedInSub.add(e.personId);
        onField.add(e.personId);
        break;
      case "SUB_OUT":
        usedInSub.add(e.personId);
        onField.delete(e.personId);
        break;
      default:
        break;
    }
  }
  // скамейка: запас в протоколе, который ещё не выходил и не на поле
  const bench = new Set<string>();
  for (const pid of inLineup) {
    if (!starters.has(pid) && !onField.has(pid) && !usedInSub.has(pid)) bench.add(pid);
  }
  return { onField, bench, usedInSub, hasLineup: inLineup.size > 0 };
}

/** Может ли игрок УЧАСТВОВАТЬ в событии (не замена): должен быть на поле.
 *  Состав не подан — true (легаси-fallback: решает проверка заявки). */
export function canParticipateInEvent(state: MatchState, personId: string): boolean {
  if (!state.hasLineup) return true;
  return state.onField.has(personId);
}

/** Может ли игрок ВЫЙТИ заменой: должен быть запасным, ещё не выходившим.
 *  Состав не подан — true (легаси-fallback). */
export function canEnterAsSub(state: MatchState, personId: string): boolean {
  if (!state.hasLineup) return true;
  return state.bench.has(personId);
}

/** Может ли игрок УЙТИ с поля (завершить замену): должен быть на поле.
 *  Состав не подан — true (легаси-fallback). */
export function canLeaveField(state: MatchState, personId: string): boolean {
  if (!state.hasLineup) return true;
  return state.onField.has(personId);
}
