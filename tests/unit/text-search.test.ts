import { describe, expect, test } from "bun:test";
import { caseVariants, capitalizeRu } from "@/lib/text";

// v1.0.34: вариантный регистронезависимый поиск — грабля locale=C/
// SQL_ASCII в alpine-postgres (LOWER() не складывает кириллицу).

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
