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
ONEFILE=download/scoresbox-2026-09-20-stage3.git-bundle
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
  && git commit -q -m "SCORESBOX 2026-09-20 stage3: Этап 3 плана рефакторинга (гигиена) — v1.0.25, схема БД НЕ менялась (деплой стандартный тегом v1.0.25, миграций и ручных шагов нет): (1) вычищены МЁРТВЫЕ зависимости — 46 пакетов: zod, date-fns, @hookform/resolvers, react-hook-form, next-themes, sonner, recharts (вместе с ним ушла рантайм-цепочка recharts→lodash из аудита), embla, react-day-picker, vaul, framer-motion, next-intl, react-markdown, react-syntax-highlighter, @tanstack/react-query и react-table, @dnd-kit×3, @mdxeditor, @reactuses, zustand, uuid, z-ai-web-dev-sdk и 22 неиспользуемых radix-пакета; остались только реально импортируемые 21 деп — дерево зависимостей сжалось с 67 до 21, bun audit: 52 → 40 уязвимостей (все в dev/CLI-цепочках, рантайм-цепочка чиста), 0 critical; (2) удалены 33 неиспользуемых shadcn ui-компонента (accordion…tooltip, включая form/sonner/sidebar/chart) — карта перекрёстных импортов проверена, оставшиеся 15 никто из удалённых не использует; (3) вычищены хвосты старого домена footballday.ru: BRAND.domain в brand.ts (потенциальный будущий баг — константа ждала использования со старым значением), справочный nginx.conf (server_name), setup-nginx.sh, pdf-cover.html, make-analytics-pdf.py, seo.tsx — домен везде scoresbox.ru; (4) ESLint доведён до ПОЛНОГО нуля (0 ошибок, 0 предупреждений): убран неиспользуемый eslint-disable в timeline.test.ts, легитимный фолбэк location.assign в HashRedirect задокументирован disable-комментарием (эффект чайлда срабатывает раньше эффекта родителя, где bindRouter); (5) CD-зависимость от CI развязана ФИЗИЧЕСКИ: в build-джоб cd.yml добавлен гейт — тег больше не может собрать образ, пока CI workflow на том же SHA не завершился success (поллинг actions/runs по head_sha с фильтром по имени CI, до 15 минут; красный CI или таймаут = поставка отменена; таймаут джоба 20→45 мин; permissions +actions:read); (6) make-archives.sh: политика хранения бандлов — ВСЕ versioned-бандлы с v1.0.21 живут в панели вечно. Верификация: tsc 0, eslint 0/0 (было 2 warning), 90/90 unit, 24/24 integration (36 инвариантов PRD + 2FA + SSR/SEO + хотфикс-сьют v1.0.24), смоуки 24+21+8, SSR главная/админка/матч 200 + JSON-LD, /api/health = версия образа" \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-09-20-stage3.git-bundle
git bundle verify "$ONEFILE" >/dev/null 2>&1 && echo "    onefile-бандл корректен: $ONEFILE"

echo "==> Гайды для чтения без git (только выжившие — дублей больше нет)"
cp DEPLOY.md README.md DEPLOY-PLAYBOOK.md download/
echo "    DEPLOY.md, README.md, DEPLOY-PLAYBOOK.md -> download/"

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
# Поставка SCORESBOX — Этап 3 «гигиена» (20.09.2026, v1.0.25)

**Что это:** Этап 3 плана рефакторинга — гигиена кодовой базы после
хотфикса v1.0.24: мёртвые зависимости, неиспользуемые ui-компоненты,
хвосты старого домена, нулевой ESLint, физический CD-гейт «CI зелёный
перед сборкой образа». Схема БД **не менялась** — деплой стандартный
тегом **v1.0.25**, миграций и ручных шагов нет.

