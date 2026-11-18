// ============================================================
// csvEncoding — устойчивое чтение CSV-файлов с кириллицей.
//
// Проблема (поймана в проде 09.09.2026): Excel в русской локали
// сохраняет «CSV (разделители — точка с запятой)» в windows-1251,
// а FileReader.text() всегда читает файл как UTF-8 — кириллица
// превращается в U+FFFD «» и строки импорта ломаются.
// Браузерный TextDecoder("windows-1251") не гарантирован (Safari/JSC
// его не поддерживают), поэтому таблицы декодирования зашиты сюда.
//
// Порядок распознавания (decodeCsvBytes):
//   1) BOM UTF-16LE/BE (Excel «Текст в Юникоде») → utf-16;
//   2) валидный UTF-8 (строгая проверка) → utf-8;
//   3) иначе — windows-1251 или koi8-r: декодируем обе, выбираем
//      ту, где текст больше похож на русский (частотный скоринг).
// ============================================================

export type DetectedEncoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1251" | "koi8-r" | "unknown";

// windows-1251, байты 0x80..0xFF (0x98 — не определён стандартом)
const CP1251_HI: string[] = [
  "\u0402", "\u0403", "\u201a", "\u0453", "\u201e", "\u2026", "\u2020", "\u2021",
  "\u20ac", "\u2030", "\u0409", "\u2039", "\u040a", "\u040c", "\u040b", "\u040f",
  "\u0452", "\u2018", "\u2019", "\u201c", "\u201d", "\u2022", "\u2013", "\u2014",
  "\ufffd", "\u2122", "\u0459", "\u203a", "\u045a", "\u045c", "\u045b", "\u045f",
  "\u00a0", "\u040e", "\u045e", "\u0408", "\u00a4", "\u0490", "\u00a6", "\u00a7",
  "\u0401", "\u00a9", "\u0404", "\u00ab", "\u00ac", "\u00ad", "\u00ae", "\u0407",
  "\u00b0", "\u00b1", "\u0406", "\u0456", "\u0491", "\u00b5", "\u00b6", "\u00b7",
  "\u0451", "\u2116", "\u0454", "\u00bb", "\u0458", "\u0405", "\u0455", "\u0457",
  "\u0410", "\u0411", "\u0412", "\u0413", "\u0414", "\u0415", "\u0416", "\u0417",
  "\u0418", "\u0419", "\u041a", "\u041b", "\u041c", "\u041d", "\u041e", "\u041f",
  "\u0420", "\u0421", "\u0422", "\u0423", "\u0424", "\u0425", "\u0426", "\u0427",
  "\u0428", "\u0429", "\u042a", "\u042b", "\u042c", "\u042d", "\u042e", "\u042f",
  "\u0430", "\u0431", "\u0432", "\u0433", "\u0434", "\u0435", "\u0436", "\u0437",
  "\u0438", "\u0439", "\u043a", "\u043b", "\u043c", "\u043d", "\u043e", "\u043f",
  "\u0440", "\u0441", "\u0442", "\u0443", "\u0444", "\u0445", "\u0446", "\u0447",
  "\u0448", "\u0449", "\u044a", "\u044b", "\u044c", "\u044d", "\u044e", "\u044f",
];

// koi8-r, байты 0x80..0xFF (псевдографика и прочее вне букв)
const KOI8R_HI: string[] = [
  "\u2500", "\u2502", "\u250c", "\u2510", "\u2514", "\u2518", "\u251c", "\u2524",
  "\u252c", "\u2534", "\u253c", "\u2580", "\u2584", "\u2588", "\u258c", "\u2590",
  "\u2591", "\u2592", "\u2593", "\u2320", "\u25a0", "\u2219", "\u221a", "\u2248",
  "\u2264", "\u2265", "\u00a0", "\u2321", "\u00b0", "\u00b2", "\u00b7", "\u00f7",
  "\u2550", "\u2551", "\u2552", "\u0451", "\u2553", "\u2554", "\u2555", "\u2556",
  "\u2557", "\u2558", "\u2559", "\u255a", "\u255b", "\u255c", "\u255d", "\u255e",
  "\u255f", "\u2560", "\u2561", "\u0401", "\u2562", "\u2563", "\u2564", "\u2565",
  "\u2566", "\u2567", "\u2568", "\u2569", "\u256a", "\u256b", "\u256c", "\u00a9",
  "\u044e", "\u0430", "\u0431", "\u0446", "\u0434", "\u0435", "\u0444", "\u0433",
  "\u0445", "\u0438", "\u0439", "\u043a", "\u043b", "\u043c", "\u043d", "\u043e",
  "\u043f", "\u044f", "\u0440", "\u0441", "\u0442", "\u0443", "\u0436", "\u0432",
  "\u044c", "\u044b", "\u0437", "\u0448", "\u044d", "\u0449", "\u0447", "\u044a",
  "\u042e", "\u0410", "\u0411", "\u0426", "\u0414", "\u0415", "\u0424", "\u0413",
  "\u0425", "\u0418", "\u0419", "\u041a", "\u041b", "\u041c", "\u041d", "\u041e",
  "\u041f", "\u042f", "\u0420", "\u0421", "\u0422", "\u0423", "\u0416", "\u0412",
  "\u042c", "\u042b", "\u0417", "\u0428", "\u042d", "\u0429", "\u0427", "\u042a",
];

