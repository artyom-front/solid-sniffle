// ============================================================
// Каталог специализаций (ролей) персоны.
// Персона — НЕ обязательно игрок: один человек может быть
// одновременно игроком в ветеранской лиге и судьёй в другой.
//
// Системные роли — фиксированный код (PLAYER, COACH, REFEREE…),
// кастомные — записи в таблице CustomRole, код «c:<id>».
// Person.roles хранит массив кодов; isReferee синхронизируется
// с наличием REFEREE (совместимость со старыми фильтрами/API).
// ============================================================

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
