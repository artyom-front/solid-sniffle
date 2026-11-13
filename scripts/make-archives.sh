#!/usr/bin/env bash
# ============================================================
# SCORESBOX · make-archives.sh — сборка доставочных архивов
# 1. scoresbox-full.git-bundle  — git bundle --all (полная история)
# 2. scoresbox-source.zip       — git archive HEAD (только файлы репо)
# 3. scoresbox-update.git-bundle — тонкий бандл поверх 30e60c2
# 4. гайды (DEPLOY/PLAYBOOK) + README + versioned-бандлы
# Всё кладётся в download/ (панель файлов чата) и public/ (превью-ссылка).
# Папка download/ в .gitignore — при сбросе песочницы стирается,
# поэтому скрипт создаёт её сам: bash scripts/make-archives.sh.
#
# ПОЛИТИКА ХРАНЕНИЯ БАНДЛОВ (v1.0.24, требование юзера от 2026-09-20):
# ВСЕ versioned-бандлы начиная с v1.0.21 хранятся НАВСЕГДА в
# download/ и public/download/ — юзер всегда может скачать любую
# прошлую поставку. Чистятся ТОЛЬКО generic-имена (onefile).
# ⛔ ЗАПРЕЩЕНО: rm по маскам scoresbox-2026-* / scoresbox-20*.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

BUNDLE=download/scoresbox-full.git-bundle
ZIP=download/scoresbox-source.zip

mkdir -p download public

echo "==> Сборка git bundle (полная история)"
rm -f "$BUNDLE"
git bundle create "$BUNDLE" --all
git bundle verify "$BUNDLE" >/dev/null && echo "    bundle корректен"

echo "==> Сборка zip исходников (tracked-файлы)"
rm -f "$ZIP"
git archive --format=zip -o "$ZIP" HEAD
unzip -t "$ZIP" >/dev/null 2>&1 && echo "    zip без ошибок"

echo "==> Копии в public/ (раздача через превью-сервер)"
cp "$BUNDLE" public/scoresbox-full.git-bundle
cp "$ZIP" public/scoresbox-source.zip

echo "==> Тонкий update-бандл (только новые коммиты поверх 30e60c2)"
# 30e60c2 — коммит, которым завершалась предыдущая поставка bundle
# (то, что пользователь уже запушил в GitHub). Если у него репо есть —
# хватит маленького файла вместо 69 МБ.
UPDATE=download/scoresbox-update.git-bundle
rm -f "$UPDATE"
if git rev-parse --verify --quiet 30e60c2^{commit} >/dev/null; then
  git bundle create "$UPDATE" main ^30e60c2
  cp "$UPDATE" public/scoresbox-update.git-bundle
  echo "    update-бандл собран"
else
  echo "    (базовый коммит 30e60c2 не найден — update-бандл пропущен)"
fi

