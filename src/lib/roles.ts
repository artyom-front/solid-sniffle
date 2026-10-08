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
// Person.roles хранит массив кодов; isReferee = принадлежность
// судейскому корпусу (совместимость со старыми фильтрами/API).
//
// ТАКСОНОМИЯ (v1.0.19, уточнена v1.0.34): три логические группы:
//   • team      «Команда» — представители команд: игроки, тренерский
//     штаб, руководство, пресс-атташе, администратор, массажист.
//     Представитель команды может совмещать роли (играющий тренер).
//   • officials «Судейский корпус» — ЕДИНАЯ роль на карточке (REFEREE
//     «представитель судейского корпуса»); конкретная должность в
//     матче — главный/помощник/резервный/VAR/инспектор/делегат —
//     назначается в бригаде матча (MATCH_OFFICIAL_ROLES). Судья
//     может быть игроком (карточка), но не в одном чемпионате и
//     сезоне (lib/engine/conflicts.ts), и не обслуживает матчи
//     команд, где заявлен (конфликт интересов).
//   • medicine  «Медицина» — врач: нейтральная роль. Может работать
//     и на команду (заявка), и на матч (бригада); в матче конфликт
//     интересов — как у судей (не обслуживает матч своей команды).
// ============================================================

// (v1.0.34: HttpError больше не нужен — карточная проверка конфликтов
//  удалена, жёсткие правила живут в lib/engine/conflicts.ts)

export interface RoleDef {
  code: string;
  name: string;
  /** Группа для отображения в форме */
  group: "team" | "officials" | "medicine";
}

/** Официальные футбольные роли (по протоколам РФС/ФИФА + региональная практика).
 *  v1.0.34 · СУДЕЙСКИЙ КОРПУС — ЕДИНАЯ РОЛЬ НА КАРТОЧКЕ: человек является
 *  «представителем судейского корпуса» (код REFEREE), а конкретная
 *  должность — главный / помощник / резервный / VAR / инспектор / делегат —
 *  назначается В МАТЧЕ (MATCH_OFFICIAL_ROLES). Судья региональной лиги
 *  сегодня главный, завтра инспектор, послезавтра делегат — такова
 *  практика (и золотой стандарт назначений РФС/ФИФА). Узкие корпусные
 *  коды на карточке больше НЕ ВЫБИРАЮТСЯ; старые данные нормализованы
 *  миграцией 00000000000005, а normalizeRoles переводит их в REFEREE. */
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
  { code: "DIRECTOR", name: "Директор", group: "team" },
  { code: "ADMINISTRATOR", name: "Администратор", group: "team" },
  { code: "MASSEUR", name: "Массажист", group: "team" },
  // — судейский корпус: ОДНА роль на карточке, должность — в матче —
  { code: "REFEREE", name: "Судья (судейский корпус)", group: "officials" },
  // — медицина (нейтральная) —
  { code: "DOCTOR", name: "Врач", group: "medicine" },
];

/** Узкие должности судейского корпуса — существуют ТОЛЬКО как роль
 *  назначения в матче (MatchOfficial.role). Встретившись на карточке
 *  (легаси-данные/импорт), переводятся в REFEREE (см. normalizeRoles). */
export const NARROW_OFFICIAL_ROLE_CODES = [
  "ASSISTANT_REFEREE", "FOURTH_OFFICIAL", "VAR", "AVAR", "INSPECTOR", "DELEGATE",
] as const;

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
  { code: "DIRECTOR", name: "Директор" },
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

/** Нормализация списка кодов ролей: только известные системные или «c:*».
 *  Узкие должности корпуса на карточке переводятся в REFEREE —
 *  «представитель судейского корпуса» (v1.0.34). */
export function normalizeRoles(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    let code = String(v).trim();
    if (!code) continue;
    if ((NARROW_OFFICIAL_ROLE_CODES as readonly string[]).includes(code)) code = "REFEREE";
    if (SYSTEM_ROLE_CODES.has(code) || isCustomRoleCode(code)) {
      if (!out.includes(code)) out.push(code);
    }
  }
  return out;
}

