import { describe, expect, test } from "bun:test";
import { decodeCsvBytes, encodingLabel } from "@/lib/csvEncoding";

const utf8 = (s: string) => new TextEncoder().encode(s);

const utf16 = (s: string, be = false) => {
  const b = new Uint8Array(s.length * 2 + 2);
  b[0] = be ? 0xfe : 0xff;
  b[1] = be ? 0xff : 0xfe;
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    if (be) {
      b[2 + i * 2] = u >> 8;
      b[3 + i * 2] = u & 0xff;
    } else {
      b[2 + i * 2] = u & 0xff;
      b[3 + i * 2] = u >> 8;
    }
  }
  return b;
};

// Байты реального файла пользователя: Excel «CSV (разделители — точка с
// запятой)» = windows-1251, заголовок + строка Артемьева
const CP1251_ARTEMYEV = Uint8Array.from([
  0xd4, 0xe0, 0xec, 0xe8, 0xeb, 0xe8, 0xff, 0x3b, 0xc8, 0xec, 0xff, 0x3b, 0xce, 0xf2, 0xf7, 0xe5, 0xf1, 0xf2, 0xe2, 0xee,
  0x3b, 0xc4, 0xe0, 0xf2, 0xe0, 0xd0, 0xee, 0xe6, 0xe4, 0xe5, 0xed, 0xe8, 0xff, 0x3b, 0xcf, 0xee, 0xe7, 0xe8, 0xf6, 0xe8,
  0xff, 0x3b, 0xcd, 0xee, 0xec, 0xe5, 0xf0, 0x3b, 0xd0, 0xee, 0xeb, 0xfc, 0x0d, 0x0a, 0xc0, 0xf0, 0xf2, 0xe5, 0xec, 0xfc,
  0xe5, 0xe2, 0x3b, 0xc4, 0xe5, 0xec, 0xfc, 0xff, 0xed, 0x3b, 0xce, 0xeb, 0xe5, 0xe3, 0xee, 0xe2, 0xe8, 0xf7, 0x3b, 0x32,
  0x32, 0x2e, 0x30, 0x37, 0x2e, 0x31, 0x39, 0x39, 0x30, 0x3b, 0xcd, 0xe0, 0xef, 0xe0, 0xe4, 0xe0, 0xfe, 0xf9, 0xe8, 0xe9,
  0x3b, 0x31, 0x3b, 0xc8, 0xe3, 0xf0, 0xee, 0xea, 0x0d, 0x0a,
]);

// «Фамилия;Имя;Отчество» + 3 игрока в koi8-r (старые экспорты БД)
const KOI8R_PLAYERS = Uint8Array.from([
  0xe6, 0xc1, 0xcd, 0xc9, 0xcc, 0xc9, 0xd1, 0x3b, 0xe9, 0xcd, 0xd1, 0x3b, 0xef, 0xd4, 0xde, 0xc5, 0xd3, 0xd4, 0xd7, 0xcf,
  0x0d, 0x0a, 0xf3, 0xc9, 0xc4, 0xcf, 0xd2, 0xcf, 0xd7, 0x3b, 0xe1, 0xcc, 0xc5, 0xcb, 0xd3, 0xc5, 0xca, 0x3b, 0xee, 0xc1,
  0xd0, 0xc1, 0xc4, 0xc1, 0xc0, 0xdd, 0xc9, 0xca, 0x0d, 0x0a, 0xe2, 0xc5, 0xcc, 0xd8, 0xc3, 0xcf, 0xd7, 0x3b, 0xe1, 0xcc,
  0xc5, 0xcb, 0xd3, 0xc1, 0xce, 0xc4, 0xd2, 0x3b, 0xfa, 0xc1, 0xdd, 0xc9, 0xd4, 0xce, 0xc9, 0xcb, 0x0d, 0x0a,
]);

