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
ONEFILE=download/scoresbox-2026-10-06-dbfix45.git-bundle
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
  && git commit -q -m "SCORESBOX 2026-10-06 dbfix45: v1.0.45 — фикс упавшего 2026-10-05 деплоя v1.0.44 (останавливался на проверке бэкапа БД: «Бэкап не прошёл проверку — деплой ОСТАНОВЛЕН», exit 1). ПРИЧИНА: pg_dump выполняется ВНУТРИ контейнера db и работал, а проверка pg_restore --list — на ХОСТЕ VPS, где postgres-клиентов нет (весь PostgreSQL в docker, postgres:16-alpine): «command not found» (127) останавливал деплой при рабочем дампе; stderr проверки уходил в /dev/null, поэтому backups/pg-20261005-173830.err остался пустым. Прод не пострадал — миграции без бэкапа не стартовали (усиление аудита №17 из v1.0.44 сработало как задумано). ФИКСЫ: (1) deploy.sh — дамп И проверка pg_restore --list одной цепочкой ВНУТРИ контейнера db: pg_dump -f /tmp/scoresbox-verify.dump -> pg_restore --list (по файлу, не stdin) -> cat наружу в .part на хосте; cat ПОСЛЕ проверки — .part появляется только у проверенного дампа, провал любого звена = пустой вывод + ненулевой код = СТОП; при провале причина (хвост stderr шага бэкапа, docker compose ps db, df) печатается прямо в лог CI. (2) Жёсткий стоп, если PostgreSQL не готов за 60с (раньше цикл молча исчерпывался). (3) rollback.sh без аргумента откатывает на .deploy/current — последнюю РАБОЧУЮ версию (деплой 2026-10-05 упал ДО docker compose up, тега в history не было, CD-джоб rollback по «предпоследней строке» мог зря откатить здоровую 1.0.43 на 1.0.42); фолбэк history оставлен для установок без current. (4) Ротация бэкапов (30 дней) чистит и pg-*.err. Верификация: bash -n; scripts/test-dbfix45.sh — 3/3 PASS на заглушках (успех / падение pg_dump / падение проверки — кривой дамп не покидает «контейнер»); check-deps 0/0; unit 114/114; код приложения не менялся (tsc/eslint/build на CI без изменений с v1.0.44). МИГРАЦИЙ НЕТ — деплой пересоберёт контейнер, health -> 1.0.45." \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-10-06-dbfix45.git-bundle
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
# Поставка SCORESBOX — v1.0.45 «dbfix45: фикс деплоя бэкапа» (06.10.2026)

**Что это:** точечный фикс упавшего 2026-10-05 деплоя v1.0.44 —
деплой останавливался на шаге проверки бэкапа БД. Код приложения
не менялся; **миграций БД нет**; вся поставка — серверные скрипты
`scripts/deploy.sh` и `scripts/rollback.sh` (+ тест логики).

## 1. Что случилось с деплоем v1.0.44

Шаг «Бэкап БД (pg_dump)» завершался «Бэкап не прошёл проверку —
деплой ОСТАНОВЛЕН», хотя дамп был рабочий: `pg_dump` выполняется
ВНУТРИ контейнера `db`, а проверка `pg_restore --list` — на ХОСТЕ
VPS, где postgres-клиентов нет (весь PostgreSQL живёт в docker).
«command not found» (127) останавливал деплой, а stderr проверки
уходил в /dev/null — файл `pg-*.err` оставался пустым. Прод не
пострадал: миграции без бэкапа не стартовали (сработала защита
аудита №17 из v1.0.44).

## 2. Фиксы

| # | Проблема | Фикс |
|---|---|---|
| 1 | Проверка бэкапа требовала pg_restore на хосте | дамп И проверка `pg_restore --list` — одной цепочкой ВНУТРИ контейнера `db`; наружу стримится только проверенный дамп (`.part`) |
| 2 | Причина провала была невидима | при провале в лог CI печатается stderr шага бэкапа + `docker compose ps db` + `df` |
| 3 | Неготовность PostgreSQL молча пропускалась | жёсткий стоп, если PG не готов за 60с |
| 4 | Откат после провала мог даунгрейдить здоровый прод | `rollback.sh` без аргумента берёт `.deploy/current` (последнюю РАБОЧУЮ версию), а не «предпоследнюю строку history» |
| 5 | `pg-*.err` копились вечно | ротация 30 дней чистит и их |

