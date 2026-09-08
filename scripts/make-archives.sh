#!/usr/bin/env bash
# ============================================================
# SCORESBOX · make-archives.sh — сборка доставочных архивов
# 1. scoresbox-full.git-bundle  — git bundle --all (полная история)
# 2. scoresbox-source.zip       — git archive HEAD (только файлы репо)
# 3. scoresbox-update.git-bundle — тонкий бандл поверх 30e60c2
# 4. гайды (DEPLOY/TUTORIAL/ANALYTICS/GUIDE-START-HERE) + README
# Всё кладётся в download/ (панель файлов чата) и public/ (превью-ссылка).
# Папка download/ в .gitignore — при сбросе песочницы стирается,
# поэтому скрипт создаёт её сам: bash scripts/make-archives.sh.
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
# (то, что пользователь уже запушнил в GitHub). Если у него репо есть —
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
ONEFILE=download/scoresbox-2026-09-08-ui1.git-bundle
rm -f "$ONEFILE"
# подчистить старые имена, чтобы в download/ не осталось путаницы
# (+ старые dated-бандлы в корне public/ — чтобы старые ссылки не отдавали неактуальное)
rm -f download/scoresbox-onefile.git-bundle public/scoresbox-onefile.git-bundle
rm -f download/scoresbox-2026-*.git-bundle public/scoresbox-2026-*.git-bundle
ROOT="$(pwd)"
SQUASH=/tmp/sb-squash
rm -rf "$SQUASH"
git clone -q . "$SQUASH"
( cd "$SQUASH" \
  && git checkout -q --orphan tmp-main \
  && { git rm -rq --cached public/download 2>/dev/null || true; } \
  && rm -rf public/download \
  && git commit -q -m "SCORESBOX 2026-09-08 ui1: админка «Пользователи» (выдача доступов по ролям, сброс паролей и 2FA) + глобальный тумблер TOTP-логина (Setting, /api/admin/settings) + лента: фильтры Live/Завершённые (тумблеры) и даты < Сегодня > (±10 дней) + баннеры: TOP в ленте по ширине данных, пустые слоты скрыты + футер без лишнего + favicon — актуальная поставка solid-sniffle (клиент, админка, деплой)" \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-09-08-ui1.git-bundle
git bundle verify "$ONEFILE" >/dev/null 2>&1 && echo "    onefile-бандл корректен: $ONEFILE"

echo "==> Гайды для чтения без git (только выжившие — дублей больше нет)"
cp DEPLOY.md README.md download/
echo "    DEPLOY.md, README.md -> download/"

echo "==> public/download/ — переживает сбросы песочницы (лежит в git)"
# Бандлы в корне public/ и папка download/ исключены из git и стираются
# при пересоздании песочницы — отсюда «404» на старых ссылках.
# Копия в public/download/ коммитится в git: сброс песочницы → git restore
# → ссылка /download/... снова работает без пересборки.
# ВАЖНО: из сквош-клона выше public/download удалён — иначе бандл
# вкладывался бы сам в себя при каждой пересборке.
# README генерируется ЗДЕСЬ (до копирования — папка download/ могла быть
# стёрта сбросом песочницы, chicken-egg).
cat > download/README.md <<'EOF'
# 📦 Поставка SCORESBOX (обновление от 08.09.2026 — ui1)

**Что это:** актуальная версия проекта одним git-бандлом. Внутри — весь код
предыдущей поставки (cleanup) плюс продуктовые правки ui1: раздел
«Пользователи» в админке, глобальный тумблер TOTP-логина, новые фильтры
ленты матчей, баннеры без пустых слотов, чистый футер, favicon.

## Скачать

**Прямая ссылка (надёжная):**

https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-08-ui1.git-bundle

**Способ 2 — панель файлов чата** (скрепка / «All files in task»).
Если панель показывает старые файлы — она не обновляется, качайте по ссылке.

| Файл | Размер | Что это |
|---|---|---|
| `scoresbox-2026-09-08-ui1.git-bundle` | ~0,6 МБ | ✅ **ГЛАВНЫЙ ФАЙЛ**: весь проект одним коммитом, работает в ЛЮБОМ репозитории |
| `DEPLOY.md` | ~35 КБ | ops-гайд: релизы, домен, мониторинг, откат, бэкапы, с нуля |
| `README.md` | ~2 КБ | что за проект, стек, структура, локальный запуск |
| `scoresbox-full.git-bundle` | ~69 МБ | весь проект со всей историей (не обязателен) |
| `scoresbox-source.zip` | ~0,5 МБ | просто файлы проекта без git |

## Применить (PowerShell, папка вашего клона)

```bash
cd D:\project\scoresbox_bundle
git fetch "$HOME\Downloads\scoresbox-2026-09-08-ui1.git-bundle" main
git log --oneline -1 FETCH_HEAD       # проверка: «SCORESBOX 2026-09-08 ui1...»
git reset --hard FETCH_HEAD && git push --force origin main
```

**Важно:** если бандл cleanup (v1.0.13) вы ещё НЕ применяли — этот ui1 включает
его целиком, применяйте только ui1. Если применяли — тоже применяйте ui1
поверх (бандл onefile самодостаточен).

## Проверка актуальности

- В имени файла: `2026-09-08-ui1`. Есть дата старее или другое слово
  (cleanup/composefix/execfix/ghcr/…) — файл старый, скачайте по ссылке выше.
- В сообщении коммита (`git log --oneline -1 FETCH_HEAD`): первая строка
  начинается с `SCORESBOX 2026-09-08 ui1:`.

После push: новый тег (`v1.0.13` — если ещё не ставили, иначе `v1.0.14`)
задеплоит изменения; при деплое `prisma db push` сам создаст таблицу
`Setting` для тумблера TOTP. Подробности — DEPLOY.md §I.1 и §I.7.
EOF

# копия поставки в git (переживает сбросы песочницы)
mkdir -p public/download
rm -f public/download/scoresbox-*.git-bundle
cp "$ONEFILE" public/download/
cp download/README.md public/download/README.md
git add -A public/download 2>/dev/null || true
echo "    public/download/scoresbox-2026-09-08-ui1.git-bundle — для ссылки /download/"

ls -lh "$BUNDLE" "$ZIP" "$UPDATE" 2>/dev/null || true
ls -lh download/ public/*.git-bundle public/*.zip 2>/dev/null | head -20
echo "==> Готово"
