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
# Если репозиторий пользователя пересоздавался (reinit) — update-бандл
# не приклеится («Repository lacks these prerequisite commits»).
# Этот файл содержит весь проект одним коммитом — работает всегда.
ONEFILE=download/scoresbox-onefile.git-bundle
rm -f "$ONEFILE"
ROOT="$(pwd)"
SQUASH=/tmp/sb-squash
rm -rf "$SQUASH"
git clone -q . "$SQUASH"
( cd "$SQUASH" \
  && git checkout -q --orphan tmp-main \
  && git commit -q -m "SCORESBOX v1.0.4 — полная сборка одним коммитом (самодостаточный бандл)" \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-onefile.git-bundle
git bundle verify "$ONEFILE" >/dev/null 2>&1 && echo "    onefile-бандл корректен"

echo "==> Гайды для чтения без git"
cp DEPLOY.md TUTORIAL.md ANALYTICS.md GUIDE-START-HERE.md RECOVERY.md download/
cp DEPLOY.md TUTORIAL.md ANALYTICS.md GUIDE-START-HERE.md RECOVERY.md public/
echo "    DEPLOY, TUTORIAL, ANALYTICS, GUIDE-START-HERE, RECOVERY -> download/ и public/"

echo "==> README для download/ (генерируется, чтобы переживать сбросы)"
cat > download/README.md <<'EOF'
# 📦 Что лежит в этой папке и как это применить

Свежая поставка проекта **SCORESBOX**.
Если вы здесь впервые и «ничего не понимаете» — откройте **GUIDE-START-HERE.md**:
там всё разжёвано по шагам (что скачать, какие команды вводить, что вы увидите).

| Файл | Размер | Что это | Когда нужен |
|---|---|---|---|
| `RECOVERY.md` | ~9 КБ | 🚑 гайд воссоздания проекта (для нового чата/агента) | ✅ если что-то потерялось |
| `GUIDE-START-HERE.md` | ~10 КБ | пошаговый гайд для новичка | читать первым |
| `scoresbox-onefile.git-bundle` | ~0,5 МБ | ✅ **ГЛАВНЫЙ ФАЙЛ**: весь проект одним коммитом, применяется в ЛЮБОМ репозитории | **основной путь** (работает даже после reinit) |
| `scoresbox-update.git-bundle` | ~0,2 МБ | добавка поверх старой истории (30e60c2) | только если история НЕ пересоздавалась |
| `scoresbox-full.git-bundle` | ~69 МБ | весь проект со всей историей коммитов | хотите сохранить историю |
| `scoresbox-source.zip` | ~0,5 МБ | просто файлы проекта без git | почитать код/гайды без git |
| `DEPLOY.md` | ~34 КБ | полная инструкция деплоя (А0–А7, Б1–Б13) | деплой на сервер |
| `TUTORIAL.md` | ~32 КБ | все команды и термины простыми словами | непонятна какая-то команда |
| `ANALYTICS.md` | ~36 КБ | как устроен проект изнутри | «хочу понять всё целиком» |

## Самый короткий путь (если репо уже есть на компьютере)

Три команды в папке вашего клона (подробно — в GUIDE-START-HERE.md).
Если была ошибка «Repository lacks these prerequisite commits» —
используйте `scoresbox-onefile.git-bundle` (он работает всегда):

```bash
cd путь/к/studious-tribble
git fetch ~/Downloads/scoresbox-onefile.git-bundle main
git reset --hard FETCH_HEAD && git push --force origin main
```

Если в скачанном файле фигурирует слово `scores21` — это загрузка со старой
страницы. Удалите её и скачайте заново из текущего чата.
EOF

cp download/README.md public/README.md

ls -lh "$BUNDLE" "$ZIP" "$UPDATE" 2>/dev/null || true
ls -lh download/ public/*.git-bundle public/*.zip 2>/dev/null | head -20
echo "==> Готово"
