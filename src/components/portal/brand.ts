// Конфигурация бренда портала — смена названия в одном месте.
// SCORESBOX: «scores» (livescore-глагол) + «box» — имя домена.
// Визуальная идентичность: «Ночь под прожекторами» — тёмный графит + чувашское золото #FFD400.
// ДОМЕН (временный footballday.ru): отсюда берётся надпись в подвале сайта.
// При смене домена правим domain ниже + см. раздел «Смена домена» в DEPLOY.md.
const DOMAIN = "footballday.ru"; // временный; после получения доступа — scoresbox.ru

export const BRAND = {
  name: "SCORESBOX",
  wordmark: "SCORES",
  mark: "BOX",
  domain: DOMAIN,
  tagline: "Футбол Чувашии онлайн",
  region: "Республика Чувашия",
  gold: "#FFD400",
} as const;