## 📦 Архив поставок — все бандлы с v1.0.21 (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.25** (текущая) | `scoresbox-2026-09-20-stage3.git-bundle` | Этап 3: −46 мёртвых депов, −33 ui-компонента, чистка footballday.ru, ESLint 0/0, CD-гейт CI |
| v1.0.24 | `scoresbox-2026-09-20-hotfix24.git-bundle` | хотфикс аудита: BOLA-импорт, XSS-баннеры, атомарность мутаций, media 404 |
| v1.0.23 | `scoresbox-2026-09-17-stage2fix.git-bundle` | Этап 2: prisma migrate, история заявок (partial unique), P2002→409, 20 индексов, sessionVersion, APP_VERSION + пин bun 1.3.14 в CI |
| v1.0.22 | `scoresbox-2026-09-17-next35.git-bundle` | Этап 1: Next 15→16.3.5, sharp 0.35.4, next-auth удалён (2 RCE закрыты) |
| v1.0.21 | `scoresbox-2026-09-17-security.git-bundle` | security-этап: RBAC-скоупы клубов, CSRF, security-заголовки, 2FA (TOTP), брутфорс-лимит, isActive-блокировка сессий |

**Прямые ссылки (панель /download/, переживает сбросы песочницы):**

- v1.0.25: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-20-stage3.git-bundle
- v1.0.24: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-20-hotfix24.git-bundle
- v1.0.23: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-stage2fix.git-bundle
- v1.0.22: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-next35.git-bundle
- v1.0.21: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-security.git-bundle

## Что сделано в Этапе 3 (v1.0.25)

### 1. Вычищены 46 мёртвых зависимостей
Дерево зависимостей сжалось с 67 до 21 runtime-пакета: удалены
zod, date-fns, @hookform/resolvers, react-hook-form, next-themes,
sonner, **recharts** (вместе с ним ушла единственная рантайм-цепочка
уязвимостей из аудита — recharts→lodash), embla, react-day-picker,
vaul, framer-motion, next-intl, react-markdown, react-syntax-highlighter,
@tanstack/react-query и react-table, @dnd-kit×3, @mdxeditor,
zustand, uuid, z-ai-web-dev-sdk и 22 неиспользуемых radix-пакета.
`bun audit`: **52 → 40** уязвимостей, все оставшиеся — в dev/CLI-цепочках
(eslint, prisma CLI), рантайм-цепочка чиста, 0 critical.
Каждый деп проверялся grep'ом по реальным импортам перед удалением.

### 2. Удалены 33 неиспользуемых shadcn ui-компонента
accordion, alert, alert-dialog, aspect-ratio, avatar, breadcrumb,
calendar, carousel, chart, checkbox, collapsible, context-menu,
drawer, dropdown-menu, form, hover-card, menubar, navigation-menu,
pagination, popover, progress, radio-group, resizable, scroll-area,
separator, sidebar, skeleton, slider, sonner, table, toggle,
toggle-group, tooltip. Перед удалением построена карта перекрёстных
импортов внутри ui/ — ни один из 15 оставшихся компонентов
(button, dialog, select, tabs, toast, command, …) не ссылается на
удалённые. Меньше кода — меньше поверхности атаки и бандл.

### 3. Хвосты старого домена footballday.ru вычищены
Домен переехал на scoresbox.ru ещё в v1.0.13, но 7 мест держали
старое имя: `BRAND.domain` в brand.ts (константа не рендерилась, но
ждала первого использования со старым значением — мина замедленного
действия), справочный nginx.conf (server_name), setup-nginx.sh,
pdf-cover.html, make-analytics-pdf.py, комментарий seo.tsx. Теперь
везде scoresbox.ru.

### 4. ESLint — полный ноль
0 ошибок, 0 предупреждений (было 2 давних warning): убран
неиспользуемый eslint-disable в timeline.test.ts; легитимный фолбэк
`location.assign` в HashRedirect задокументирован disable-комментарием
(эффект чайлда срабатывает раньше эффекта родителя, где bindRouter —
до гидратации полный переход браузера единственный корректный путь).

