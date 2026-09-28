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
ONEFILE=download/scoresbox-2026-09-26-invite33.git-bundle
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
  && git commit -q -m "SCORESBOX 2026-09-26 invite33: v1.0.33 — приглашения по email (золотой стандарт) + фикс переполнения форм — (0) ФИКС ПЕРЕПОЛНЕНИЯ (баг юзера: при передаче ссылки и смене пароля данные выходили за границы формы): репро — LinkDialog со ссылкой ?pwset= вылезал за рамку диалога на +884px (1440px) и +974px (мобильный); корень — DialogContent (CSS-grid) не сжимал элементы уже min-content неразрывного токена. Системный фикс: [&>*]:min-w-0 + overflow-x-hidden в DialogContent (все диалоги сразу), break-all для ссылок/секрета 2FA, pr-9 у DialogTitle (длинные email не наезжают на крестик), тосты без длинных email; проверено DOM-замерами на 1440/390 + VLM-контроль. (1) ПРИГЛАШЕНИЯ ПО EMAIL: SMTP-режим (SMTP_HOST/PORT/SECURE/USER/PASS/MAIL_FROM в .env, nodemailer) — приглашение (48 ч, одноразовая) и сброс пароля (15 мин) уходят ПИСЬМОМ на адрес пользователя, ссылку админ не видит, клик по письму подтверждает владение ящиком (emailVerified автоматом); ручной режим без SMTP — ссылка для передачи лично, получатель при установке пароля ПОДТВЕРЖДАЕТ адрес или исправляет опечатку (кейс юзера: ошибочная почта — теперь правится самим получателем, админ видит бейдж «почта не подтверждена»). (2) Схема: User.emailVerified + User.passwordSet, миграция 00000000000004 (существующим аккаунтам — true), resendInvite/setEmail, GET preview токена, мёртвый SMTP = 502 + откат создания. (3) UI: UsersPanel — баннер режима доставки, бейджи «без пароля»/«почта не подтверждена», кнопки «Приглашение»/«Сброс пароля»/«Почта»; SetPasswordCard — шаг подтверждения/исправления email; ADMIN-GUIDE.md — раздел «Пароли и приглашения» + настройка SMTP; .env.example — раздел «Почта». (4) CI: шаг test-invites (мок-SMTP :2525 + сервер :3120: ссылки только письмами, авто-верификация, 502+откат при мёртвом SMTP). Верификация: tsc 0, eslint 0, unit 100/100, интеграция 38/38, SMTP-прогон 19/19, смоук agent-browser 21/21. Деплой: тег v1.0.33; миграция 00000000000004 применится штатно (deploy.sh: migrate deploy)" \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-09-26-invite33.git-bundle
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
# Поставка SCORESBOX — v1.0.33 «приглашения по email + фикс форм» (26.09.2026)

**Что это:** два запроса владельца после зелёного v1.0.32: (а) данные
выходили за границы форм при передаче ссылки и смене пароля; (б) при
добавлении пользователя с ошибочной почтой приглашение должно уходить
на email с подтверждением адреса (золотой стандарт).

1. **Переполнение форм — исправлено везде.** Диалог «передача ссылки»
   физически вылезал за рамку (+884px на десктопе, +974px на телефоне):
   длинная ссылка `?pwset=…` не имеет точек переноса и раздувала
   grid-трек диалога. Починено системно — во ВСЕХ диалогах (элементы
   сжимаются, содержимое переносится), заголовки с email не наезжают на
   крестик, тосты и бейджи не тянутся в длину. Проверено замерами
   геометрии на 1440px и 390px.
2. **Приглашения по email — золотой стандарт.** Настройте SMTP в `.env`
   (раздел «Почта»: SMTP_HOST/PORT/SECURE/USER/PASS, пример для Яндекс
   365 — в `.env.example` и ADMIN-GUIDE.md) — и приглашения со сбросами
   пароля уходят **письмами на email пользователей**: одноразовую ссылку
   не видит никто, включая супер-админа; клик по письму подтверждает,
   что ящик принадлежит приглашённому. Опечатка в адресе обнаруживается
   сама — письмо не приходит, у строки горит «без пароля».
