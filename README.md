# SCORESBOX

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
