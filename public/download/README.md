# Поставка SCORESBOX — v1.0.53 «feedback53» (08.10.2026)

**Что это:** релиз-консолидация: две линии разработки снова одна
(линия чата: feedback46 + diskfix52 + feedback52; параллельная линия
юзера: logo47 + branding48 + crud49 — 9 конфликтов решены в пользу
продовой линии с портированием фиксов) + три фичи фидбека 08.10:
**SB-монограмма** (малые лого/фавиконы), **SEO-картинки из админки**
(og:image) и **лайтбокс** (просмотр фото игроков/эмблем поближе).
Код приложения менялся.

## ⚠ ДВЕ миграции БД — применятся АВТОМАТИЧЕСКИ

- `00000000000006_branding` — BrandSetting (лого/фавикон из админки);
- `00000000000007_seo` — BrandSetting.ogImageUrl (SEO-картинка).

deploy.sh применяет миграции сам (prisma migrate deploy) и делает
**бэкап БД до миграций**. Строки про миграции 06/07 в логе деплоя —
норма, не ошибка.

## 1. SB-монограмма — маленькие лого и фавиконы

Малые знаки упрощены: золотой квадрат (rx 17.5%) с чернильными
литерами «SB» (Baloo 2 ExtraBold, чистые SVG-пути). Дефолты:
иконка браузера `/brand/logo53/mark.svg`, apple-icon
`/brand/logo53/apple-icon.png`. Загруженные из админки лого/фавикон
перекрывают дефолты; сброс возвращает SB-монограмму.

## 2. SEO и поисковые системы (og:image из админки)

Панель «Сайт → Брендинг» → подсекция «SEO и поисковые системы»:
карточка-превью ссылки (рекомендация 1200×630, PNG/JPG/WebP/AVIF
до 8 МБ; SVG не подходит — поисковики его не читают) + мокап «как
увидит поисковик». Дефолт — `/brand/og-default.png`. Layout отдаёт
openGraph/twitter + JSON-LD Organization/WebSite. Яндекс покажет
превью после **переиндексации** (дни–недели): ускорить —
Яндекс.Вебмастер → «Переобход страниц».

## 3. Лайтбокс — «посмотреть поближе»

Клик по фото игрока (страница игрока, карточка персоны в панели)
или эмблеме команды (страница команды, карточка команды) —
полноэкранный просмотр: зум 1–3× (двойной клик / колесо / кнопки),
Esc, ←/→, свайп, счётчик фото. Заглушки-плейсхолдеры не открываются.

## 4. Прочее

- HEALTH: `/api/health` показывает version из package.json
  (next.config env APP_VERSION) — было «1.0.0»;
- юнит 149/149; tsc 0; eslint 0; production build ОК.

## 5. Применить и задеплоить (PowerShell, папка вашего клона)

```bash
git fetch "$HOME\Downloads\scoresbox-2026-10-08-feedback53.git-bundle" main
git log --oneline -3 FETCH_HEAD   # «SCORESBOX 2026-10-08 feedback53: …»
git log FETCH_HEAD..main          # ПУСТО = терять нечего, безопасно
git reset --hard FETCH_HEAD && git push --force origin main
git tag v1.0.53 && git push origin v1.0.53
```

⚠️ Перед `reset --hard`: если `git log FETCH_HEAD..main` НЕ пуст —
в вашем main есть коммиты, которых нет в бандле. Сначала спрячьте
их: `git branch backup/pre-v1053 main`, и только потом reset.
Проверьте, что `git log --oneline -1 FETCH_HEAD` начинается с
«SCORESBOX 2026-10-08 feedback53: v1.0.53».

После деплоя: `/api/health` → `"version":"1.0.53"`. Строки миграций
06/07 в логе деплоя — норма (бэкап БД сделан ДО миграций).

## 6. Что проверить на проде

