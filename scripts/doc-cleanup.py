#!/usr/bin/env python3
# ============================================================
# SCORESBOX · doc-cleanup.py — чистка документации 08.09.2026
# 1. DEPLOY.md: новый заголовок + РАЗДЕЛ I (быстрые задачи) вместо
#    устаревшего ПУТЯ А; в РАЗДЕЛЕ II (бывший ПУТЬ Б) — замены
#    footballday.ru -> scoresbox.ru и ссылки на удалённые доки.
# 2. README.md (корень) — новая точка входа.
# 3. .env.example -> scoresbox.ru.
# 4. .gitignore: worklog.md теперь в git (переживает сбросы песочницы).
# 5. .dockerignore: public/download/ не попадает в прод-образ
#    (сейчас образ раздаёт исходники по /download/...).
# ============================================================
import re, sys, pathlib

ROOT = pathlib.Path("/home/z/my-project")

NEW_HEADER = """# 🏆 SCORESBOX · Ops-гайд: релизы, домен, мониторинг, восстановление

**Состояние: деплой зелёный — v1.0.12 работает в проде.**

- **РАЗДЕЛ I — быстрые задачи**: выпустить релиз, сменить домен, логи,
  мониторинг, откат, бэкапы, забрать обновление из чата. Это всё, что
  нужно в обычной жизни.
- **РАЗДЕЛ II — с нуля**: полная инструкция развёртывания на НОВОМ сервере
  (переезд или пересоздание). В обычной жизни не открывать.

> Что за проект, из чего состоит, как запустить локально — **README.md**
> рядом с этим файлом.

---
"""