echo "==> Самодостаточный мини-бандл (один коммит, работает в ЛЮБОМ репозитории)"
# Имя файла содержит ДАТУ — чтобы пользователь сразу отличал актуальный бандл
# от скачанных ранее. Сообщение коммита внутри тоже начинается с даты:
# проверка «git log --oneline -1 FETCH_HEAD» должна показывать ту же дату.
ONEFILE=download/scoresbox-2026-11-13-feedback56.git-bundle
# Чистим ТОЛЬКО generic-имя. Versioned-бандлы (security/next35/stage2fix/
# hotfix24/…) НЕ трогаем — см. политику хранения в шапке скрипта.
rm -f download/scoresbox-onefile.git-bundle public/scoresbox-onefile.git-bundle
ROOT="$(pwd)"
SQUASH=/tmp/sb-squash
rm -rf "$SQUASH"
git clone -q . "$SQUASH"
( cd "$SQUASH" \
  && git checkout -q --orphan tmp-main \
  && { git rm -rq --cached public/download 2>/dev/null || true; } \
  && rm -rf public/download \
  && git commit -q -m "SCORESBOX 2026-11-13 feedback56: v1.0.56 — медиа на клиенте: фото игроков/клубов «не видны», проверка видео/фото/прочих медиа, тихие заглушки. (1) МЕДИА-КОНВЕЙЕР: аплоад работал, РВАЛОСЬ на отдаче — у team.logoUrl НЕ БЫЛО фолбэка на club.logoUrl (эмблемы грузили КЛУБАМ, а матч-DTO/профили читали только team.logoUrl); карточка матча вообще не отдавала logoUrl/photoUrl; таблица/H2H/составы/судьи/списки — без полей медиа. Теперь logoUrl = team ?? club сквозняком (лента, календарь, таблица, H2H, карточка матча, профили, «Команды», дисциплины, судьи), фото в составах/тренерах/бомбардирах. (2) ВИДЕО-МЕДИА (новое): /api/admin/media — mp4/webm/mov до 64 МБ; /api/media/[id] — Range-запросы → 206+Accept-Ranges (иначе <video> не перематывает, iOS не играет); CSP media-src 'self' blob:; MediaUpload — превью <video>; Lightbox — <video controls>; стат-карточки правой колонки принимают видео-момент (проигрывается в карточке). (3) ЗАГЛУШКИ: цветные инициалы с hashHue-градиентами заменены тихими монохромными иконками — контур мяча (команды) / силуэт человека (персоны), text-ink3/60, списки читаются как текст. СМОК smoke56.ts 14/14 (фото игроку+лого клубу → публичный API → SSR <img>; mp4 → 206 bytes 0-9/23); bun 157/157; tsc 0; eslint 0. МИГРАЦИЙ НЕТ — схема не менялась." \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-11-13-feedback56.git-bundle
git bundle verify "$ONEFILE" >/dev/null 2>&1 && echo "    onefile-бандл корректен: $ONEFILE"

echo "==> Гайды для чтения без git (только выжившие — дублей больше нет)"
cp DEPLOY.md README.md DEPLOY-PLAYBOOK.md ADMIN-GUIDE.md download/
echo "    DEPLOY.md, README.md, DEPLOY-PLAYBOOK.md, ADMIN-GUIDE.md -> download/"

# образцовый CSV импорта (UTF-8+BOM, «;», CRLF) — генерится из скрипта
if command -v python3 >/dev/null; then python3 scripts/make-sample-import.py; fi

echo "==> public/download/ — переживает сбросы песочницы (лежит в git)"
# Бандлы в корне public/ и папка download/ исключены из git и стираются
# при пересоздании песочницы — отсюда «404» на старых ссылках.
# Копия в public/download/ коммитится в git: сброс песочницы → git restore
# → ссылка /download/... снова работает без пересборки.
# ВАЖНО: из сквош-клона выше public/download удалён — иначе бандл
# вкладывался бы сам в себя при каждой пересборке.
# ⛔ ЧИСТКИ НЕТ: versioned-бандлы v1.0.21+ копируются в download/ как есть
# (требование юзера 2026-09-20: ссылки на прошлые бандлы живут вечно).
mkdir -p public/download
cp "$ONEFILE" public/download/

# README генерируется ЗДЕСЬ (до копирования — папка download/ могла быть
# стёрта сбросом песочницы, chicken-egg).
cat > download/README.md <<'EOF'
# Поставка SCORESBOX — v1.0.56 «feedback56» (13.11.2026)

**Что это:** правки по фидбеку от 13.11 — «фото игроков и клубов
добавлены в админке, а на клиенте не появились», «проверь добавление
видео, фото и прочих медиа», «вместо дефолтных букв — что-то более
приятное». Код приложения менялся. **МИГРАЦИЙ БД НЕТ** — схема не
менялась, deploy пройдёт без применения миграций.

## Коротко: три изменения

1. **Фото и эмблемы теперь видны на клиенте везде** — исправлен
   разрыв «админка видит, клиент нет».
2. **Видео-медиа** — mp4/WebM до 64 МБ: загрузка, перемотка,
   воспроизведение в лайтбоксе и стат-карточках.
3. **Заглушки без фото** — тихие монохромные иконки (мяч/силуэт)
   вместо цветных букв-инициалов.

## 1. Почему фото «не доезжали» и что исправлено

Загрузка в админке работала, но клиент не получал медиа в трёх
местах:

- **Эмблемы грузились КЛУБАМ, а клиент читал только
  `team.logoUrl`** — у большинства команд своей эмблемы нет, и
  фолбэка на лого клуба не было. Теперь везде
  `team.logoUrl ?? club.logoUrl`: лента матчей, календарь,
  турнирная таблица, H2H, карточка матча, профили, вкладка
  «Команды».
- **Карточка матча** не отдавала ни эмблемы команд, ни фото судьи
  и игроков составов. Теперь отдаёт: гербы в шапке и «кто
  пропускает», фото в составах и у судейской бригады.
- **Списки** (таблица, бомбардиры, дисциплины, судьи, составы в
  профиле команды) — без полей медиа. Теперь фото/гербы
  прокинуты по всей цепочке `standings → queries → profiles →
  public → типы → Crest/Avatar`.

Проверка смоком (14/14): загрузить фото игроку и лого клубу →
публичный API отдаёт `photoUrl`/`logoUrl` (с фолбэком клуба) →
SSR-страницы `/player`, `/team` рендерят `<img src="/api/media/…">`.

## 2. Видео: как пользоваться

- Загрузка: то же поле медиа — `/api/admin/media` принимает
  mp4/WebM/MOV до 64 МБ (файлы с телефона без MIME-типа тоже).
- **Стат-карточки** (Сайт → Стат-карточки): в поле «Фото/картинка
  или видео» можно загрузить видео-момент — карточка в правой
  колонке проигрывает его прямо на странице.
- Клик по фото игрока/эмблеме открывает лайтбокс: видео там
  играет с управлением (play/пауза/перемотка).
- Технически: раздача с поддержкой Range (206) — перемотка
  работает, iOS стартует воспроизведение; CSP дополнен
  `media-src 'self' blob:`.

## 3. Заглушки

Если у команды/игрока нет эмблемы/фото — вместо цветного квадрата
с инициалами рисуется тихая иконка: контур мяча (команды, тёмный
ромб) и силуэт человека (персоны, круг), приглушённый серый
штрих. Списки читаются как текст, внимание не отвлекает.

## 4. Применить и задеплоить (PowerShell, папка вашего клона)

```bash
git fetch "$HOME\Downloads\scoresbox-2026-11-13-feedback56.git-bundle" main
git log --oneline -3 FETCH_HEAD   # «SCORESBOX 2026-11-13 feedback56: …»
git log FETCH_HEAD..main          # ПУСТО = терять нечего, безопасно
git reset --hard FETCH_HEAD && git push --force origin main
git tag v1.0.56 && git push origin v1.0.56
```

⚠️ Перед `reset --hard`: если `git log FETCH_HEAD..main` НЕ пуст —
в вашем main есть коммиты, которых нет в бандле. Сначала спрячьте
их: `git branch backup/pre-v1056 main`, и только потом reset.
Проверьте, что `git log --oneline -1 FETCH_HEAD` начинается с
«SCORESBOX 2026-11-13 feedback56: v1.0.56».

После деплоя: `/api/health` → `"version":"1.0.56"`. Строк
миграций в логе деплоя быть не должно (их нет в этой поставке).

## 5. Что проверить на проде

1. страница любого матча с эмблемой у клуба: герб в шапке (и в
   составах на мобиле);
2. профиль игрока с фото: `<img>` в шапке; клик — лайтбокс;
3. турнирная таблица лиги: гербы команд (фолбэк на лого клуба);
4. составы на матче: аватары с фото у заявленных игроков;
5. стат-карточка с видео: клик по колонке справа — играет;
6. команда/игрок БЕЗ медиа: тихая иконка вместо букв.

**Важно:** бандл содержит ветку `main` — при клоне с нуля делайте
`git clone -b main <bundle>` (без `-b` чекаут будет пустым).

## 6. Архив поставок (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.56** (текущая) | `scoresbox-2026-11-13-feedback56.git-bundle` | медиа-конвейер (фото/лого сквозь клиент, фолбэк клуба), видео mp4/WebM + Range, тихие заглушки |
| v1.0.55 | `scoresbox-2026-10-09-feedback55.git-bundle` | штаб на матч (играющий сотрудник), начальник команды, сквозная заявка, чистка подсказок/счётчиков |
| v1.0.54 | `scoresbox-2026-10-09-feedback54.git-bundle` | предварительная таблица, важный матч из админки, фантомный ассист, лайтбокс-UX, составы/протокол, судьи без рейтинга |
| v1.0.53 | `scoresbox-2026-10-08-feedback53.git-bundle` | консолидация линий, SB-монограмма, SEO og:image + JSON-LD, лайтбокс, миграции 06+07 |
| v1.0.52 | `scoresbox-2026-10-08-feedback52.git-bundle` | дубли ФИО, замены/состояние матча, капитан, единое создание, DIRECTOR + синк ролей, мобильные формы, diskfix52 |
| v1.0.46 | `scoresbox-2026-10-07-feedback46.git-bundle` | селекторы без обрезания, поздние заявки + перенос даты, дедуп заявок, медиа 1920px |
| v1.0.45 | `scoresbox-2026-10-06-dbfix45.git-bundle` | фикс деплоя: бэкап и проверка внутри контейнера db |
| v1.0.44 | `scoresbox-2026-10-05-fs44.git-bundle` | UI-фидбек + аудит №10–19 |
| v1.0.43 | `scoresbox-2026-10-05-cifix43.git-bundle` | фикс CI (VLM-снесение, check-deps) |
| v1.0.42 | `scoresbox-2026-10-05-sec42.git-bundle` | security: скоупы, media DELETE, Next 16.3.8 |

**Прямые ссылки (панель /download/):**

- v1.0.56: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-11-13-feedback56.git-bundle
- v1.0.55: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-09-feedback55.git-bundle
- v1.0.54: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-09-feedback54.git-bundle
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

EOF

# v1.0.54: ПАНЕЛЬ синкается ЗДЕСЬ (корневой фикс бага 56b: раньше
# README/гайды копировались в public/download вручную и один раз
# «забылись» — панель осталась на v1.0.46). Правило: make-archives —
# единственная точка, где панель обновляется.
cp download/README.md public/download/README.md
cp download/ADMIN-GUIDE.md public/download/ADMIN-GUIDE.md
echo "    панель public/download синкнута (README + ADMIN-GUIDE)"
