import { describe, expect, test } from "bun:test";
import { caseVariants, capitalizeRu, displayTeamName } from "@/lib/text";

// v1.0.34: вариантный регистронезависимый поиск — грабля locale=C/
// SQL_ASCII в alpine-postgres (LOWER() не складывает кириллицу).
// v1.0.40: публичное имя команды без «№N» (фидбек 2026-10-01).

describe("Публичное имя команды без «№N»", () => {
  test("«Химик-НО №3» → «Химик-НО»", () => {
    expect(displayTeamName("Химик-НО №3")).toBe("Химик-НО");
  });

  test("«Команда № 12» (с пробелом) → «Команда»", () => {
    expect(displayTeamName("Команда № 12")).toBe("Команда");
  });

  test("дефис перед № тоже убирается: «Спартак-№2» → «Спартак»", () => {
    expect(displayTeamName("Спартак-№2")).toBe("Спартак");
  });

  test("имя без № не трогаем", () => {
    expect(displayTeamName("Волга-ЧЕ")).toBe("Волга-ЧЕ");
    expect(displayTeamName("Динамо")).toBe("Динамо");
  });

  test("№ в середине не трогаем (только хвостовой суффикс)", () => {
    expect(displayTeamName("№1 ФСК")).toBe("№1 ФСК");
  });

  test("имя целиком из «№3» остаётся как было (не пустеем)", () => {
    expect(displayTeamName("№3")).toBe("№3");
  });
});

describe("Варианты написания для поиска (locale-независимо)", () => {
  test("строчные → все варианты, без дублей", () => {
    expect(caseVariants("мамонтов")).toEqual(["мамонтов", "МАМОНТОВ", "Мамонтов"]);
  });

  test("с заглавной → добавляет нижний и верхний", () => {
    expect(caseVariants("Мамонтов")).toEqual(["Мамонтов", "мамонтов", "МАМОНТОВ"]);
  });

  test("два слова: капитализация каждого слова", () => {
    expect(caseVariants("мамонтов виктор")).toContain("Мамонтов Виктор");
    expect(caseVariants("МАМОНТОВ ВИКТОР")).toContain("Мамонтов Виктор");
    expect(caseVariants("Мамонтов Виктор")).toContain("мамонтов виктор");
  });

  test("латиница и цифры проходят как есть + варианты", () => {
    expect(caseVariants("score5")).toContain("SCORE5");
    expect(caseVariants("SCORE5")).toContain("score5");
  });

  test("пустое и пробелы → пустой список", () => {
    expect(caseVariants("")).toEqual([]);
    expect(caseVariants("   ")).toEqual([]);
  });

  test("capitalizeRu: дефисы и внутренние пробелы сохраняются", () => {
    expect(capitalizeRu("смирнов-петров")).toBe("Смирнов-петров");
    expect(capitalizeRu("васильев  пётр")).toBe("Васильев  Пётр");
  });
});
