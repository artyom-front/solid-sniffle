import { describe, expect, test } from "bun:test";
import {
  SYSTEM_ROLES,
  NARROW_OFFICIAL_ROLE_CODES,
  REFEREE_CONFLICT_CODES,
  cardRoleConflict,
  hasPlayerRole,
  hasRefereeCorpsRole,
  roleName,
  normalizeRoles,
  assertNoCardRoleConflict,
  refereeFromRoles,
  MATCH_OFFICIAL_ROLES,
} from "@/lib/roles";
import { IMPORT_SPECS, buildTemplateCsv, templateText, IMPORT_RULES } from "@/lib/importTemplates";
import { STAFF_ROLE_OPTIONS, STAFF_ROLE_CODES, isStaffRole, REGISTRATION_ROLE_CODES } from "@/lib/registration-roles";

// ============================================================
// v1.0.34 · Судейский корпус — единая роль на карточке.
// Кейс владельца: «Матренин-инспектор» виден в списке судей, но API
// отвергал его как главного судью; созданный «помощник судьи» не
// попадал в списки вовсе. Теперь: карточка = «представитель судейского
// корпуса» (REFEREE), должность назначается в матче.
// ============================================================

describe("Судейский корпус · единая роль (v1.0.34)", () => {
  test("корпус = карточка REFEREE + 6 узких легаси-должностей", () => {
    expect(REFEREE_CONFLICT_CODES).toEqual([
      "REFEREE",
      "ASSISTANT_REFEREE",
      "FOURTH_OFFICIAL",
      "VAR",
      "AVAR",
      "INSPECTOR",
      "DELEGATE",
    ]);
    expect(NARROW_OFFICIAL_ROLE_CODES).toHaveLength(6);
  });

  test("isReferee = любая принадлежность корпусу (Матренин-инспектор — судья)", () => {
    expect(refereeFromRoles(["REFEREE"])).toBe(true);
    expect(refereeFromRoles(["INSPECTOR"])).toBe(true);
    expect(refereeFromRoles(["VAR", "AVAR"])).toBe(true);
    expect(refereeFromRoles(["ASSISTANT_REFEREE"])).toBe(true);
    expect(refereeFromRoles(["DELEGATE"])).toBe(true);
    // не корпус
    expect(refereeFromRoles(["COACH", "PLAYER"])).toBe(false);
    expect(refereeFromRoles(["DOCTOR"])).toBe(false);
    expect(refereeFromRoles([])).toBe(false);
  });

  test("normalizeRoles переводит узкие должности в единый REFEREE", () => {
    expect(normalizeRoles(["INSPECTOR"])).toEqual(["REFEREE"]);
    expect(normalizeRoles(["ASSISTANT_REFEREE", "PLAYER"])).toEqual(["REFEREE", "PLAYER"]);
    // дедупликация REFEREE при двух узких
    expect(normalizeRoles(["VAR", "DELEGATE"])).toEqual(["REFEREE"]);
    // системные и кастомные — как были
    expect(normalizeRoles(["PLAYER", "COACH", "c:abc"])).toEqual(["PLAYER", "COACH", "c:abc"]);
    expect(normalizeRoles("не-массив")).toEqual([]);
    expect(normalizeRoles(["", "  ", "UNKNOWN"])).toEqual([]);
  });

  test("карточный конфликт «игрок × судья» УДАЛЁН (запрет — сезонный)", () => {
    // v1.0.34: роли «Игрок» и «Судья» совместимы на карточке — человек
    // играет в одной лиге и судит другую; запрет живёт в conflicts.ts
    expect(cardRoleConflict(["PLAYER", "REFEREE"])).toEqual([]);
    expect(cardRoleConflict(["PLAYER", "DOCTOR"])).toEqual([]);
    expect(cardRoleConflict(["PLAYER", "COACH"])).toEqual([]);
    expect(() => assertNoCardRoleConflict(["PLAYER", "REFEREE", "DOCTOR"])).not.toThrow();
  });

  test("hasPlayerRole / hasRefereeCorpsRole", () => {
    expect(hasPlayerRole(["PLAYER"])).toBe(true);
    expect(hasPlayerRole(["REFEREE"])).toBe(false);
    expect(hasRefereeCorpsRole(["AVAR"])).toBe(true);
    expect(hasRefereeCorpsRole(["INSPECTOR"])).toBe(true);
    expect(hasRefereeCorpsRole(["COACH", "PLAYER"])).toBe(false);
  });

  test("roleName знает и карточные роли, и должности матча", () => {
    expect(roleName("PLAYER")).toBe("Игрок");
    expect(roleName("REFEREE")).toBe("Судья (судейский корпус)");
    // должности матча (после v1.0.34 живут только здесь)
    expect(roleName("INSPECTOR")).toBe("Инспектор");
    expect(roleName("ASSISTANT_REFEREE")).toBe("Помощник судьи");
    expect(roleName("DELEGATE")).toBe("Делегат матча");
    expect(roleName("DOCTOR")).toBe("Врач");
    expect(roleName("c:abc")).toBe("c:abc");
  });

  test("карточных ролей — 14: 12 команда + 1 корпус + 1 медицина (v1.0.52: + Директор; v1.0.55: + Начальник команды)", () => {
    expect(SYSTEM_ROLES).toHaveLength(14);
    for (const r of SYSTEM_ROLES) {
      expect(["team", "officials", "medicine"]).toContain(r.group);
    }
    expect(SYSTEM_ROLES.filter((r) => r.group === "team")).toHaveLength(12);
    expect(SYSTEM_ROLES.filter((r) => r.group === "officials")).toHaveLength(1);
    expect(SYSTEM_ROLES.filter((r) => r.group === "medicine")).toHaveLength(1);
    // v1.0.52: роль «Директор» — заявочная административная роль
    expect(SYSTEM_ROLES.find((r) => r.code === "DIRECTOR")?.name).toBe("Директор");
    // v1.0.55 (feedback55 №4): «Начальник команды» — для заявки и штаба матча
    expect(SYSTEM_ROLES.find((r) => r.code === "TEAM_MANAGER")?.name).toBe("Начальник команды");
  });

  // ============================================================
  // v1.0.55 (feedback55 №4) · ШТАБ НА МАТЧ (LineupEntry.staffRole):
  // игрок может получить должность в штабе конкретного матча
  // («играющий помощник тренера», «начальник команды-игрок»).
  // ============================================================
  describe("Штаб матча · должности (v1.0.55)", () => {
    test("в списке штаба нет PLAYER — только сотрудники", () => {
      expect(STAFF_ROLE_OPTIONS.some((o) => (o.code as string) === "PLAYER")).toBe(false);
      expect(STAFF_ROLE_CODES).not.toContain("PLAYER");
    });

    test("помощник тренера и начальник команды доступны для штаба матча", () => {
      expect(STAFF_ROLE_CODES).toContain("ASSISTANT_COACH");
      expect(STAFF_ROLE_CODES).toContain("TEAM_MANAGER");
      expect(STAFF_ROLE_CODES).toContain("COACH");
      expect(STAFF_ROLE_CODES).toContain("DOCTOR");
    });

    test("валидация: код из списка проходит, мусор и PLAYER — нет", () => {
      expect(isStaffRole("ASSISTANT_COACH")).toBe(true);
      expect(isStaffRole(" TEAM_MANAGER ")).toBe(true); // трим
      expect(isStaffRole("PLAYER")).toBe(false);
      expect(isStaffRole("BANANA")).toBe(false);
      expect(isStaffRole(42)).toBe(false);
      expect(isStaffRole(null)).toBe(false);
    });

    test("роли штаба и роли заявки согласованы (штаб ⊂ заявки без PLAYER)", () => {
      for (const code of STAFF_ROLE_CODES) {
        expect(REGISTRATION_ROLE_CODES).toContain(code);
      }
    });
  });

  test("должности бригады матча — полный набор (главный…врач)", () => {
    const codes = MATCH_OFFICIAL_ROLES.map((r) => r.code);
    expect(codes).toContain("REFEREE");
    expect(codes).toContain("INSPECTOR");
    expect(codes).toContain("ASSISTANT_REFEREE");
    // помощники и врачи — множественные
    expect(MATCH_OFFICIAL_ROLES.find((r) => r.code === "ASSISTANT_REFEREE")?.multiple).toBe(true);
    expect(MATCH_OFFICIAL_ROLES.find((r) => r.code === "DOCTOR")?.multiple).toBe(true);
    expect(MATCH_OFFICIAL_ROLES.find((r) => r.code === "REFEREE")?.multiple).toBe(false);
  });
});

