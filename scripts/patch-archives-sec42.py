#!/usr/bin/env python3
# Патч make-archives.sh под поставку sec42 (v1.0.42, 05.10.2026):
# имя ONEFILE-бандла, сообщение сквош-коммита, README поставки.
import pathlib

p = pathlib.Path("/home/z/my-project/scripts/make-archives.sh")
text = p.read_text(encoding="utf-8")
lines = text.split("\n")

# 1) имя ONEFILE
for i, l in enumerate(lines):
    if l.startswith("ONEFILE=download/"):
        lines[i] = "ONEFILE=download/scoresbox-2026-10-05-sec42.git-bundle"
        break

# 2) cp в public/
for i, l in enumerate(lines):
    if l.startswith('cp "$ONEFILE" public/scoresbox-'):
        lines[i] = 'cp "$ONEFILE" public/scoresbox-2026-10-05-sec42.git-bundle'
        break

# 3) сообщение сквош-коммита (однострочный git commit -q -m "SCORESBOX ...")
squash_msg = (
    "SCORESBOX 2026-10-05 sec42: v1.0.42 — security-релиз по аудиту 05.10.2026: "
    "анти-BOLA для скоупов RBAC + Next.js 16.3.8. "
    "(1) NEXT.JS 16.3.5 -> 16.3.8 (security release 30.09) + eslint-config-next, lockfile. "
    "(2) GET /api/admin/matches/[id]: assertMatchInScope — скоуп-админ лиги не читает протокол чужой лиги по ID (BOLA/IDOR). "
    "(3) PATCH/DELETE /api/admin/registrations/[id]: assertSeasonInScope (Registration->Season->League). "
    "(4) КДК /api/admin/suspensions: create/update/delete — assertSeasonInScope (был только GET). "
    "(5) Контент сайта (banners/statblocks/formats + [id], merge GET) — строго SUPER_ADMIN, как в матрице ADMIN-GUIDE §1 и UI. "
    "(6) Персоны PATCH: assertPersonInScope (scope.ts, заявка->клуб/лига, свободные — ничьи) + roles/isReferee только LEAGUE_ADMIN/SUPER_ADMIN. "
    "(7) Дашборд: скоуп матчей по каждой роли (супер — сайт; оператор — все; скоуп-админ — своя лига; CLUB_ADMIN — свой клуб; REFEREE — свои матчи); recentAudit — только SUPER_ADMIN. "
    "(8) Media DELETE — только SUPER_ADMIN (URL публичны, модели владения нет). "
    "UI: карточка «Свежие изменения» — только супер-админу. "
    "Скрипты: scripts/smoke-sec42.{sh,ts} — 29 RBAC-проверок. "
    "Верификация: tsc 0; eslint 0; unit 111/111; build OK (16.3.8); SMOKE-SEC42 29 OK / 0 FAIL. "
    "Миграций НЕТ — deploy.sh пересоберёт контейнер, health -> v1.0.42."
)
for i, l in enumerate(lines):
    if 'git commit -q -m "SCORESBOX' in l:
        lines[i] = '  && git commit -q -m "' + squash_msg.replace('"', "'") + '" \\'
        break

# 4) README heredoc
start = next(i for i, l in enumerate(lines) if l.startswith("cat > download/README.md"))
end = next(i for i, l in enumerate(lines) if l == "EOF" and i > start)