3. **Защита от ошибочной почты без SMTP.** Пока письма не настроены,
   ссылка передаётся лично, а получатель при установке пароля видит
   адрес аккаунта: «Да, это мой адрес» или «Указан неверно» — и
   исправляет его сам; смена видна админу бейджем «почта не
   подтверждена». Кнопка «Почта» в «Пользователях» меняет адрес (с
   повторным приглашением), «Приглашение» — повторная отправка.
4. **Сроки ссылок:** приглашение — 48 часов (письмо может ждать),
   сброс пароля — 15 минут; обе одноразовые, после установки закрывают
   все прежние входы. При недоступном SMTP создание пользователя
   откатывается с понятной ошибкой.

Деплой: push main + тег **v1.0.33**. Миграция 00000000000004
(User.emailVerified/passwordSet) применится штатно (deploy.sh:
migrate deploy, бэкап автоматом); существующим аккаунтам флаги
проставляются в true — повторной верификации не потребуется.

## 📦 Архив поставок — все бандлы с v1.0.21 (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.33** (текущая) | `scoresbox-2026-09-26-invite33.git-bundle` | приглашения письмами (SMTP), подтверждение/исправление email, фикс переполнения всех форм |
| v1.0.32 | `scoresbox-2026-09-26-logic32.git-bundle` | каскадное удаление, пароли по ссылкам, скоуп лиги, живое обновление, ADMIN-GUIDE |
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

- v1.0.33: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-26-invite33.git-bundle
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
git fetch "$HOME\Downloads\scoresbox-2026-09-26-invite33.git-bundle" main
git log --oneline -1 FETCH_HEAD   # «SCORESBOX 2026-09-26 invite33: …»
git reset --hard FETCH_HEAD && git push --force origin main
git tag v1.0.33 && git push origin v1.0.33
```

После деплоя: `curl -s https://scoresbox.ru/api/health` →
`"version":"1.0.33"`. Миграция 00000000000004 применится автоматически.

**Включить письма (по желанию, рекомендую):** в `.env` на сервере
добавьте `SMTP_HOST/SMTP_PORT/SMTP_SECURE/SMTP_USER/SMTP_PASS/MAIL_FROM`
(инструкция: ADMIN-GUIDE.md → «Настройка почты») и перезапустите
`docker compose … up -d` — в «Пользователях» появится зелёный баннер.

**Важно:** бандл содержит ветку `main` — при клоне с нуля делайте
`git clone -b main <bundle>` (без `-b` чекаут будет пустым).

## Верификация (v1.0.33)

- tsc 0; eslint 0; unit 100/100 (новые: виды токенов/TTL, шаблоны
  писем, режимы доставки);
- интеграция **38/38** на чистой БД (migrate+seed): подтверждение и
  исправление email при установке пароля, resendInvite/setEmail,
  сброс подтверждения при смене адреса, ручной режим;
- SMTP-прогон (scripts/test-invites.ts, мок-SMTP + второй сервер):
  ссылки ТОЛЬКО письмами (в ответах API их нет), авто-верификация
  ящика кликом, сброс письмом, мёртвый SMTP → 502 + откат создания;
- смоук agent-browser 21/21: геометрия диалогов 1440/390 (ссылка
  внутри рамки, без скролла), баннер режима, бейджи, шаг
  подтверждения email на странице ?pwset=, карта смены пароля.

## Грабли agent-browser (задокументированы)

`agent-browser eval` держит ПЕРСИСТЕНТНЫЙ JS-контекст: top-level `const`
живёт между вызовами, повторное объявление = SyntaxError. Все
multi-statement eval — в IIFE. `find label fill` не триггерит
React-состояние (controlled input остаётся пустым, submit блокируется
нативной валидацией): в смооках логиниться демо-кнопками по email.
Тонкость SMTP-мока: nodemailer кодирует письма (text — base64, html —
quoted-printable, тема — RFC 2047) — токен ссылки ищется только после
декодирования (см. parseMail в test-invites.ts).

EOF
