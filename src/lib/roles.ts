// ============================================================
// Каталог специализаций (ролей) персоны.
// Файл ЧИСТЫЙ (без БД и next-зависимостей): используется и сервером
// (API/импорт), и клиентом (формы админки), и юнит-тестами.
// HttpError из lib/http тоже чистый — без зависимостей.
//
// Персона — НЕ обязательно игрок: один человек может быть
// одновременно игроком в ветеранской лиге и судьёй в другой
// (в РАЗНЫХ чемпионатах — см. REFEREE_CONFLICT_CODES ниже).
//
// Системные роли — фиксированный код (PLAYER, COACH, REFEREE…),
// кастомные — записи в таблице CustomRole, код «c:<id>».
// Person.roles хранит массив кодов; isReferee синхронизируется
// с наличием REFEREE (совместимость со старыми фильтрами/API).
// ============================================================

import { HttpError } from "@/lib/http";

export interface RoleDef {
  code: string;
  name: string;
  /** Группа для отображения в форме */
  group: "field" | "staff" | "officials" | "medicine" | "management";
}

/** Официальные футбольные роли (по протоколам РФС/ФИФА + региональная практика) */
export const SYSTEM_ROLES: RoleDef[] = [
  // — на поле / около команды —
  { code: "PLAYER", name: "Игрок", group: "field" },
  { code: "COACH", name: "Главный тренер", group: "field" },
  { code: "ASSISTANT_COACH", name: "Помощник тренера", group: "field" },
  { code: "GOALKEEPER_COACH", name: "Тренер вратарей", group: "field" },
  { code: "FITNESS_COACH", name: "Тренер по физподготовке", group: "field" },
  // — судейский корпус —
  { code: "REFEREE", name: "Судья (главный арбитр)", group: "officials" },
  { code: "ASSISTANT_REFEREE", name: "Помощник судьи (ассистент)", group: "officials" },
  { code: "FOURTH_OFFICIAL", name: "Резервный судья", group: "officials" },
  { code: "VAR", name: "VAR-судья", group: "officials" },
  { code: "AVAR", name: "Помощник VAR-судья (AVAR)", group: "officials" },
  { code: "INSPECTOR", name: "Инспектор / ассессор судейства", group: "officials" },
  // — персонал команды —
  { code: "ADMINISTRATOR", name: "Администратор команды", group: "staff" },
  { code: "DELEGATE", name: "Делегат матча", group: "staff" },
  { code: "PRESS_OFFICER", name: "Пресс-атташе", group: "staff" },
  // — медицина —
  { code: "DOCTOR", name: "Врач", group: "medicine" },
  { code: "MASSEUR", name: "Массажист", group: "medicine" },
  // — руководство —
  { code: "PRESIDENT", name: "Президент / председатель", group: "management" },
  { code: "GENERAL_MANAGER", name: "Генеральный менеджер", group: "management" },
];

export const ROLE_GROUP_LABELS: Record<RoleDef["group"], string> = {
  field: "Игровые и тренерские",
  officials: "Судейский корпус",
  staff: "Административный персонал",
  medicine: "Медицина",
  management: "Руководство",
};

export const SYSTEM_ROLE_CODES = new Set(SYSTEM_ROLES.map((r) => r.code));

/** Префикс кода кастомной роли: «c:<customRoleId>» */
export const CUSTOM_ROLE_PREFIX = "c:";

export function isCustomRoleCode(code: string): boolean {
  return code.startsWith(CUSTOM_ROLE_PREFIX);
}

/** Роли, которые имеет смысл выбирать в заявке команды на сезон (Registration.role) */
export const REGISTRATION_ROLES: { code: string; name: string }[] = [
  { code: "PLAYER", name: "Игрок" },
  { code: "COACH", name: "Главный тренер" },
  { code: "ASSISTANT_COACH", name: "Помощник тренера" },
  { code: "GOALKEEPER_COACH", name: "Тренер вратарей" },
  { code: "FITNESS_COACH", name: "Тренер по физподготовке" },
  { code: "ADMINISTRATOR", name: "Администратор" },
  { code: "DELEGATE", name: "Делегат" },
  { code: "DOCTOR", name: "Врач" },
  { code: "MASSEUR", name: "Массажист" },
];