new_readme = """# Поставка SCORESBOX — v1.0.42 «security: анти-BOLA + Next.js 16.3.8» (05.10.2026)

**Что это:** реакция на внешний аудит безопасности от 05.10.2026. Все
8 пунктов аналитика проверены по коду — все реальные, все исправлены
**без миграций БД**. UI, цвета и вёрстка не тронуты (директивы
scoresbox/futbol24 соблюдаются) — менялись только серверные гварды
ролей и одна карточка в админке.

## 1. Что закрыто

| # | Проблема (аудит) | Фикс |
|---|---|---|
| 1 | Next.js 16.3.5 ниже security-patch | **16.3.8** (release 30.09: 1 High + 5 Medium + 1 Low) + eslint-config-next, bun.lock |
| 2 | GET протокола чужого матча по ID | `assertMatchInScope` в GET `/api/admin/matches/[id]` |
| 3 | PATCH/DELETE чужой заявки скоуп-админом | `assertSeasonInScope` (Registration → Season → League) |
| 4 | КДК: create/update/delete без скоупа | `assertSeasonInScope` во всех трёх действиях |
| 5 | Контент сайта через API админу лиги | banners/statblocks/formats (+[id]) и merge GET — строго SUPER_ADMIN (как в UI и матрице ADMIN-GUIDE) |
| 6 | CLUB_ADMIN правит любых персон | `assertPersonInScope` (заявка → клуб/лига; свободные — ничьи) + roles/isReferee только лиге/суперу |
| 7 | Дашборд раскрывает весь сайт + аудит с email | скоуп матчей по каждой роли; recentAudit — только SUPER_ADMIN |
| 8 | Любой CLUB_ADMIN удаляет чужие медиа | DELETE Media — только SUPER_ADMIN (POST-загрузка без изменений) |

**Что НЕ трогали (по договорённостям):** модель ролей и матрицу
доступов (код подтянут ПОД матрицу ADMIN-GUIDE, а не наоборот);
вёрстку/цвета клиента; схему БД (модель владения Media — отдельное
ТЗ с миграцией, пока отложена); список персон для CLUB_ADMIN (те же
данные публичны на сайте, фильтр сломал бы поиск свободных агентов);
имена смоук-бандлов fs4x — fs42 никогда не существовал (вкладки
futbol24 живут в fs41), этот релиз называется **sec42**.

## 2. Проверено

- tsc 0; eslint 0; unit **111/111**; build OK на Next.js 16.3.8;
- **SMOKE-SEC42** (`scripts/smoke-sec42.sh` + `smoke-sec42.ts`):
  **29 OK / 0 FAIL** — скоуп-админ лиги A получает 403 на протокол/
  заявку/КДК лиги B (и 200 на свои), оператор — 403 на контент,
  CLUB_ADMIN — 403 на чужие персоны/медиа и roles, дашборды без
  журнала, судья — 403 на неназначенный матч; законные потоки
  (свои заявки/КДК/персоны, контент супером) — 200.

## 3. Применить и задеплоить (PowerShell, папка вашего клона)

```bash
git fetch "$HOME\\Downloads\\scoresbox-2026-10-05-sec42.git-bundle" main
git log --oneline -1 FETCH_HEAD   # «SCORES 2026-10-05 sec42: …»
git reset --hard FETCH_HEAD && git push --force origin main
git tag v1.0.42 && git push origin v1.0.42
```

После деплоя: `curl -s https://scoresbox.ru/api/health` →
`"version":"1.0.42"`. **Миграций нет** — deploy.sh просто пересоберёт
контейнер.

**Важно:** бандл содержит ветку `main` — при клоне с нуля делайте
`git clone -b main <bundle>` (без `-b` чекаут будет пустым).

## 4. Архив поставок (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.42** (текущая) | `scoresbox-2026-10-05-sec42.git-bundle` | security: анти-BOLA скоупы, контент strictly SUPER_ADMIN, дашборд по ролям, media DELETE, Next 16.3.8 |
| v1.0.41 | `scoresbox-2026-10-05-fs41.git-bundle` | Протокол/Составы по futbol24, матч без колонок + ряд из 3 реклам |
| v1.0.40 | `scoresbox-2026-10-01-fs40.git-bundle` | хронология FlashScore, имена без «№N», лого scoresb□x |
| v1.0.39 | `scoresbox-2026-09-30-fs39.git-bundle` | лента 52px/кнопка даты, аккордеон лиг, AD-INFEED |
| v1.0.38 | `scoresbox-2026-09-30-fs38.git-bundle` | страница матча по FlashScore (герой/таймлайн/табы) |
| v1.0.37 | `scoresbox-2026-09-29-minute37.git-bundle` | минута у счёта, Onest, лента по скетчу |
| v1.0.35–36 | `…-mobile35 / -brand36` | мобильный адаптив, фирстиль |
| v1.0.32–34 | `…-logic32 / -invite33 / -logic34` | скоуп лиги, приглашения, судейский корпус |
| v1.0.21–31 | `…-security … -lineup28 …` | RBAC, XSS/BOLA-фиксы, деплой-фиксы (см. старые README) |

**Прямые ссылки (панель /download/):**

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
Тонкость SMTP-мока: nodemailer кодирует письма (text — base64, html —
quoted-printable, тема — RFC 2047) — токен ссылки ищется только после
декодирования (см. parseMail в test-invites.ts)."""

lines[start + 1 : end] = new_readme.split("\n")
p.write_text("\n".join(lines), encoding="utf-8")
print("make-archives.sh обновлён: ONEFILE=sec42, сообщение сквоша, README v1.0.42")