SECTION_I = """# ⚡ РАЗДЕЛ I. Быстрые задачи (сайт уже работает)

## I.1 Выпустить новую версию

Изменения попадают в прод ТОЛЬКО тегом (обычный push гоняет лишь тесты CI):

```bash
git tag v1.0.13
git push origin v1.0.13
```

Дальше GitHub Actions делает всё сам: тесты → сборка образа → GHCR →
деплой на сервер (бэкап БД → миграции → перезапуск → health-check →
авто-откат при провале). Прогон: https://github.com/artyom-front/solid-sniffle/actions
(5–10 минут). Зелёный прогон = сайт обновлён.
Теги не переиспользовать: v1.0.6–v1.0.12 уже заняты.

## I.2 Сменить домен (целевой: scoresbox.ru)

Код при смене домена НЕ меняется — домен живёт в трёх местах: DNS, `.env`, nginx.

| # | Где | Что сделать | Как проверить |
|---|---|---|---|
| 1 | панель регистратора домена | A-записи `@` и `www` → IP сервера | `nslookup scoresbox.ru` показывает IP сервера |
| 2 | `/opt/scoresbox/.env` | `SITE_URL=https://scoresbox.ru` | `grep ^SITE_URL= .env` |
| 3 | сервер | перезапустить приложение с новым env: `docker compose -f deploy/docker-compose.prod.yml up -d app` | `… ps app` → `Up (healthy)` |
| 4 | сервер | `sudo ./scripts/setup-nginx.sh scoresbox.ru` | вывод «nginx готов» |
| 5 | сервер | `sudo certbot --nginx -d scoresbox.ru -d www.scoresbox.ru` | `curl -I https://scoresbox.ru` → `200` |
| 6 | GitHub → Settings → Secrets → Actions | `DEPLOY_PUBLIC_URL=https://scoresbox.ru` | следующий деплой зелёный |

DNS обновляется до 24 часов (обычно 1–3 часа). SSL-сертификат certbot
продлевает сам (задача в cron/systemd — ставится вместе с certbot).

## I.3 Мониторинг: как понять, что сайт жив

Четыре уровня — три уже работают, четвёртый настроить один раз:

1. **Контейнеры (уже работает).** `restart: unless-stopped`: если процесс
   приложения упадёт — Docker поднимет его сам. Healthcheck
   (`/api/health`, БД+версия) отражает состояние в `docker ps`.
2. **Каждый деплой (уже работает).** CD завершается внешним health-check
   (`DEPLOY_PUBLIC_URL`); при провале — авто-откат и красный прогон.
   Включите письма о падениях: на странице репозитория кнопка **Watch →
   Custom → только Actions**.
3. **Внешний пинг (настроить, 10 минут, бесплатно).** UptimeRobot или
   Better Stack Free: проверять `https://scoresbox.ru` и
   `https://scoresbox.ru/api/health` каждые 5 минут, алерты на почту или
   Telegram. Единственный способ узнать о падении, не заходя на сайт.
4. **Регулярный осмотр (1–2 минуты).** Раз в день/неделю на сервере:
   `bash scripts/status.sh` — контейнеры, health, версия, диск, бэкапы.

«Данные не обновляются» — это почти никогда не техчасть: расписание и
события матчей вносятся в админке (/admin → матч → протокол). Если LIVE
не двигается — проверьте, что события реально введены.

## I.4 Логи: где что смотреть

| Что смотрим | Команда на сервере |
|---|---|
| приложение | `docker logs scoresbox-app --tail 100` (`-f` — следить вживую) |
| PostgreSQL | `docker logs scoresbox-db --tail 50` |
| nginx | `sudo tail -50 /var/log/nginx/error.log` |
| версия / история деплоев | `cat /opt/scoresbox/.deploy/current` и `cat /opt/scoresbox/.deploy/history` |
| место на диске | `df -h /` (образы Docker чистит каждый деплой сам) |

Логи контейнеров ротируются (json-file, 10 МБ × 3 файла) — диск не забьют.

## I.5 Откат на прошлую версию

```bash
cd /opt/scoresbox
bash scripts/rollback.sh            # на предпоследний рабочий тег
bash scripts/rollback.sh 1.0.11     # или на конкретную версию
```

При провале деплоя откат выполняется автоматически (job Rollback в Actions).

## I.6 Бэкапы

- **Автоматически перед каждым деплоем**: `backups/pg-<дата>.dump`,
  хранение 30 дней, старые чистятся сами. Список: `ls -lh backups/`.
- **Вручную в любой момент**: `bash scripts/backup-db.sh`.
- **Рекомендация на первую неделю**: раз в 5–7 дней скачивать свежий
  `.dump` на компьютер (offsite-копия) — сервер может быть утрачен целиком.

## I.7 Забрать обновление кода из чата (бандл)

Ассистент собирает бандл вида `scoresbox-<дата>-<имя>.git-bundle` и даёт
прямую ссылку. Применение (PowerShell, папка клона):

```powershell
git fetch "$HOME\Downloads\scoresbox-<дата>-<имя>.git-bundle" main
git log --oneline -1 FETCH_HEAD   # дата в сообщении = дата в имени файла
git reset --hard FETCH_HEAD
git push --force origin main
git tag v1.0.13 ; git push origin v1.0.13
```

---

"""

NEW_README = """# SCORESBOX

Портал футбольной статистики: календарь и LIVE-матчи, турнирные таблицы,
профили команд, игроков, судей и стадионов + админ-панель (CRUD, протоколы
матчей, дисциплины, аудит, 2FA по TOTP).

- **Прод:** https://scoresbox.ru
- **Релизы:** тег `v*` → GitHub Actions → образ в GHCR → деплой на VPS.
- **Эксплуатация** (домен, мониторинг, логи, откат, бэкапы): **DEPLOY.md**.

## Стек

Next.js 16 (App Router, standalone-выход) + Bun · Prisma + PostgreSQL 16 ·
Tailwind CSS 4 + shadcn/ui · Docker (multi-stage) · GitHub Actions CI/CD ·
GHCR · nginx + certbot.

## Структура

```
src/app/(site)/     публичный портал: лига, матч, команда, игрок, стадион
src/app/admin/      админ-панель (вход: ADMIN_EMAIL / ADMIN_PASSWORD + 2FA)
src/app/api/        public/* — данные для сайта; admin/* — CRUD, auth, TOTP, аудит
src/lib/engine/     таблицы, расписание, дисциплина, LIVE-сигналы
src/lib/services/   выборки для страниц
prisma/             схема БД, seed, bootstrap админа
deploy/             docker-compose.prod.yml (db+app), nginx.conf
scripts/            deploy / rollback / status / backup-db / setup-nginx
```

## Локальная разработка

```bash
bun install
docker compose up -d db                       # PostgreSQL для разработки
cp .env.example .env                          # и заполнить значения
bunx prisma db push                           # создать схему
bun dev                                        # http://localhost:3000
```

Админка: /admin (креды из .env, при первом входе включите 2FA).
"""