/** isReferee = человек принадлежит судейскому корпусу (в ролях есть REFEREE
 *  либо легаси-узкая должность — до нормализации). Флаг выставляется для
 *  ЛЮБОЙ должности корпуса: главный/помощник/инспектор/делегат — все
 *  кандидаты во все судейские списки (v1.0.34: «Матренин-инспектор может
 *  быть главным судьёй»). */
export function refereeFromRoles(roles: string[]): boolean {
  return (
    roles.includes("REFEREE") ||
    roles.some((code) => (NARROW_OFFICIAL_ROLE_CODES as readonly string[]).includes(code))
  );
}

// ============================================================
// «Судья × игрок» (v1.0.34 — редизайн по фидбеку владельца).
//
// КАРТОЧНЫЙ запрет «Игрок + судья» УДАЛЁН: один и тот же человек в
// региональном футболе реально играет в одной лиге и судит в другой.
// Карточка — это человек; роли описательные, совмещаются свободно.
//
// Защита переехала на СЕЗОННЫЙ уровень (lib/engine/conflicts.ts —
// проверка осталась и работает): судейский корпус не может иметь
// действующую заявку ИГРОКА в том же чемпионате и сезоне, где он
// обслуживает матчи, — и наоборот. Это ровно правило владельца:
// «нельзя, чтобы судья был игроком в одном турнире и сезоне».
//
// Представители команды свободно совмещаются между собой
// («играющий тренер», президент-массажист и т.п.).
// ============================================================

/** Коды судейского корпуса (карточка REFEREE + легаси-узкие должности) */
export const REFEREE_CONFLICT_CODES: string[] = [
  "REFEREE",
  ...(NARROW_OFFICIAL_ROLE_CODES as readonly string[]),
];

export function hasPlayerRole(roles: string[]): boolean {
  return roles.includes("PLAYER");
}

/** Есть ли принадлежность судейскому корпусу (карточка REFEREE либо легаси-должность) */
export function hasRefereeCorpsRole(roles: string[]): boolean {
  return roles.some((code) => REFEREE_CONFLICT_CODES.includes(code));
}

/** Совместная роль судьи и игрока на карточке — не конфликт, а
 *  ПОДСКАЗКА (v1.0.34): конфликт остаётся только на уровне сезона. */
export function cardRoleConflict(roles: string[]): string[] {
  void roles;
  return [];
}

/** Текст пояснения — единый для API, импорта и UI */
export const CARD_ROLE_CONFLICT_HINT =
  "Судья может быть и игроком — но не в одном чемпионате и сезоне (проверяется " +
  "автоматически при заявке и назначении). Совмещение на карточке ролей «Игрок» и «Судья» — " +
  "нормальная ситуация: человек играет в одной лиге и судит другую.";

/** Названия ролей для понятных сообщений (ошибки API, отчёты импорта).
 *  Ищем и в карточных ролях, и в должностях бригады матча — после
 *  v1.0.34 «Инспектор»/«Помощник судьи» живут только в матче. */
export function roleName(code: string): string {
  const sys = SYSTEM_ROLES.find((r) => r.code === code);
  if (sys) return sys.name;
  const match = MATCH_OFFICIAL_ROLES.find((r) => r.code === code);
  if (match) return match.name;
  return code;
}

/**
 * Карточная проверка (v1.0.34): совместимость «Игрок + судья» на карточке
 * РАЗРЕШЕНА — функция сохранена для совместимости вызовов и молчит.
 * Единственное жёсткое правило живёт на уровне сезона —
 * lib/engine/conflicts.ts (assertRefereeAssignmentAllowed /
 * assertPlayerRegistrationAllowed).
 */
export function assertNoCardRoleConflict(roles: string[]): void {
  void roles;
}