const ASCII: string[] = Array.from({ length: 128 }, (_, i) => String.fromCharCode(i));

/** Частоты русских букв (×10, приближение к частотному словарю) — для скоринга */
const RU_FREQ: Record<string, number> = {
  о: 110, е: 85, а: 80, и: 73, н: 68, т: 60, с: 54, р: 47, в: 45, л: 43,
  к: 35, м: 32, д: 30, п: 28, у: 24, я: 19, ы: 19, ь: 17, г: 18, з: 17,
  б: 16, ч: 14, й: 12, х: 10, ж: 9, ю: 8, ш: 6, ц: 5, щ: 4, э: 3, ф: 3, ё: 1,
};

function ruScore(s: string): number {
  let score = 0;
  for (const ch of s) score += RU_FREQ[ch.toLowerCase()] ?? 0;
  return score;
}

/** Декодирование по 128-символьной таблице старшей половины байтов */
function decodeByTable(bytes: Uint8Array, hi: string[]): string {
  const parts: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    parts[i] = b < 0x80 ? ASCII[b]! : hi[b - 0x80]!;
  }
  let out = "";
  for (let i = 0; i < parts.length; i += 4096) out += parts.slice(i, i + 4096).join("");
  return out;
}

/** UTF-16BE: переставляем байты в парах → декодируем как LE */
function decodeUtf16be(bytes: Uint8Array): string {
  const body = bytes.subarray(2); // срезаем BOM
  const swapped = new Uint8Array(body.length);
  for (let i = 0; i + 1 < body.length; i += 2) {
    swapped[i] = body[i + 1]!;
    swapped[i + 1] = body[i]!;
  }
  return new TextDecoder("utf-16le").decode(swapped);
}

/** Строгая проверка UTF-8 (включая обрезанные последовательности и overlong) */
function isValidUtf8(b: Uint8Array): boolean {
  let i = 0;
  const n = b.length;
  while (i < n) {
    const c = b[i]!;
    if (c < 0x80) {
      i++;
      continue;
    }
    let len: number;
    if (c >= 0xc2 && c <= 0xdf) len = 1;
    else if (c >= 0xe0 && c <= 0xef) len = 2;
    else if (c >= 0xf0 && c <= 0xf4) len = 3;
    else return false; // продолжение-байт, изолированный суррогат, overlong
    if (i + len >= n) return false; // обрезанная последовательность
    for (let k = 1; k <= len; k++) {
      const cc = b[i + k]!;
      if (cc < 0x80 || cc > 0xbf) return false;
    }
    i += len + 1;
  }
  return true;
}

/**
 * Определение кодировки и декодирование CSV-байтов.
 * Никогда не бросает исключение; «unknown» означает «не похоже ни на что
 * известное» — текст вернётся как есть (cp1251-интерпретация), возможно
 * с «»; серверная проверка импорта это поймает и объяснит.
 */
export function decodeCsvBytes(bytes: Uint8Array): { text: string; encoding: DetectedEncoding } {
  // UTF-16 по BOM (Excel «Текст в Юникоде»)
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: decodeUtf16be(bytes), encoding: "utf-16be" };
  }
  // UTF-8 (BOM оставляем — CSV-парсер его срезает сам)
  if (isValidUtf8(bytes)) {
    return { text: new TextDecoder("utf-8").decode(bytes), encoding: "utf-8" };
  }
  // windows-1251 против koi8-r — по частотному скорингу
  const cp = decodeByTable(bytes, CP1251_HI);
  const koi = decodeByTable(bytes, KOI8R_HI);
  const cpScore = ruScore(cp);
  const koiScore = ruScore(koi);
  if (koiScore > cpScore) return { text: koi, encoding: "koi8-r" };
  if (cpScore > 0) return { text: cp, encoding: "windows-1251" };
  return { text: cp, encoding: "unknown" };
}

/** Чтение File из input[type=file] с автоопределением кодировки */
export async function readFileTextSmart(f: File): Promise<{ text: string; encoding: DetectedEncoding }> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  return decodeCsvBytes(bytes);
}

/** Человекочитаемое имя кодировки для тостов/подсказок */
export function encodingLabel(e: DetectedEncoding): string {
  switch (e) {
    case "utf-8":
      return "UTF-8";
    case "utf-16le":
      return "Юникод-текст UTF-16";
    case "utf-16be":
      return "Юникод-текст UTF-16BE";
    case "windows-1251":
      return "windows-1251 (обычный «CSV» из Excel)";
    case "koi8-r":
      return "koi8-r (старая русская кодировка)";
    default:
      return "неизвестная кодировка";
  }
}
