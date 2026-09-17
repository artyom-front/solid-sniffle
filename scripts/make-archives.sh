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
ONEFILE=download/scoresbox-2026-09-17-security.git-bundle
rm -f "$ONEFILE"
# подчистить старые имена, чтобы в download/ не осталось путаницы
# (+ старые dated-бандлы в корне public/ — чтобы старые ссылки не отдавали неактуальное)
rm -f download/scoresbox-onefile.git-bundle public/scoresbox-onefile.git-bundle
rm -f public/scoresbox-2026-*.git-bundle
ROOT="$(pwd)"
SQUASH=/tmp/sb-squash
rm -rf "$SQUASH"
git clone -q . "$SQUASH"
( cd "$SQUASH" \
  && git checkout -q --orphan tmp-main \
  && { git rm -rq --cached public/download 2>/dev/null || true; } \
  && rm -rf public/download \
  && git commit -q -m "SCORESBOX 2026-09-17 security: закрыты критичные уязвимости внешнего аудита — блокировка пользователя теперь мгновенно убивает его активные сессии (7-дневные cookie больше не переживают деактивацию); AUTH_SECRET обязателен в production без молчаливого fallback на публичный секрет (fail-fast на старте роутов + проверка в deploy.sh до касания контейнеров); CLUB_ADMIN заперт в своём клубе — не может править чужие клубы, создавать клубы, заводить команды в чужой клуб и выносить свои команды (BOLA); лимит загрузки nginx 2м→12м (backend 6/10 МБ наконец доезжает, раньше nginx резал 413); bun audit в CI без заглушки — critical-уязвимости реально ломают пайплайн; ошибки TypeScript ломают сборку (ignoreBuildErrors снят); db:push без --accept-data-loss по умолчанию — актуальная поставка (без изменений схемы БД)" \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-09-17-security.git-bundle
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
# README генерируется ЗДЕСЬ (до копирования — папка download/ могла быть
# стёрта сбросом песочницы, chicken-egg).
cat > download/README.md <<'EOF'
# Поставка SCORESBOX (security-релиз от 17.09.2026, v1.0.21)

**Что это:** закрытие критичных уязвимостей, найденных внешним аудитом.
Изменений схемы БД нет — деплой без миграций. Все правки — backend/infra.

## Что исправлено

### Безопасность (критичное)

1. **Блокировка пользователя убивает сессии.** Раньше 7-дневная cookie
   переживала деактивацию аккаунта SUPER_ADMIN-ом. Теперь любой запрос
   заблокированного пользователя получает 401 сразу.
2. **AUTH_SECRET обязателен в production.** Раньше при отсутствии
   переменной сайт молча подписывал сессии секретом из открытого
   репозитория (подделка cookie). Теперь: отказ на старте роутов +
   проверка в deploy.sh ДО бэкапа/миграций/контейнеров.
3. **CLUB_ADMIN заперт в своём клубе (BOLA):**
   - не может редактировать чужие клубы (было: любой id);
   - не может создавать новые клубы (только уровень лиги);
   - не может создать команду в чужом клубе (clubId форсируется);
   - не может перенести свою команду в другой клуб / отвязать от клуба.
4. **Лимит загрузки файлов nginx 2 МБ → 12 МБ.** Backend принимает
   фото до 6 МБ и PDF до 10 МБ, но nginx первым резал всё больше 2 МБ
   ошибкой 413 — заявленные лимиты фактически не работали.

### Качество поставки

5. **bun audit в CI без заглушки** — critical-уязвимости зависимостей
   теперь реально проваливают пайплайн (раньше `|| echo` превращал
   любую ошибку в успех).
6. **Ошибки TypeScript ломают сборку** (ignoreBuildErrors снят) —
   сломанные типы больше не едут в Docker и прод.
7. **db:push без --accept-data-loss** — опасный флаг вынесен в
   отдельную команду `db:push:destructive`.

## ⚠️ Перед деплоем v1.0.21 — 2 обязательных шага на сервере

**Шаг 1. Проверить AUTH_SECRET в /opt/scoresbox/.env:**

```bash
grep -c '^AUTH_SECRET=' /opt/scoresbox/.env  # должно вывести 1
```

Если строки нет — деплой прервётся с понятной ошибкой (это защита).
Добавьте: `AUTH_SECRET=<openssl rand -hex 32>`.
Рекомендация: даже если секрет есть — перевыпустите его
(`openssl rand -hex 32`): все текущие сессии слетят, все войдут заново.

**Шаг 2. Поднять лимит nginx (CD его сам не обновляет):**

```bash
sudo sed -i 's/client_max_body_size 2m/client_max_body_size 12m/' \
  /etc/nginx/sites-available/scoresbox
sudo nginx -t && sudo systemctl reload nginx
```

## Ожидаемо красный CI до Этапа 1

`bun audit` теперь честный: в зависимостях есть 3 critical-уязвимости
(2×Next.js RCE — сам фреймворк 16.1.3, 1×next-auth — мёртвая
зависимость). Job audit будет красным, пока не обновим Next.js до
16.3.x (Этап 1 плана рефакторинга). Это не поломка — это сигнализация.
CD от тега работает независимо (это отдельный пункт аудита — Этап 3).

## Скачать

**Бандл (главный файл):**

https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-security.git-bundle

**Отдельные файлы:**

- https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/DEPLOY-PLAYBOOK.md
- https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/DEPLOY.md
- https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/README.md

| Файл | Что это |
|---|---|
| `scoresbox-2026-09-17-security.git-bundle` | ГЛАВНЫЙ ФАЙЛ: весь проект одним коммитом, работает в ЛЮБОМ репозитории |
| `DEPLOY-PLAYBOOK.md` | playbook деплоя для другого проекта |
| `DEPLOY.md` | ops-гайд этого проекта: релизы, домен, мониторинг, откат |
| `README.md` | что за проект, стек, структура, локальный запуск |

## Применить (PowerShell, папка вашего клона)

```bash
cd D:\project\scoresbox_bundle
git fetch "$HOME\Downloads\scoresbox-2026-09-17-security.git-bundle" main
git log --oneline -1 FETCH_HEAD   # проверка: «SCORESBOX 2026-09-17 security: ...»
git reset --hard FETCH_HEAD && git push --force origin main
```

## Проверка актуальности

- В имени файла: `2026-09-17-security`. Другое слово (ads/protocol/
  entities/…) или дата старше — файл старый, скачайте по ссылке выше.
- В сообщении коммита (`git log --oneline -1 FETCH_HEAD`): первая
  строка начинается с `SCORESBOX 2026-09-17 security:`.

После push: тег **v1.0.21** задеплоит изменения (схема БД не меняется).

## Как проверить после деплоя

1. Войдите в админку под клубным администратором → раздел «Команды»:
   создание команды доступно, но она всегда попадает в ваш клуб.
2. (если есть второй клуб) Попытка правки чужого клуба/команды — 403.
3. SUPER_ADMIN → «Пользователи» → заблокируйте тестовый аккаунт,
   открытый в другом браузере: сессия умрёт сразу, вход запретится.
4. Загрузите фото 3–5 МБ (админка → персоны/клубы): больше нет 413.
EOF

# копия поставки в git (переживает сбросы песочницы)
mkdir -p public/download
rm -f public/download/scoresbox-*.git-bundle
cp "$ONEFILE" public/download/
cp download/README.md public/download/README.md
git add -A public/download 2>/dev/null || true
echo "    public/download/scoresbox-2026-09-17-ads.git-bundle — для ссылки /download/"

ls -lh "$BUNDLE" "$ZIP" "$UPDATE" 2>/dev/null || true
ls -lh download/ public/*.git-bundle public/*.zip 2>/dev/null | head -20
echo "==> Готово"