describe("csvEncoding · decodeCsvBytes", () => {
  test("UTF-8 с кириллицей проходит без изменений", () => {
    const src = "Фамилия;Имя\r\nИванов;Иван";
    const { text, encoding } = decodeCsvBytes(utf8(src));
    expect(encoding).toBe("utf-8");
    expect(text).toBe(src);
  });

  test("BOM UTF-8 срезается декодером — парсеру он не нужен", () => {
    const src = "\uFEFFФамилия;Имя";
    const { text, encoding } = decodeCsvBytes(utf8(src));
    expect(encoding).toBe("utf-8");
    expect(text).not.toContain("\uFEFF");
    expect(text).toBe("Фамилия;Имя");
  });

  test("CRLF не теряется при декодировании", () => {
    const { text } = decodeCsvBytes(utf8("а\r\nб\r\n"));
    expect(text).toBe("а\r\nб\r\n");
  });

  test("windows-1251 (Excel «CSV» в русской локали) распознаётся и восстанавливается", () => {
    const { text, encoding } = decodeCsvBytes(CP1251_ARTEMYEV);
    expect(encoding).toBe("windows-1251");
    const lines = text.replace(/^\uFEFF/, "").split("\r\n").filter(Boolean);
    expect(lines[0]).toBe("Фамилия;Имя;Отчество;ДатаРождения;Позиция;Номер;Роль");
    expect(lines[1]).toBe("Артемьев;Демьян;Олегович;22.07.1990;Нападающий;1;Игрок");
    expect(text.includes("\uFFFD")).toBe(false);
  });

  test("koi8-r распознаётся по частотному скорингу русского текста", () => {
    const { text, encoding } = decodeCsvBytes(KOI8R_PLAYERS);
    expect(encoding).toBe("koi8-r");
    const lines = text.split("\r\n").filter(Boolean);
    expect(lines[0]).toBe("Фамилия;Имя;Отчество");
    expect(lines[1]).toBe("Сидоров;Алексей;Нападающий");
    expect(lines[2]).toBe("Бельцов;Александр;Защитник");
  });

  test("UTF-16LE с BOM (Excel «Текст в Юникоде») читается корректно", () => {
    const src = "Фамилия;\tИван";
    const { text, encoding } = decodeCsvBytes(utf16(src));
    expect(encoding).toBe("utf-16le");
    expect(text).toBe(src);
  });

  test("UTF-16BE с BOM читается корректно (ручной свап байтов)", () => {
    const src = "Иванов;Иван";
    const { text, encoding } = decodeCsvBytes(utf16(src, true));
    expect(encoding).toBe("utf-16be");
    expect(text).toBe(src);
  });

  test("чистый ASCII — это валидный UTF-8", () => {
    const { text, encoding } = decodeCsvBytes(utf8("Ivanov;Ivan"));
    expect(encoding).toBe("utf-8");
    expect(text).toBe("Ivanov;Ivan");
  });

  test("мусорные байты без кириллицы — «unknown», исключения нет", () => {
    const garbage = Uint8Array.from([0x80, 0x98, 0xa5, 0x22, 0x0a]);
    const res = decodeCsvBytes(garbage);
    expect(res.encoding).toBe("unknown");
    expect(typeof res.text).toBe("string");
  });

  test("обрезанный UTF-8 не принимается за UTF-8 (нет тихих потерь)", () => {
    // «И» в UTF-8 = D0 98; оставляем только D0 — обрыв последовательности
    const truncated = Uint8Array.from([0xd0, 0x3b, 0x0a]);
    const res = decodeCsvBytes(truncated);
    expect(res.encoding).not.toBe("utf-8");
  });
});

describe("csvEncoding · encodingLabel", () => {
  test("человекочитаемые названия для тостов", () => {
    expect(encodingLabel("windows-1251")).toContain("windows-1251");
    expect(encodingLabel("utf-8")).toBe("UTF-8");
    expect(encodingLabel("unknown")).toContain("неизвестная");
  });
});
