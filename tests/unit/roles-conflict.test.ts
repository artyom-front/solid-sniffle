import { describe, expect, test } from "bun:test";
import {
  SYSTEM_ROLES,
  REFEREE_CONFLICT_CODES,
  cardRoleConflict,
  hasPlayerRole,
  hasRefereeCorpsRole,
  roleName,
  assertNoCardRoleConflict,
  refereeFromRoles,
} from "@/lib/roles";
import { IMPORT_SPECS, buildTemplateCsv, templateText, IMPORT_RULES } from "@/lib/importTemplates";

describe("Инвариант «судья ≠ игрок» · карточка персоны", () => {
  test("судейский корпус = группа officials (6 ролей)", () => {
    expect(REFEREE_CONFLICT_CODES).toEqual([
      "REFEREE",
      "ASSISTANT_REFEREE",
      "FOURTH_OFFICIAL",
      "VAR",
      "AVAR",
      "INSPECTOR",
    ]);
  });

  test("игрок + судья — конфликт; игрок + тренер/админ/президент — нет", () => {
    expect(cardRoleConflict(["PLAYER", "REFEREE"])).toEqual(["REFEREE"]);
    expect(cardRoleConflict(["PLAYER", "VAR"])).toEqual(["VAR"]);
    expect(cardRoleConflict(["PLAYER", "REFEREE", "VAR"])).toEqual(["REFEREE", "VAR"]);
    // «играющий тренер» и «игрок-президент» — допустимо (решение пользователя)
    expect(cardRoleConflict(["PLAYER", "COACH"])).toEqual([]);
    expect(cardRoleConflict(["PLAYER", "ADMINISTRATOR", "PRESIDENT", "DOCTOR"])).toEqual([]);
    // судья без роли игрока — не конфликт
    expect(cardRoleConflict(["REFEREE", "INSPECTOR"])).toEqual([]);
    expect(cardRoleConflict([])).toEqual([]);
  });

  test("hasPlayerRole / hasRefereeCorpsRole", () => {
    expect(hasPlayerRole(["PLAYER"])).toBe(true);
    expect(hasPlayerRole(["REFEREE"])).toBe(false);
    expect(hasRefereeCorpsRole(["AVAR"])).toBe(true);
    expect(hasRefereeCorpsRole(["COACH", "PLAYER"])).toBe(false);
  });

  test("assertNoCardRoleConflict бросает 422 с понятным текстом", () => {
    expect(() => assertNoCardRoleConflict(["PLAYER", "REFEREE"])).toThrow("Несовместимые роли");
    expect(() => assertNoCardRoleConflict(["PLAYER", "REFEREE"])).toThrow(/Судья не может быть игроком/);
    // не бросает на допустимых комбинациях
    expect(() => assertNoCardRoleConflict(["PLAYER", "COACH", "PRESIDENT"])).not.toThrow();
    expect(() => assertNoCardRoleConflict(["REFEREE", "DELEGATE"])).not.toThrow();
  });

  test("isReferee синхронизируется только с главным арбитром", () => {
    expect(refereeFromRoles(["REFEREE"])).toBe(true);
    expect(refereeFromRoles(["VAR", "AVAR"])).toBe(false);
  });

  test("роль без кода в каталоге возвращается как есть", () => {
    expect(roleName("PLAYER")).toBe("Игрок");
    expect(roleName("c:abc")).toBe("c:abc");
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

  test("шаблон заявки не содержит «Игрок, Судья» в одной ячейке", () => {
    // инвариант «судья ≠ игрок»: примеры не должны учить плохому
    for (const row of IMPORT_SPECS.players.exampleRows) {
      const rolesCell = row[row.length - 1];
      const parts = rolesCell.split(/[,;]/).map((s) => s.trim());
      const hasPlayer = parts.includes("Игрок");
      const hasReferee = parts.some((p) => /судья|var|инспектор/i.test(p));
      expect(hasPlayer && hasReferee).toBe(false);
    }
    for (const row of IMPORT_SPECS.persons.exampleRows) {
      const rolesCell = row[row.length - 1];
      const parts = rolesCell.split(/[,;]/).map((s) => s.trim());
      const hasPlayer = parts.includes("Игрок");
      const hasReferee = parts.some((p) => /судья|var|инспектор/i.test(p));
      expect(hasPlayer && hasReferee).toBe(false);
    }
  });

  test("templateText = buildTemplateCsv без хвостового CRLF (для вставки в textarea)", () => {
    expect(templateText("teams")).toBe(buildTemplateCsv("teams").trim());
  });

  test("правила импорта объясняют инвариант «судья ≠ игрок»", () => {
    expect(IMPORT_RULES.some((r) => r.includes("Судья ≠ игрок"))).toBe(true);
    expect(IMPORT_RULES.some((r) => r.includes("Идемпотентно"))).toBe(true);
  });

  test("системных ролей — 18, все с группами", () => {
    expect(SYSTEM_ROLES).toHaveLength(18);
    for (const r of SYSTEM_ROLES) {
      expect(["field", "staff", "officials", "medicine", "management"]).toContain(r.group);
    }
  });
});