## 3. Проверено

- `bash -n` deploy.sh / rollback.sh;
- **test-dbfix45** (`scripts/test-dbfix45.sh`) — 3/3 PASS: успех
  (полный дамп наружу) / падение pg_dump / падение проверки
  (кривой дамп не покидает «контейнер»);
- check-deps 0/0; unit **114/114**; код приложения не менялся —
  tsc/eslint/build на CI без изменений с v1.0.44.

## 4. Применить и задеплоить (PowerShell, папка вашего клона)

```bash
git fetch "$HOME\Downloads\scoresbox-2026-10-06-dbfix45.git-bundle" main
git log --oneline -1 FETCH_HEAD   # «SCORESBOX 2026-10-06 dbfix45: …»
git reset --hard FETCH_HEAD && git push --force origin main
git tag v1.0.45 && git push origin v1.0.45
```

После: health → "version":"1.0.45". **Миграций нет.** В логе деплоя
шаг будет называться «Бэкап БД (pg_dump + проверка, внутри
контейнера db)» — это ожидаемо. Если бэкап снова не пройдёт (уже
по другой причине) — лог покажет причину текстом, пришлите его.

**Важно:** бандл содержит ветку `main` — при клоне с нуля делайте
`git clone -b main <bundle>` (без `-b` чекаут будет пустым).

## 5. Архив поставок (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.45** (текущая) | `scoresbox-2026-10-06-dbfix45.git-bundle` | фикс деплоя: бэкап и проверка внутри контейнера db, диагностика провала в логе CI, rollback на current |
| v1.0.44 | `scoresbox-2026-10-05-fs44.git-bundle` | UI-фидбек (фильтр дат, протокол «И. Иванов», профили, колонки матча) + аудит №10–19 |
| v1.0.43 | `scoresbox-2026-10-05-cifix43.git-bundle` | фикс CI: VLM-скрипты снесены, check-deps честный, @types/qrcode в devDeps |
| v1.0.42 | `scoresbox-2026-10-05-sec42.git-bundle` | security: анти-BOLA скоупы, контент strictly SUPER_ADMIN, дашборд по ролям, media DELETE, Next 16.3.8 |
| v1.0.41 | `scoresbox-2026-10-05-fs41.git-bundle` | Протокол/Составы по futbol24 (колонки матча вернулись в v1.0.44) |
| v1.0.40 | `scoresbox-2026-10-01-fs40.git-bundle` | хронология FlashScore, имена без «№N», лого scoresb□x |
| v1.0.39 | `scoresbox-2026-09-30-fs39.git-bundle` | лента 52px/кнопка даты, аккордеон лиг, AD-INFEED |
| v1.0.38 | `scoresbox-2026-09-30-fs38.git-bundle` | страница матча по FlashScore (герой/таймлайн/табы) |
| v1.0.37 | `scoresbox-2026-09-29-minute37.git-bundle` | минута у счёта, Onest, лента по скетчу |
| v1.0.35–36 | `…-mobile35 / -brand36` | мобильный адаптив, фирстиль |
| v1.0.32–34 | `…-logic32 / -invite33 / -logic34` | скоуп лиги, приглашения, судейский корпус |
| v1.0.21–31 | `…-security … -lineup28 …` | RBAC, XSS/BOLA-фиксы, деплой-фиксы (см. старые README) |

**Прямые ссылки (панель /download/):**

- v1.0.45: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-06-dbfix45.git-bundle
- v1.0.44: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-fs44.git-bundle
- v1.0.43: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-cifix43.git-bundle
- v1.0.42: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-sec42.git-bundle
- v1.0.41: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-fs41.git-bundle
- v1.0.40: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-01-fs40.git-bundle
- v1.0.39: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-30-fs39.git-bundle
- v1.0.38: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-30-fs38.git-bundle

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

