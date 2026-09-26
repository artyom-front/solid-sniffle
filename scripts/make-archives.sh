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
ONEFILE=download/scoresbox-2026-09-26-logic32.git-bundle
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
  && git commit -q -m "SCORESBOX 2026-09-26 logic32: логика админки v1.0.32 — удаление, пароли, роли/скоупы, живое обновление — (0) УДАЛЕНИЕ МАТЧА: полный каскад (был тупик 409 «сначала очистите протокол»): удаляются события/составы/бригада/оценки/файл протокола + дисциплинарные последствия (авто-баны КК, пересчёт ЖК по оставшимся матчам); мастер-данные (игроки/команды/судьи/стадионы/заявки) НЕ трогаются; таблица/бомбардиры/дисциплина считаются на лету — пересчёт автоматом. Кнопка удаления на строке + массовое без «пропущено»; диалоги со списками «удалится навсегда / останется». deleteMatchCascade — единая точка (транзакция). (1) ПАРОЛИ — золотой стандарт: смена требует текущий пароль (+код 2FA), sessionVersion++ убивает чужие сессии; супер-админ паролей НЕ видит: создание юзера и сброс = одноразовая ссылка /admin?pwset=... (15 минут, одноразовость через подпись версией сессий), юзер ставит пароль сам с автовходом. (2) РОЛИ: User.leagueId + миграция 00000000000003_league_scope: LEAGUE_ADMIN с привязкой = админ конкретной лиги (только её сезоны/матчи/протоколы/заявки/КДК, дашборд и колокол — только её матчи; товарищеские/контент/пользователи нельзя); контент сайта и users/merge/audit — только SUPER_ADMIN; ниже супер-админа — только свой профиль. (3) ЖИВОЕ ОБНОВЛЕНИЕ: опрос 30 с (видимая вкладка) без ремаунта черновиков; позиция в URL (section/league/season/match) — F5 не сбрасывает, deep-links работают. (4) Дашборд утилитарный: KPI кликабельны. (5) Оценка судьи скрыта из статистики (до введения системы оценок). (6) ADMIN-GUIDE.md — база знаний: роли, пароли, жизненный цикл, правила удаления, безопасность. Верификация: tsc 0, eslint 0, unit 90/90, интеграция 34/34 (новые: каскад, bulk, пароли, скоупы), смоук 19/19. Деплой: тег v1.0.32; с прод v1.0.28 применятся миграции 00000000000002 и 00000000000003 (штатный путь deploy.sh)" \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-09-26-logic32.git-bundle
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
# Поставка SCORESBOX — v1.0.32 «логика админки: удаление, пароли, роли» (26.09.2026)

**Что это:** большой релиз по списку владельца после зелёного деплоя v1.0.31:
интуитивное удаление, пароли по золотому стандарту, админы конкретной
лиги, живое обновление панели, утилитарный дашборд и база знаний.

1. **Удаление матча — каскад вместо тупика.** Раньше матч с протоколом
   не удалялся («пропущено с протоколом: 1», нужен был Reset, которого
   не найти) — теперь любая строка удаляется корзиной: уходят события,
   составы, бригада, оценки, файл протокола и дисциплинарные
   последствия; игроки, команды, судьи, стадионы и заявки остаются;
   таблица и статистика пересчитываются автоматически. Диалог прямо
   перечисляет, что будет удалено и что останется.
2. **Пароли — золотой стандарт.** Никто (включая супер-админа) не видит
   и не задаёт чужой пароль: создание пользователя и «сброс» = одноразовая
   ссылка `/admin?pwset=…` (15 минут, один раз), человек сам ставит пароль
   и сразу входит. Смена своего пароля требует текущий (+код 2FA при
   включённой); все чужие сессии аккаунта при этом закрываются.
3. **Админ конкретной лиги.** В «Пользователях» — привязка LEAGUE_ADMIN
   к лиге: такой админ видит и правит только её (сезоны, матчи, протоколы,
   заявки, КДК; дашборд и колокол — только её матчи). Контент сайта,
   пользователи и журнал — только супер-админ. Демо для проверки:
   liga2@ff21.ru / liga2123 (скоуп первой лиги).
4. **Живое обновление панели.** Данные обновляются каждые 30 секунд сами
   (черновики форм не теряются); F5 возвращает на то же место —
   раздел/лига/сезон/матч хранятся в URL, прямые ссылки работают.
5. **Дашборд — очередь работы:** KPI-карточки кликабельны, «Требуют
   внимания» ведёт прямо в протокол матча.
6. **Оценка судьи скрыта** из публичной статистики (до введения
   продуманной системы оценок судей/игроков; данные сохранены в БД).
7. **ADMIN-GUIDE.md** — база знаний для обучения сотрудников: матрица
   ролей, пароли, жизненный цикл турнира, правила удаления всех
   сущностей, безопасность, частые сценарии.

