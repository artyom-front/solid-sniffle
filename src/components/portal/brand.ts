// Конфигурация бренда портала — смена названия в одном месте.
// SCORESBOX: «scores» (livescore-глагол) + «box» — имя домена.
// Визуальная идентичность: «Ночь под прожекторами» — тёмный графит + чувашское золото #FFD400.
// ДОМЕН (scoresbox.ru с 2026-09): отсюда берётся надпись в подвале сайта
// и другие бренд-упоминания. При смене домена правим domain ниже + см.
// раздел «Смена домена» в DEPLOY.md (меняются SITE_URL + nginx + cert).
const DOMAIN = "scoresbox.ru";

export const BRAND = {
  name: "SCORESBOX",
  wordmark: "SCORES",
  mark: "BOX",
  domain: DOMAIN,
  tagline: "Футбол Чувашии онлайн",
  region: "Республика Чувашия",
  gold: "#FFD400",
} as const;
