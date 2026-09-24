// ============================================================
// Каталог специализаций (ролей) персоны.
// Файл ЧИСТЫЙ (без БД и next-зависимостей): используется и сервером
// (API/импорт), и клиентом (формы админки), и юнит-тестами.
// HttpError из lib/http тоже чистый — без зависимостей.
//
// Персона — НЕ обязательно игрок: один человек может быть
// одновременно игроком в ветеранской лиге и судьёй в другой
// (в РАЗНЫХ чемпионатах — см. конфликты ниже).
//
// Системные роли — фиксированный код (PLAYER, COACH, REFEREE…),
// кастомные — записи в таблице CustomRole, код «c:<id>».
// Person.roles хранит массив кодов; isReferee синхронизируется
// с наличием REFEREE (совместимость со старыми фильтрами/API).
//
// ТАКСОНОМИЯ (v1.0.19): три логические группы участников события —
//   • team      «Команда» — представители команд: игроки, тренерский
//     штаб, руководство, пресс-атташе, администратор, массажист.
//     Представитель команды может совмещать роли (играющий тренер).
//   • officials «Судейский корпус» — назначаются организаторами
//     события: главный/помощники/резервный/VAR-судьи, инспектор,
//     делегат. Не могут быть игроками или ангажированы с командами-
//     участницами текущего матча.
//   • medicine  «Медицина» — врач: нейтральная роль. Может работать
//     и на команду (заявка), и на матч (бригада); в матче конфликт
//     интересов — как у судей (не обслуживает матч своей команды).
// ============================================================

import { HttpError } from "@/lib/http";

export interface RoleDef {
  code: string;
  name: string;
  /** Группа для отображения в форме */
  group: "team" | "officials" | "medicine";
}

/** Официальные футбольные роли (по протоколам РФС/ФИФА + региональная практика) */
export const SYSTEM_ROLES: RoleDef[] = [
  // — представители команды (могут совмещаться между собой) —
  { code: "PLAYER", name: "Игрок", group: "team" },
  { code: "COACH", name: "Главный тренер", group: "team" },
  { code: "ASSISTANT_COACH", name: "Помощник тренера", group: "team" },
  { code: "GOALKEEPER_COACH", name: "Тренер вратарей", group: "team" },
  { code: "FITNESS_COACH", name: "Тренер по физподготовке", group: "team" },
  { code: "PRESS_OFFICER", name: "Пресс-атташе", group: "team" },
  { code: "PRESIDENT", name: "Президент / председатель", group: "team" },
  { code: "GENERAL_MANAGER", name: "Генеральный менеджер", group: "team" },
  { code: "ADMINISTRATOR", name: "Администратор", group: "team" },
  { code: "MASSEUR", name: "Массажист", group: "team" },
  // — судейский корпус (организаторы события) —
  { code: "REFEREE", name: "Главный судья", group: "officials" },
  { code: "ASSISTANT_REFEREE", name: "Помощник судьи", group: "officials" },
  { code: "FOURTH_OFFICIAL", name: "Резервный судья", group: "officials" },
  { code: "VAR", name: "VAR-судья", group: "officials" },
  { code: "AVAR", name: "Помощник VAR-судьи", group: "officials" },
  { code: "INSPECTOR", name: "Инспектор", group: "officials" },
  { code: "DELEGATE", name: "Делегат матча", group: "officials" },
  // — медицина (нейтральная) —
  { code: "DOCTOR", name: "Врач", group: "medicine" },
];

export const ROLE_GROUP_LABELS: Record<RoleDef["group"], string> = {
  team: "Команда",
  officials: "Судейский корпус",
  medicine: "Медицина",
};

export const SYSTEM_ROLE_CODES = new Set(SYSTEM_ROLES.map((r) => r.code));

/** Префикс кода кастомной роли: «c:<customRoleId>» */
export const CUSTOM_ROLE_PREFIX = "c:";

export function isCustomRoleCode(code: string): boolean {
  return code.startsWith(CUSTOM_ROLE_PREFIX);
}

/** Роли, которые имеет смысл выбирать в заявке команды на сезон (Registration.role).
 *  Делегат и судьи — организаторы события, в заявку команды не попадают. */