Деплой: push main + тег **v1.0.32**. С прод-уровня v1.0.28 применятся
миграции 00000000000002 (форматы/стат-карточки) и 00000000000003
(User.leagueId) — штатный путь deploy.sh, бэкап перед ними делается
автоматически.

## 📦 Архив поставок — все бандлы с v1.0.21 (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.32** (текущая) | `scoresbox-2026-09-26-logic32.git-bundle` | каскадное удаление, пароли по ссылкам, скоуп лиги, живое обновление, ADMIN-GUIDE |
| v1.0.31 | `scoresbox-2026-09-26-cifix31.git-bundle` | фикс CI: prisma generate в integration-job + build-скрипте |
| v1.0.30 ⛔ БИТЫЙ В CI | `scoresbox-2026-09-26-refactor30.git-bundle` | контент ок (ProtocolEditor разобран), но CI падал на сборке — не тегать |
| v1.0.29 ⛔ БИТЫЙ В CI | `scoresbox-2026-09-25-site29.git-bundle` | контент ок, но тест форматов падал в CI — не тегать |
| v1.0.28 | `scoresbox-2026-09-24-lineup28.git-bundle` | города, заявка «старт→№→запас→штаб», 3-колоночный лэйаут |
| v1.0.27 | `scoresbox-2026-09-24-deploytimeout.git-bundle` | фикс деплоя: таймаут джобы 10→30 мин |
| v1.0.26 | `scoresbox-2026-09-23-sonnerfix.git-bundle` | хотфикс сборки: sonner, check-deps |
| v1.0.25 ⛔ БИТВАЯ | `scoresbox-2026-09-20-stage3.git-bundle` | НЕ ПРИМЕНЯТЬ |
| v1.0.24 | `scoresbox-2026-09-20-hotfix24.git-bundle` | хотфикс аудита: BOLA, XSS, media 404 |
| v1.0.23 | `scoresbox-2026-09-17-stage2fix.git-bundle` | prisma migrate, 20 индексов, sessionVersion |
| v1.0.22 | `scoresbox-2026-09-17-next35.git-bundle` | Next 16.3.5, sharp 0.35.4 (2 RCE закрыты) |
| v1.0.21 | `scoresbox-2026-09-17-security.git-bundle` | RBAC-скоупы, CSRF, 2FA, брутфорс-лимит |

**Прямые ссылки (панель /download/):**

- v1.0.32: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-26-logic32.git-bundle
- v1.0.31: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-26-cifix31.git-bundle
- v1.0.30: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-26-refactor30.git-bundle
- v1.0.29: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-25-site29.git-bundle
- v1.0.28: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-24-lineup28.git-bundle
- v1.0.27: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-24-deploytimeout.git-bundle
- v1.0.26: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-23-sonnerfix.git-bundle
- v1.0.24: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-20-hotfix24.git-bundle
- v1.0.23: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-stage2fix.git-bundle
- v1.0.22: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-next35.git-bundle
- v1.0.21: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-security.git-bundle

## ⚠️ Применить и задеплоить (PowerShell, папка вашего клона)

```bash
git fetch "$HOME\Downloads\scoresbox-2026-09-26-logic32.git-bundle" main
git log --oneline -1 FETCH_HEAD   # «SCORESBOX 2026-09-26 logic32: …»
git reset --hard FETCH_HEAD && git push --force origin main
git tag v1.0.32 && git push origin v1.0.32
```

После деплоя: `curl -s https://scoresbox.ru/api/health` → `"version":"1.0.32"`.
Миграции 02 и 03 применятся автоматически, бэкап перед ними — штатно.

**Важно:** бандл содержит ветку `main` — при клоне с нуля делайте
`git clone -b main <bundle>` (без `-b` чекаут будет пустым).

## Верификация (v1.0.32)

- tsc 0; eslint 0; unit 90/90;
- интеграция **34/34** на чистой БД (migrate+seed): новые тесты —
  каскадное удаление матча с проверкой БД (мастер-данные живы),
  массовое удаление с протоколом, парольные потоки (одноразовость
  токена, смерть чужих сессий, сброс супер-админом), скоуп-админ
  (403 за границей лиги, только своя в списках);
- смоук agent-browser 19/19: скоуп-навигация liga2@, диалоги удаления
  с текстами каскада, создание пользователя без пароля (ссылка вместо
  поля), карта смены пароля, F5-позиция (section=matches).

## Грабли agent-browser (задокументированы)

`agent-browser eval` держит ПЕРСИСТЕНТНЫЙ JS-контекст: top-level `const`
живёт между вызовами, повторное объявление = SyntaxError. Все
multi-statement eval — в IIFE. `find label fill` не триггерит
React-состояние (controlled input остаётся пустым, submit блокируется
нативной валидацией): в смооках логиниться демо-кнопками по email.

EOF
