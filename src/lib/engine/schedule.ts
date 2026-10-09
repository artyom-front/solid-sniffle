// Milestone 2: генерация расписания — круговая система (Round-Robin, метод «карусели»)
// Поддерживает одиночный и двойной круг (ответные матчи с реверсом хозяев)

export interface ScheduleSlot {
  round: number;
  homeTeamId: string;
  awayTeamId: string;
}

/**
 * Классический алгоритм Бергера: одна команда фиксирована,
 * остальные вращаются по кругу. Для двойного круга второй проход
 * генерируется с реверсом поля.
 * Баланс «дом/в гостях»: хозяином пары становится команда с меньшим
 * числом домашних матчей (жадное выравнивание) — итоговое
 * расхождение для каждой команды не больше 1.
 */
export function generateRoundRobin(teamIds: string[], double = false): ScheduleSlot[] {
  const teams = [...teamIds];
  if (teams.length < 2) return [];

  // Нечётное число команд → добавляем «пустышку» (Bye)
  const odd = teams.length % 2 === 1;
  if (odd) teams.push("__BYE__");

  const n = teams.length;
  const half = n / 2;
  const roundsCount = n - 1;
  const slots: ScheduleSlot[] = [];
  const homeCount = new Map<string, number>();

  const fixed = teams[n - 1];
  const rotating = teams.slice(0, n - 1);

  for (let r = 0; r < roundsCount; r++) {
    const right = [...rotating.slice(0, half - 1).reverse()];
    const left = [...rotating.slice(half - 1)];

    const pairs: Array<[string, string]> = [[fixed, left[0]]];
    for (let i = 0; i < right.length; i++) {
      pairs.push([right[i], left[i + 1]]);
    }

    for (const [a, b] of pairs) {
      if (a === "__BYE__" || b === "__BYE__") continue;
      // жадный баланс: хозяин — та команда, что играла дома реже;
      // при равенстве — чередование по чётности тура (визуальное разнообразие)
      const ha = homeCount.get(a) ?? 0;
      const hb = homeCount.get(b) ?? 0;
      const home = ha > hb ? b : ha < hb ? a : r % 2 === 0 ? a : b;
      const away = home === a ? b : a;
      homeCount.set(home, (homeCount.get(home) ?? 0) + 1);
      slots.push({ round: r + 1, homeTeamId: home, awayTeamId: away });
    }

    rotating.unshift(rotating.pop()!);
  }

  if (double) {
    const firstLeg = slots.length;
    for (const s of slots.slice(0, firstLeg)) {
      slots.push({ round: s.round + roundsCount, homeTeamId: s.awayTeamId, awayTeamId: s.homeTeamId });
    }
  }

  return slots;
}