/** Нормализация списка кодов ролей: только известные системные или «c:*» */
export function normalizeRoles(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    const code = String(v).trim();
    if (!code) continue;
    if (SYSTEM_ROLE_CODES.has(code) || isCustomRoleCode(code)) {
      if (!out.includes(code)) out.push(code);
    }
  }
  return out;
}

/** isReferee = в ролях есть REFEREE (совместимость со старым флагом) */
export function refereeFromRoles(roles: string[]): boolean {
  return roles.includes("REFEREE");
}

// ============================================================
// Инвариант «судья ≠ игрок» (решение продуктового раунда v2).
//
// Судейский корпус (главный/помощник/резервный/VAR/AVAR/инспектор)
// НЕсовместим с ролью «Игрок» НА ОДНОЙ КАРТОЧКЕ персоны.
// Внутри одного чемпионата+сезона — жёсткий запрет на уровне
// заявки и назначения судьи (см. lib/engine/conflicts.ts).
// Человек может играть в лиге A и судить лигу B: тогда на карточке
// оставляется судейская роль, а игроком он становится через ЗАЯВКУ
// (Registration в другом сезоне — роль заявки не зависит от роли карточки).
//
// Игрок свободно совмещается с тренером («играющий тренер»),
// администратором, президентом и прочими ролями вне судейского корпуса.
// ============================================================

/** Коды судейского корпуса, несовместимые с ролью PLAYER на карточке персоны */
export const REFEREE_CONFLICT_CODES: string[] = SYSTEM_ROLES.filter(
  (r) => r.group === "officials"
).map((r) => r.code);

export function hasPlayerRole(roles: string[]): boolean {
  return roles.includes("PLAYER");
}

/** Есть ли судейская роль (главный, помощник, резервный, VAR, AVAR, инспектор) */
export function hasRefereeCorpsRole(roles: string[]): boolean {
  return roles.some((code) => REFEREE_CONFLICT_CODES.includes(code));
}

/** Конфликтующие судейские коды при наличии роли PLAYER (для сообщений об ошибке) */
export function cardRoleConflict(roles: string[]): string[] {
  if (!hasPlayerRole(roles)) return [];
  return roles.filter((code) => REFEREE_CONFLICT_CODES.includes(code));
}

/** Текст пояснения инварианта — единый для API, импорта и UI */
export const CARD_ROLE_CONFLICT_HINT =
  "Судья не может быть игроком: роли «Игрок» и судейская несовместимы. " +
  "Если человек судит одну лигу, а играет в другой — оставьте на карточке судейскую роль " +
  "и заявите его игроком в нужном сезоне (заявка не зависит от роли карточки). " +
  "В одном чемпионате и сезоне совмещение запрещено полностью.";

/** Названия ролей для понятных сообщений (ошибки API, отчёты импорта) */
export function roleName(code: string): string {
  return SYSTEM_ROLES.find((r) => r.code === code)?.name ?? code;
}

/**
 * Карточная проверка (без БД): «Игрок» + судейская роль — 422.
 * Сезонный скоуп (заявка игрока ↔ назначение судьи в одном чемпионате) —
 * в lib/engine/conflicts.ts.
 */
export function assertNoCardRoleConflict(roles: string[]): void {
  const conflict = cardRoleConflict(roles);
  if (conflict.length === 0) return;
  const names = conflict.map(roleName).join(", ");
  throw new HttpError(
    422,
    `Несовместимые роли: «Игрок» нельзя совместить с ${conflict.length > 1 ? "ролями" : "ролью"} ${names}. ` +
      CARD_ROLE_CONFLICT_HINT
  );
}