def patch_deploy():
    p = ROOT / "DEPLOY.md"
    lines = p.read_text(encoding="utf-8").splitlines(keepends=True)
    idx_pa = next(i for i, l in enumerate(lines) if l.startswith("# 🚀 ПУТЬ А"))
    idx_pb = next(i for i, l in enumerate(lines) if l.startswith("# 🚀 ПУТЬ Б"))
    rest = "".join(lines[idx_pb:])
    rest = rest.replace(
        "# 🚀 ПУТЬ Б — начать с нуля (полный, ~60–75 минут)",
        "# 🚀 РАЗДЕЛ II. С нуля (полный, ~60–75 минут — только для нового сервера)",
    )
    rest = rest.replace("footballday.ru", "scoresbox.ru")
    rest = rest.replace("footballday", "scoresbox")
    rest = rest.replace("DEPLOY.md, ANALYTICS.md, Dockerfile", "DEPLOY.md, Dockerfile, README.md")
    rest = rest.replace(" Подробнее — TUTORIAL.md, раздел 5.", "")
    rest = rest.replace(
        "Дальше — укрепление из ANALYTICS.md (P0: offsite-бэкап, мониторинг)",
        "Дальше — укрепление: offsite-бэкап и мониторинг (разделы I.3 и I.6 выше)",
    )
    rest = rest.replace(
        "Offsite-бэкапы и мониторинг → ANALYTICS.md, P0 (сделать в первую неделю)",
        "Offsite-бэкапы и мониторинг — разделы I.3 и I.6 (сделать в первую неделю)",
    )
    rest = rest.replace("Глубокий разбор — **ANALYTICS.md**.", "Как устроен проект — **README.md**.")
    new = NEW_HEADER + "\n" + SECTION_I + rest
    p.write_text(new, encoding="utf-8")
    # контроль: не осталось ли ссылок на удалённые доки / ПУТЬ А
    leftovers = [
        w
        for w in ("ПУТЬ А", "TUTORIAL", "ANALYTICS", "SETTINGS.md", "RECOVERY", "GUIDE-START", "footballday")
        if w in new
    ]
    print("DEPLOY.md: переписан;", "остатки: " + str(leftovers) if leftovers else "мусора нет")


def main():
    patch_deploy()
    (ROOT / "README.md").write_text(NEW_README, encoding="utf-8")
    print("README.md: создан")
    ex = ROOT / ".env.example"
    ex.write_text(ex.read_text(encoding="utf-8").replace("footballday.ru", "scoresbox.ru"), encoding="utf-8")
    print(".env.example: scoresbox.ru")
    gi = ROOT / ".gitignore"
    gi.write_text(
        "".join(l for l in gi.read_text(encoding="utf-8").splitlines(keepends=True) if l.strip() != "/worklog.md"),
        encoding="utf-8",
    )
    print(".gitignore: worklog.md больше не игнорируется")
    di = ROOT / ".dockerignore"
    di.write_text(
        di.read_text(encoding="utf-8")
        + "\n# исходники не раздаются прод-сайтом\npublic/download\npublic/*.git-bundle\n",
        encoding="utf-8",
    )
    print(".dockerignore: public/download исключён из образа")


if __name__ == "__main__":
    main()
