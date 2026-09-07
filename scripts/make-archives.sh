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
ONEFILE=download/scoresbox-2026-09-07-ghcr.git-bundle
rm -f "$ONEFILE"
# подчистить старые имена, чтобы в download/ не осталось путаницы
rm -f download/scoresbox-onefile.git-bundle public/scoresbox-onefile.git-bundle
ROOT="$(pwd)"
SQUASH=/tmp/sb-squash
rm -rf "$SQUASH"
git clone -q . "$SQUASH"
( cd "$SQUASH" \
  && git checkout -q --orphan tmp-main \
  && { git rm -rq --cached public/download 2>/dev/null || true; } \
  && rm -rf public/download \
  && git commit -q -m "SCORESBOX 2026-09-07: GITHUB_TOKEN получает packages:write (фикс «denied: installation not allowed to Create organization package» при push в GHCR) + все прежние фиксы (Docker exit 127, cd.yml, actions v7) — актуальная поставка solid-sniffle" \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-09-07-ghcr.git-bundle
git bundle verify "$ONEFILE" >/dev/null 2>&1 && echo "    onefile-бандл корректен: $ONEFILE"

echo "==> public/download/ — переживает сбросы песочницы (лежит в git)"
# Бандлы в корне public/ и папка download/ исключены из git и стираются
# при пересоздании песочницы — отсюда «404» на старых ссылках.
# Копия в public/download/ коммитится в git: сброс песочницы → git restore
# → ссылка /download/... снова работает без пересборки.
# ВАЖНО: из сквош-клона выше public/download удалён — иначе бандл
# вкладывался бы сам в себя при каждой пересборке.
mkdir -p public/download
rm -f public/download/scoresbox-*.git-bundle
cp "$ONEFILE" public/download/
cp download/README.md public/download/README.md
cp GUIDE-START-HERE.md public/download/GUIDE-START-HERE.md
git add -A public/download 2>/dev/null || true
echo "    public/download/scoresbox-2026-09-07-ghcr.git-bundle — для ссылки /download/"

echo "==> Гайды для чтения без git"
cp DEPLOY.md TUTORIAL.md ANALYTICS.md GUIDE-START-HERE.md RECOVERY.md SETTINGS.md download/
cp DEPLOY.md TUTORIAL.md ANALYTICS.md GUIDE-START-HERE.md RECOVERY.md SETTINGS.md public/
echo "    DEPLOY, TUTORIAL, ANALYTICS, GUIDE-START-HERE, RECOVERY -> download/ и public/"

echo "==> README для download/ (генерируется, чтобы переживать сбросы)"
cat > download/README.md <<'EOF'
# 📦 Что лежит в этой папке и как это применить

Свежая поставка проекта **SCORESBOX**.
Если вы здесь впервые и «ничего не понимаете» — откройте **GUIDE-START-HERE.md**:
там всё разжёвано по шагам (что скачать, какие команды вводить, что вы увидите).

## Как скачать главный файл

**Способ 1 — прямая ссылка (надёжная):** откройте в браузере

https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-07-ghcr.git-bundle

**Способ 2 — панель файлов чата** (скрепка / «All files in task»).
Если панель показывает старые файлы — она не обновляется, используйте способ 1.

| Файл | Размер | Что это | Когда нужен |
|---|---|---|---|
| `RECOVERY.md` | ~9 КБ | 🚑 гайд воссоздания проекта (для нового чата/агента) | ✅ если что-то потерялось |
| `SETTINGS.md` | ~8 КБ | ⚙️ что и где менять при смене репо/домена/сервера + happy path деплоя | менять настройки / «что будет при успехе» |
| `GUIDE-START-HERE.md` | ~10 КБ | пошаговый гайд для новичка | читать первым |
| `scoresbox-2026-09-07-ghcr.git-bundle` | ~0,5 МБ | ✅ **ГЛАВНЫЙ ФАЙЛ (актуален на 07.09.2026)**: весь проект одним коммитом + фикс GHCR-прав, применяется в ЛЮБОМ репозитории | **основной путь** (работает даже после reinit) |
| `scoresbox-update.git-bundle` | ~0,2 МБ | добавка поверх старой истории (30e60c2) | НЕ подходит для solid-sniffle (история пересоздана — берите главный файл) |
| `scoresbox-full.git-bundle` | ~69 МБ | весь проект со всей историей коммитов | хотите сохранить историю |
| `scoresbox-source.zip` | ~0,5 МБ | просто файлы проекта без git | почитать код/гайды без git |
| `DEPLOY.md` | ~34 КБ | полная инструкция деплоя (А0–А7, Б1–Б13) | деплой на сервер |
| `TUTORIAL.md` | ~32 КБ | все команды и термины простыми словами | непонятна какая-то команда |
| `ANALYTICS.md` | ~36 КБ | как устроен проект изнутри | «хочу понять всё целиком» |

## Самый короткий путь (если репо уже есть на компьютере)

Три команды в папке вашего клона (подробно — в GUIDE-START-HERE.md).
Если была ошибка «Repository lacks these prerequisite commits» —
используйте главный файл с датой в имени (он работает всегда):

```bash
cd D:\project\scoresbox_bundle        # ваша папка клона
git fetch "$HOME\Downloads\scoresbox-2026-09-07-ghcr.git-bundle" main
git log --oneline -1 FETCH_HEAD       # проверка: «SCORESBOX 2026-09-07», НЕ «v1.0.4» / «2026-09-04»
git reset --hard FETCH_HEAD && git push --force origin main
```

Если в скачанном файле фигурирует слово `scores21` — это загрузка со старой
страницы. Удалите её и скачайте заново из текущего чата.

Если имя скачанного файла не содержит дату `2026-09-07` — файл старый.
Если после `git log --oneline -1 FETCH_HEAD` видно сообщение с ДРУГОЙ датой
(2026-09-04, v1.0.4 и т.п.) — файл старый:
в актуальном сообщении первой строкой дата 2026-09-07.
Скачайте заново из текущего чата.
EOF

cp download/README.md public/README.md

ls -lh "$BUNDLE" "$ZIP" "$UPDATE" 2>/dev/null || true
ls -lh download/ public/*.git-bundle public/*.zip 2>/dev/null | head -20
echo "==> Готово"