export const REGISTRATION_ROLES: { code: string; name: string }[] = [
  { code: "PLAYER", name: "Игрок" },
  { code: "COACH", name: "Главный тренер" },
  { code: "ASSISTANT_COACH", name: "Помощник тренера" },
  { code: "GOALKEEPER_COACH", name: "Тренер вратарей" },
  { code: "FITNESS_COACH", name: "Тренер по физподготовке" },
  { code: "ADMINISTRATOR", name: "Администратор" },
  { code: "PRESS_OFFICER", name: "Пресс-атташе" },
  { code: "MASSEUR", name: "Массажист" },
  { code: "PRESIDENT", name: "Президент / председатель" },
  { code: "GENERAL_MANAGER", name: "Генеральный менеджер" },
  { code: "DOCTOR", name: "Врач" },
];

/** Роли судейской бригады матча: главный + помощники (×2) + резервный +
 *  VAR/AVAR + инспектор + делегат + врач (нейтральный, может быть ×2). */
export const MATCH_OFFICIAL_ROLES: { code: string; name: string; multiple: boolean }[] = [
  { code: "REFEREE", name: "Главный судья", multiple: false },
  { code: "ASSISTANT_REFEREE", name: "Помощник судьи", multiple: true },
  { code: "FOURTH_OFFICIAL", name: "Резервный судья", multiple: false },
  { code: "VAR", name: "VAR-судья", multiple: false },
  { code: "AVAR", name: "Помощник VAR-судьи", multiple: false },
  { code: "INSPECTOR", name: "Инспектор", multiple: false },
  { code: "DELEGATE", name: "Делегат матча", multiple: false },
  { code: "DOCTOR", name: "Врач", multiple: true },
];

/** Коды ролей бригады матча (для валидации API) */
export const MATCH_OFFICIAL_ROLE_CODES = new Set(MATCH_OFFICIAL_ROLES.map((r) => r.code));

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
// Инвариант «нейтральные роли ≠ игрок» (v1.0.19).
//
// СУДЕЙСКИЙ КОРПУС (главный/помощники/резервный/VAR/AVAR/инспектор/
// делегат) и ВРАЧ несовместимы с ролью «Игрок» НА ОДНОЙ КАРТОЧКЕ
// персоны: это нейтральные участники события. Внутри одного
// чемпионата+сезона — жёсткий запрет на уровне заявки и назначения
// (см. lib/engine/conflicts.ts). Человек может играть в лиге A и
// судить лигу B: тогда на карточке остаётся судейская роль, а
// игроком он становится через ЗАЯВКУ (Registration в другом сезоне —
// роль заявки не зависит от роли карточки).
//
// Представители команды свободно совмещаются между собой
// («играющий тренер», президент-массажист и т.п.).
// ============================================================

/** Коды судейского корпуса */
export const REFEREE_CONFLICT_CODES: string[] = SYSTEM_ROLES.filter(
  (r) => r.group === "officials"
).map((r) => r.code);

/** Нейтральные роли: судейский корпус + врач — несовместимы с «Игрок» на карточке */
export const PLAYER_CONFLICT_CODES: string[] = [
  ...REFEREE_CONFLICT_CODES,
  "DOCTOR",
];

export function hasPlayerRole(roles: string[]): boolean {
  return roles.includes("PLAYER");
}

/** Есть ли судейская роль (главный, помощник, резервный, VAR, AVAR, инспектор, делегат) */
export function hasRefereeCorpsRole(roles: string[]): boolean {
  return roles.some((code) => REFEREE_CONFLICT_CODES.includes(code));
}

/** Конфликтующие нейтральные коды при наличии роли PLAYER (для сообщений об ошибке) */
export function cardRoleConflict(roles: string[]): string[] {
  if (!hasPlayerRole(roles)) return [];
  return roles.filter((code) => PLAYER_CONFLICT_CODES.includes(code));
}

/** Текст пояснения инварианта — единый для API, импорта и UI */
export const CARD_ROLE_CONFLICT_HINT =
  "Судья и врач — нейтральные роли, «Игрок» с ними несовместим. " +
  "Если человек судит одну лигу, а играет в другой — оставьте на карточке судейскую роль " +
  "и заявите его игроком в нужном сезоне (заявка не зависит от роли карточки). " +
  "В одном чемпионате и сезоне совмещение запрещено полностью.";

/** Названия ролей для понятных сообщений (ошибки API, отчёты импорта) */
export function roleName(code: string): string {
  return SYSTEM_ROLES.find((r) => r.code === code)?.name ?? code;
}

/**
 * Карточная проверка (без БД): «Игрок» + нейтральная роль — 422.
 * Сезонный скоуп (заявка игрока ↔ назначение в бригаду сезона) —
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