describe("CSV-шаблоны массового импорта", () => {
  test("у всех 5 сущностей есть поля, примеры и сводка", () => {
    for (const id of ["players", "persons", "teams", "stadiums", "clubs"] as const) {
      const spec = IMPORT_SPECS[id];
      expect(spec.fields.length).toBeGreaterThan(0);
      expect(spec.exampleRows.length).toBeGreaterThan(0);
      expect(spec.summary.length).toBeGreaterThan(0);
      // у каждой строки-примера — ровно столько ячеек, сколько колонок
      for (const row of spec.exampleRows) {
        expect(row).toHaveLength(spec.fields.length);
      }
    }
  });

  test("обязательные колонки на месте: ФИО/название", () => {
    expect(IMPORT_SPECS.persons.fields.find((f) => f.name === "Фамилия")?.required).toBe(true);
    expect(IMPORT_SPECS.players.fields.find((f) => f.name === "Имя")?.required).toBe(true);
    expect(IMPORT_SPECS.teams.fields.find((f) => f.name === "Название")?.required).toBe(true);
    expect(IMPORT_SPECS.stadiums.fields.find((f) => f.name === "Название")?.required).toBe(true);
    expect(IMPORT_SPECS.clubs.fields.find((f) => f.name === "Название")?.required).toBe(true);
  });

  test("шаблон: заголовок + CRLF + разделитель «;» (Excel)", () => {
    const csv = buildTemplateCsv("persons");
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Фамилия;Имя;Отчество;ДатаРождения;Позиция;Пол;Роль");
    expect(lines.length).toBe(1 + IMPORT_SPECS.persons.exampleRows.length);
    // каждая строка раскладывается ровно по числу колонок
    for (const line of lines) {
      expect(line.split(";")).toHaveLength(IMPORT_SPECS.persons.fields.length);
    }
  });

  test("templateText = buildTemplateCsv без хвостового CRLF (для вставки в textarea)", () => {
    expect(templateText("teams")).toBe(buildTemplateCsv("teams").trim());
  });

  test("правила импорта объясняют новое правило «судья × игрок»", () => {
    // v1.0.34: карточный конфликт удалён — запрет только сезонный
    expect(IMPORT_RULES.some((r) => r.includes("Судья и игрок (v1.0.34)"))).toBe(true);
    expect(IMPORT_RULES.some((r) => r.includes("Идемпотентно"))).toBe(true);
  });
});
