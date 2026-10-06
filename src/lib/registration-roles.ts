// ============================================================
// Роли заявки (Registration.role) — единый источник для API и UI.
//
// v1.0.44 (аудит №10): раньше PATCH/POST заявок принимали ЛЮБУЮ
// непустую строку как роль (можно было записать BANNA/TEST123), а
// PATCH к тому же позволял превратить COACH в PLAYER МИМО
// assertPlayerRegistrationAllowed (обход инварианта «судья не
// игрок»). Теперь роль валидируется списком, а смена на PLAYER
// проходит ту же проверку, что и при создании.
//
// Расширение списка — ТОЛЬКО здесь (и миграцией не является:
// Registration.role — String, но под контролем этого модуля).
// PLAYER выделен: на него действует запрет судейской бригады
// сезона (см. engine/conflicts.ts).
// ============================================================

export const REGISTRATION_ROLE_OPTIONS = [
  { code: "PLAYER", name: "Игрок" },
  { code: "COACH", name: "Тренер" },
  { code: "ASSISTANT_COACH", name: "Помощник тренера" },
  { code: "GOALKEEPER_COACH", name: "Тренер вратарей" },
  { code: "FITNESS_COACH", name: "Тренер по физподготовке" },
  { code: "ADMINISTRATOR", name: "Администратор" },
  { code: "DELEGATE", name: "Делегат" },
  { code: "DOCTOR", name: "Врач" },
  { code: "MASSEUR", name: "Массажист" },
] as const;

export const REGISTRATION_ROLE_CODES: readonly string[] = REGISTRATION_ROLE_OPTIONS.map((o) => o.code);

export function isRegistrationRole(value: unknown): value is string {
  return typeof value === "string" && REGISTRATION_ROLE_CODES.includes(value.trim());
}

/** Человекочитаемый список допустимых ролей для текста ошибок API */
export const REGISTRATION_ROLE_CODES_TEXT = REGISTRATION_ROLE_CODES.join(", ");