### 5. CD больше не зависит от «человеческого порядка» пуша
Раньше CD верил, что тег ставится только после зелёного CI (неявное
соглашение). Теперь в build-джоб cd.yml — **физический гейт**: тег
не может собрать образ, пока CI-workflow на том же SHA не завершился
`success` (поллинг actions/runs по head_sha, до 15 минут; красный CI
или таймаут = поставка отменена с внятной ошибкой). Таймаут джоба
20→45 мин, permissions +actions:read. Ручные запуски (workflow_dispatch)
гейт не проходят — там своё явное подтверждение DEPLOY.

## Верификация (полная, на живом standalone + embedded-postgres)

- `tsc` 0 ошибок, `eslint` **0 ошибок / 0 предупреждений**;
- юнит: **90/90**;
- интеграция: **24/24** (+8 новых — по одному на каждый фикс:
  BOLA-импорт ×3, XSS-баннеры ×2, дедуп состава, двойной complete,
  media 404); 36 инвариантов PRD, полный 2FA-цикл, SSR/SEO,
  security-заголовки, CSRF — 0 fail;
- смоук-серия: stage22 **24/24**, sec21 **21/21**, media22 **8/8**;
- SSR: главная/админка/матч — 200, JSON-LD на месте;
- `/api/health` отдаёт версию образа.

## ⚠️ Деплой v1.0.25

Действия те же, что всегда: push + тег **v1.0.25**. Схема БД не
менялась — миграций нет, deploy.sh выполнит только сборку образа и
health-check. Новое: CD сам дождётся зелёного CI на том же коммите
(до 15 минут) — ставить тег сразу после push теперь безопасно.
После деплоя: сайт должен работать как прежде (изменения гигиенические);
`/api/health` → `"version":"1.0.25"`.

## Применить (PowerShell, папка вашего клона)

```bash
cd D:\project\scoresbox_bundle
git fetch "$HOME\Downloads\scoresbox-2026-09-20-stage3.git-bundle" main
git log --oneline -1 FETCH_HEAD   # проверка: «SCORESBOX 2026-09-20 stage3: …»
git reset --hard FETCH_HEAD && git push --force origin main
```

После push: тег **v1.0.25** задеплоит Этап 3.

## Проверка актуальности

- В имени файла: `2026-09-20-stage3`. Дата старше или другое
  слово (hotfix24/stage2fix/next35/security/…) — это архивная
  поставка из таблицы выше (каждая по-прежнему доступна по своей
  ссылке).
- В сообщении коммита (`git log --oneline -1 FETCH_HEAD`): первая
  строка начинается с `SCORESBOX 2026-09-20 stage3:`.

## Как проверить после деплоя

1. `curl -s https://scoresbox.ru/api/health` — `"version":"1.0.25"`,
   `"db":"up"`.
2. В Actions: деплой v1.0.25 начнётся с шага «CI-гейт» и дождётся
   зелёного CI (это новое ожидаемое поведение, не зависание).
3. Все страницы работают как прежде: изменения гигиенические,
   регресс закрыт полным прогоном (90 unit / 24 integration /
   смоуки 24+21+8).
EOF

# копия поставки в git (переживает сбросы песочницы)
cp download/README.md public/download/README.md
# ⛔ БЕЗ ЧИСТКИ: versioned-бандлы v1.0.21+ в public/download/ не трогаем
# (восстановлены из git-истории 20.09.2026 и должны жить в панели вечно)
cp -p public/download/scoresbox-2026-*.git-bundle download/ 2>/dev/null || true
git add -A public/download 2>/dev/null || true
echo "    public/download/: $(ls public/download/*.git-bundle 2>/dev/null | wc -l) бандла в панели (v1.0.21+)"

ls -lh "$BUNDLE" "$ZIP" "$UPDATE" 2>/dev/null || true
ls -lh download/*.git-bundle 2>/dev/null | head -10
echo "==> Готово"
