// SECURITY (аудит Task 27, v1.0.24): whitelist для URL, которые
// попадают в href/img src/CSS url() ПУБЛИЧНЫХ страниц (баннеры,
// ссылки на протоколы и т.п.). Разрешены ТОЛЬКО абсолютные http(s)://
// и относительные пути внутри сайта. Всё остальное — javascript:,
// data:, vbscript:, blob:, file:, about:, протокольно-относительные
// //host, обфускация управляющими символами («jav\tascript:») — нет.
//
// Храненный XSS через Banner.linkUrl был главной находкой аудита:
// схема нигде не валидировалась, и клик по баннеру мог исполнить код
// в браузере посетителя.

// управляющие символы + пробелы: «java\nscript:» и «%0A»-обфускация
const CTRL = /[\u0000-\u001f\u007f\s]/;
// символы, ломающие URL-токен в CSS url(...) и HTML-атрибутах:
// кавычки, обратный слэш, скобки, угловые скобки
const UNSAFE = /["'`\\()<>\u2028\u2029]/;

/** Безопасен ли URL для вставки в href / src / css url() */
export function isSafeWebUrl(value: string): boolean {
  if (!value) return false;
  if (CTRL.test(value)) return false;
  if (UNSAFE.test(value)) return false;
  // относительный путь внутри сайта: /api/media/x, /league/...
  // (протокольно-относительный //host — не допускаем)
  if (value.startsWith("/")) return /^\/[^/]/.test(value);
  try {
    const u = new URL(value);
    // new URL("") без базы бросит; протокол приводится к нижнему регистру,
    // так что «JAVASCRIPT:» тоже отсеется здесь
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