1. админка → «Сайт → Брендинг»: лого + иконка браузера + подсекция
   «SEO и поисковые системы» (загрузите картинку 1200×630 — мокап
   рядом обновится; есть «Сбросить»);
2. клик по фото игрока / эмблеме команды — лайтбокс (Esc закрывает,
   колесо — зум);
3. favicon по умолчанию — золотой квадрат «SB»;
4. Яндекс покажет превью после переиндексации — Яндекс.Вебмастер;
5. фичи feedback52 на месте: тёзки-ФИО, замены/состояние матча,
   капитан, единое создание игрока, DIRECTOR, мобильные формы.

**Важно:** бандл содержит ветку `main` — при клоне с нуля делайте
`git clone -b main <bundle>` (без `-b` чекаут будет пустым).

## 7. Архив поставок (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.53** (текущая) | `scoresbox-2026-10-08-feedback53.git-bundle` | консолидация линий, SB-монограмма, SEO og:image + JSON-LD, лайтбокс, миграции 06+07 |
| v1.0.52 | `scoresbox-2026-10-08-feedback52.git-bundle` | дубли ФИО, замены/состояние матча, капитан, единое создание, DIRECTOR + синк ролей, мобильные формы, diskfix52 |
| v1.0.46 | `scoresbox-2026-10-07-feedback46.git-bundle` | селекторы без обрезания, поздние заявки + перенос даты, дедуп заявок, медиа 1920px |
| v1.0.45 | `scoresbox-2026-10-06-dbfix45.git-bundle` | фикс деплоя: бэкап и проверка внутри контейнера db |
| v1.0.44 | `scoresbox-2026-10-05-fs44.git-bundle` | UI-фидбек + аудит №10–19 |
| v1.0.43 | `scoresbox-2026-10-05-cifix43.git-bundle` | фикс CI (VLM-снесение, check-deps) |
| v1.0.42 | `scoresbox-2026-10-05-sec42.git-bundle` | security: скоупы, media DELETE, Next 16.3.8 |
| v1.0.41 | `scoresbox-2026-10-05-fs41.git-bundle` | протокол/составы по futbol24 |
| v1.0.40 | `scoresbox-2026-10-01-fs40.git-bundle` | хронология FlashScore, лого |
| v1.0.39 | `scoresbox-2026-09-30-fs39.git-bundle` | лента 52px/кнопка даты, аккордеон |
| v1.0.38 | `scoresbox-2026-09-30-fs38.git-bundle` | страница матча по FlashScore |
| v1.0.35–37 | `…-mobile35 / -brand36 / -minute37` | мобильный адаптив, фирстиль, минута у счёта |
| v1.0.21–34 | `…-security … -logic34` | RBAC, судейский корпус, деплой-фиксы (см. старые README) |

**Прямые ссылки (панель /download/):**

- v1.0.53: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-08-feedback53.git-bundle
- v1.0.52: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-08-feedback52.git-bundle
- v1.0.46: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-07-feedback46.git-bundle
- v1.0.45: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-06-dbfix45.git-bundle
- v1.0.44: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-fs44.git-bundle
- v1.0.43: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-cifix43.git-bundle
- v1.0.42: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-sec42.git-bundle

## Грабли agent-browser (задокументированы)

`agent-browser eval` держит ПЕРСИСТЕНТНЫЙ JS-контекст: top-level `const`
живёт между вызовами, повторное объявление = SyntaxError. Все
multi-statement eval — в IIFE. `find label fill` не триггерит
React-состояние (controlled input остаётся пустым, submit блокируется
нативной валидацией): в смооках логиниться демо-кнопками по email.
`find text` кликает только первый точный матч — для табов с бейджем
счётчика («Протокол · 12») клик через eval по textContent.startsWith.
Тонкость SMTP-мока: nodemailer кодирует письма (text — base64, html —
quoted-printable, тема — RFC 2047) — токен ссылки ищется только после
декодирования (см. parseMail в test-invites.ts).

