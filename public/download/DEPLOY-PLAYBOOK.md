# DEPLOY-PLAYBOOK — пошаговый деплой Next.js + Prisma + PostgreSQL на VPS

> Отдельный playbook, выжимка реального боевого опыта проекта ScoresBox:
> все шаги проверены в продакшене, а раздел «Грабли» — это ошибки,
> на которые мы реально наступили, с точными симптомами и фиксами.
> Стек: **Next.js 16 (standalone) + Prisma + PostgreSQL 16 + Docker + GitHub
> Actions + GHCR + VPS (Ubuntu) + nginx + certbot**. Раннер сборки — Bun
> (замените на node, если у вас Node).

**Как пользоваться:** замените в примерах `<project>` на имя вашего проекта,
`<user>/<repo>` — на ваш GitHub-репозиторий, `app.example.com` — на домен.
Всё остальное можно копировать как есть.

---

## 0. Архитектура поставки (что получим)

```
 git push tag v1.2.3
        │
        ▼
 GitHub Actions (cd.yml)
   ├─ build: docker buildx → образ → GHCR (теги: 1.2.3, sha, latest)
   ├─ deploy:
   │    ├─ scp: актуальные scripts/ + deploy/ → /opt/<project> (автосинк)
   │    ├─ ssh: docker login → bash scripts/deploy.sh 1.2.3
   │    │         (бэкап → prisma db push → up -d → health → bootstrap)
   │    └─ внешний health-check главной страницы (HTTP 200)
   └─ rollback: ручной job с approval (или автоматом при упавшем deploy)
        │
        ▼
 VPS /opt/<project>
   ├─ docker: [db: postgres:16] [app: ваш образ, 127.0.0.1:3000]
   ├─ nginx на хосте: 443 TLS → proxy_pass 127.0.0.1:3000
   ├─ .env (секреты, НЕ в git)  ├─ .deploy/current|history
   └─ backups/pg-*.dump (30 дней)
```

Почему так, а не «просто docker compose up»:

- **Сборка в CI, не на сервере** — VPS слабый, сборка Next.js его положит;
  образ тянется готовый из реестра.
- **Релиз = git-тег** — `git tag v1.2.3 && git push origin v1.2.3`, дальше всё
  само; между релизами на прод ничего не катится.
- **Автосинк серверных скриптов при каждом деплое** — на VPS никогда не
  останется устаревшего deploy.sh/compose (это реально стреляло, см. Грабли №3).
- **Откат за одну команду** — история деплоев на сервере + rollback-джоба.
- **Авто-откат при провале health-check** — кривой релиз не оставит прод лежать.

---

## 1. Что понадобится (чек-лист до старта)

| Что | Пример |
|---|---|
| VPS (Ubuntu 22.04+, 1 CPU / 1–2 ГБ хватает) | IP `203.0.113.10` |
| Домен + DNS A-запись на IP | `app.example.com → 203.0.113.10` |
| GitHub-репозиторий с проектом | `github.com/<user>/<repo>` |
| SSH-ключ для деплоя | отдельная пара, только для CI |
| Права владельца репо (GHCR) | packages:write |

---

## 2. Секреты в GitHub (Settings → Secrets and variables → Actions)

| Секрет | Значение |
|---|---|
| `DEPLOY_HOST` | IP сервера (`203.0.113.10`) |
| `DEPLOY_USER` | пользователь SSH на сервере (с docker-группой) |
| `DEPLOY_SSH_KEY` | приватный ключ (в одну строку, `-----BEGIN...` тоже) |
| `DEPLOY_PUBLIC_URL` | `https://app.example.com` — для внешнего health-check |

Плюс, если хотите аппрув перед продом: **Settings → Environments → New
environment → `production`** → Required reviewers. Тогда деплой ждёт нажатия
кнопки в Actions.

---

## 3. Файлы в репозитории

### 3.1. `Dockerfile` — multi-stage + standalone + полный node_modules

```dockerfile
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bunx prisma generate && bun run build

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HOME=/tmp

COPY --from=builder --chown=1001:1001 /app/.next/standalone ./
COPY --from=builder --chown=1001:1001 /app/.next/static ./.next/static
COPY --from=builder --chown=1001:1001 /app/public ./public
COPY --from=builder --chown=1001:1001 /app/prisma ./prisma
# ВАЖНО: node_modules ЦЕЛИКОМ — иначе `prisma db push` в рантайме упадёт
# с «Cannot find package 'effect'» (Грабли №4)
COPY --from=builder --chown=1001:1001 /app/node_modules ./node_modules

# Непривилегированный пользователь числовым uid (adduser в bun-образе нет —
# падает exit 127, Грабли №7)
USER 1001:1001
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "server.js"]
```

Для `next build` со standalone нужен в `next.config.ts`:
`output: "standalone"`.

**Обязательно** ручка здоровья в приложении — `src/app/api/health/route.ts`:
`return Response.json({ ok: true, version: process.env.APP_VERSION });`
На неё завязаны: HEALTHCHECK образа, deploy.sh, rollback.sh, внешний
health-check CI и мониторинг. Без неё авто-откат невозможен.

### 3.2. `.dockerignore` — безопасность образа

```
node_modules
.next
.env
.env.*
!.env.example
.git
.github
backups
.deploy
public/download
scripts/*.log
*.md
```

`public/download` и любые каталоги «для передачи файлов» — обязательно
исключить: иначе прод-образ начнёт раздавать их по URL (Грабли №6).
`.env` в образ попасть не должен никогда — он подаётся через compose.

### 3.3. `.env.example` (в git) и `.env` (только на сервере)

```env
POSTGRES_PASSWORD=CHANGE_ME_STRONG_PASSWORD   # openssl rand -hex 16
AUTH_SECRET=CHANGE_ME_RANDOM_HEX              # openssl rand -hex 32
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=CHANGE_ME_ADMIN_PASSWORD       # смените после первого входа
SITE_URL=https://app.example.com
```

`.env` лежит в корне `/opt/<project>` и **никогда не коммитится**
(`.gitignore`: `.env`).

### 3.4. `deploy/docker-compose.prod.yml`

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: <project>-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: <project>
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD обязателен — задайте в .env}
      POSTGRES_DB: <project>
    volumes:
      - <project>-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U <project> -d <project>"]
      interval: 5s
      timeout: 3s
      retries: 10
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

  app:
    image: ghcr.io/<user>/<repo>:${TAG:-latest}
    container_name: <project>-app
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    # ГЛАВНАЯ ГРАБЛЯ №2: путь env_file считается от КАТАЛОГА ЭТОГО ФАЙЛА
    # (deploy/), а не от корня проекта. .env лежит в корне → нужно ../.env,
    # иначе «env file not found» и деплой падает.
    env_file: ../.env
    environment:
      - DATABASE_URL=postgresql://<project>:${POSTGRES_PASSWORD}@db:5432/<project>?schema=public
      - PORT=3000
    # наружу не смотрим — только nginx на хосте (0.0.0.0 = открыто миру!)
    ports:
      - "127.0.0.1:3000:3000"
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
    healthcheck:
      test: ["CMD", "bun", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      start_period: 20s
      retries: 3

volumes:
  <project>-pgdata:
```

Три защитных решения тут: `${POSTGRES_PASSWORD:?...}` — деплой не стартует
с пустым паролем; `127.0.0.1:3000` — приложение доступно только через nginx;
`logging: json-file 10m×3` — логи не съедят диск (Грабли №10).

### 3.5. `scripts/deploy.sh` — поставка на сервере

```bash
#!/usr/bin/env bash
# Вызов: bash scripts/deploy.sh 1.2.3
# (именно через bash: файл, залитый с Windows, теряет бит x — Грабли №1)
set -euo pipefail

TAG="${1:?Использование: bash scripts/deploy.sh <тег>}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

STATE_DIR=".deploy"; COMPOSE_FILE="deploy/docker-compose.prod.yml"; BACKUP_DIR="backups"
mkdir -p "$STATE_DIR" "$BACKUP_DIR"

DEPLOY_IMAGE="${DEPLOY_IMAGE:-ghcr.io/<user>/<repo>}"
[ -f "$STATE_DIR/env" ] && . "$STATE_DIR/env"

set -a; [ -f .env ] && . ./.env; set +a
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD должен быть задан в .env}"

echo "==> Деплой $DEPLOY_IMAGE:$TAG"

# 0. Первый запуск: поднять БД и дождаться готовности
if ! docker compose -f "$COMPOSE_FILE" ps db 2>/dev/null | grep -q "<project>-db"; then
  TAG="$TAG" DEPLOY_IMAGE="$DEPLOY_IMAGE" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    docker compose -f "$COMPOSE_FILE" up -d db
fi
for i in $(seq 1 30); do
  docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U <project> -d <project> >/dev/null 2>&1 && break
  sleep 2
done

# 1. Бэкап БД перед любыми изменениями схемы
TS=$(date +%Y%m%d-%H%M%S)
echo "==> Бэкап БД (pg_dump)"
docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U <project> -d <project> --no-owner --format=custom \
  > "$BACKUP_DIR/pg-$TS.dump" || echo "    (бэкап пропущен — БД ещё пустая)"

# 2. Схема БД прогоном нового контейнера (run --rm --no-deps)
TAG="$TAG" DEPLOY_IMAGE="$DEPLOY_IMAGE" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  docker compose -f "$COMPOSE_FILE" run --rm --no-deps app \
  bun node_modules/prisma/build/index.js db push --skip-generate

# 3. Запуск новой версии
TAG="$TAG" DEPLOY_IMAGE="$DEPLOY_IMAGE" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
docker image prune -f --filter "label=com.docker.compose.project" >/dev/null 2>&1 || true

# 4. Health-check (до 90 сек) + АВТО-ОТКАТ при провале
ok=0
for i in $(seq 1 30); do
  curl -sf http://localhost:3000/api/health | grep -q '"ok":true' && { ok=1; break; }
  sleep 3
done
if [ "$ok" != "1" ]; then
  echo "!! health-check не прошёл — откат"
  bash scripts/rollback.sh || true
  exit 1
fi

# 5. Бутстрап первого админа (идемпотентный скрипт: создаёт только если пусто)
docker compose -f "$COMPOSE_FILE" exec -T app bun prisma/bootstrap.ts || true

# 6. История деплоев (для отката и диагностики)
echo "$TAG" > "$STATE_DIR/current"
echo "$TS $TAG" >> "$STATE_DIR/history"
tail -20 "$STATE_DIR/history" > "$STATE_DIR/history.tmp" && mv "$STATE_DIR/history.tmp" "$STATE_DIR/history"

# 7. Ротация бэкапов: 30 дней
find "$BACKUP_DIR" -name "pg-*.dump" -mtime +30 -delete 2>/dev/null || true

echo "==> Деплой $TAG завершён успешно"
```

Про `prisma db push`: безопасен для **аддитивных** изменений (новые поля/
таблицы/NULL-колонки). Удаление/переименование колонок — только через
миграции и вручную проверенную `prisma migrate`. `--accept-data-loss`
в автоматизации — запрещено.

### 3.6. `scripts/rollback.sh` — откат

```bash
#!/usr/bin/env bash
# bash scripts/rollback.sh        — на предпоследний рабочий тег
# bash scripts/rollback.sh 1.2.1  — на конкретный
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"; cd "$APP_DIR"
STATE_DIR=".deploy"; COMPOSE_FILE="deploy/docker-compose.prod.yml"
DEPLOY_IMAGE="${DEPLOY_IMAGE:-ghcr.io/<user>/<repo>}"
[ -f "$STATE_DIR/env" ] && . "$STATE_DIR/env"
set -a; [ -f .env ] && . ./.env; set +a
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD должен быть задан в .env}"

if [ -n "${1:-}" ]; then TARGET="$1"; else
  [ -f "$STATE_DIR/history" ] || { echo "!! Истории нет"; exit 1; }
  TARGET=$(tail -2 "$STATE_DIR/history" | head -1 | awk '{print $2}')
fi

echo "==> Откат: $DEPLOY_IMAGE:$TARGET"
TAG="$TARGET" DEPLOY_IMAGE="$DEPLOY_IMAGE" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

ok=0
for i in $(seq 1 30); do
  curl -sf http://localhost:3000/api/health | grep -q '"ok":true' && { ok=1; break; }
  sleep 3
done
[ "$ok" = "1" ] || { echo "!! Откат тоже нездоров — docker compose -f $COMPOSE_FILE ps && docker logs <project>-app"; exit 1; }
echo "$TARGET" > "$STATE_DIR/current"
echo "$(date +%Y%m%d-%H%M%S) $TARGET (rollback)" >> "$STATE_DIR/history"
echo "==> Откат на $TARGET выполнен, прод здоров"
```

Откат меняет только контейнер приложения — БД не трогает. Деструктивные
миграции в прошлого тега откатываются вручную из свежего `backups/pg-*.dump`:
`docker compose exec -T db pg_restore -U <project> -d <project> --clean < dump`.

### 3.7. `scripts/status.sh` — экспресс-диагностика

Печатает по порядку: `docker compose ps` → `curl /api/health` →
`.deploy/current` + история → `df -h` → свежие бэкапы → хвост лога.
**Читается сверху вниз: первый красный/пустой пункт — место проблемы.**
Полный текст — в репо ScoresBox, скопируйте и замените имена.

---

## 4. GitHub Actions: `.github/workflows/cd.yml`

```yaml
name: CD
on:
  push:
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      confirm: { description: "Введите DEPLOY", required: true, default: "" }

concurrency:
  group: cd-production
  cancel-in-progress: false

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}
  VERSION: ${{ github.ref_type == 'tag' && github.ref_name || github.sha }}

permissions:
  contents: read

jobs:
  build:
    name: Build & push (GHCR)
    runs-on: ubuntu-latest
    # БЕЗ packages:write push в GHCR падает: «denied: installation not
    # allowed to Create organization package» (Грабли №5)
    permissions:
      contents: read
      packages: write
    environment: production
    timeout-minutes: 20
    outputs:
      image_tag: ${{ steps.meta.outputs.tag }}
    steps:
      - uses: actions/checkout@v7
      - name: Ручной запуск требует подтверждения
        if: github.event_name == 'workflow_dispatch' && inputs.confirm != 'DEPLOY'
        run: echo "::error::Введите DEPLOY в поле confirm" && exit 1
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with: { registry: "${{ env.REGISTRY }}", username: "${{ github.actor }}", password: "${{ secrets.GITHUB_TOKEN }}" }
      - id: meta
        run: echo "tag=${VERSION#v}" >> "$GITHUB_OUTPUT"
      - uses: docker/build-push-action@v7
        with:
          context: .
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ steps.meta.outputs.tag }}
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    name: Deploy → VPS
    runs-on: ubuntu-latest
    needs: build
    permissions:
      contents: read
      packages: read
    environment: production
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      # АВТОСИНК: на сервере всегда актуальные scripts/ и compose из ЭТОГО
      # коммита. Иначе на VPS живут устаревшие файлы эпохи «заливал руками»
      # (Грабли №3: старый deploy.sh тянул alpine и ловил 429 Docker Hub)
      - name: Синхронизация файлов деплоя
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          source: "scripts/deploy.sh,scripts/rollback.sh,scripts/status.sh,deploy/docker-compose.prod.yml"
          target: "/opt/<project>"
          overwrite: true
      - name: Деплой (backup → migrate → up → health)
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            set -euo pipefail
            cd /opt/<project>
            chmod +x scripts/*.sh 2>/dev/null || true
            echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
            mkdir -p .deploy
            echo "DEPLOY_IMAGE=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}" > .deploy/env
            # bash, не ./ — бит x теряется при заливке с Windows (Грабли №1)
            bash scripts/deploy.sh "${{ needs.build.outputs.image_tag }}"
      - name: Внешний health-check (200 от главной)
        run: |
          for i in $(seq 1 15); do
            code=$(curl -s -o /dev/null -w '%{http_code}' "${{ secrets.DEPLOY_PUBLIC_URL }}/" || true)
            [ "$code" = "200" ] && echo "OK" && exit 0
            sleep 4
          done
          echo "::error::не 200 — запускайте rollback"; exit 1

  rollback:
    name: Rollback (ручной)
    runs-on: ubuntu-latest
    environment: production-rollback
    # только если деплой реально стартовал на сервере и упал
    if: needs.deploy.result == 'failure' && github.event_name != 'workflow_dispatch'
    needs: deploy
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            set -euo pipefail
            cd /opt/<project>
            bash scripts/rollback.sh
```

---

## 5. VPS: подготовка (один раз)

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker <user>   # перелогиньтесь после

# 2. Каталог проекта
sudo mkdir -p /opt/<project> && sudo chown $USER /opt/<project>
cd /opt/<project>

# 3. .env — вручную (не хранится нигде, кроме сервера)
nano .env         # POSTGRES_PASSWORD, AUTH_SECRET, ADMIN_*, SITE_URL

# 4. файрвол: наружу только 22/80/443
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

## 6. Первый деплой

```bash
git tag v0.1.0
git push origin v0.1.0
```

Дальше смотрите Actions → job CD: build → deploy → health. На сервере:

```bash
cd /opt/<project>
bash scripts/status.sh          # оба контейнера Up, app healthy, версия = тег
```

## 7. Домен, nginx, HTTPS

```bash
sudo apt install nginx certbot python3-certbot-nginx

# /etc/nginx/sites-available/<project>
server {
    listen 80;
    server_name app.example.com;
    client_max_body_size 10m;                # под загрузку файлов
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

sudo ln -s /etc/nginx/sites-available/<project> /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d app.example.com      # HTTPS + автопродление
```

**Смена домена потом = 3 шага:** DNS A-запись → `SITE_URL` в `/opt/<project>/.env`
→ certbot для нового домена; затем обычный релиз (или `docker compose restart app`).

---

## 8. Повседневные операции

| Задача | Команда |
|---|---|
| Релиз | `git tag v1.2.3 && git push origin v1.2.3` — остальное CI |
| Проверить прод | `bash scripts/status.sh` |
| Логи приложения | `docker logs <project>-app --tail 100 -f` |
| Логи nginx | `sudo tail -100 /var/log/nginx/access.log` (+ error.log) |
| Откат | `bash scripts/rollback.sh` (на сервере) или job Rollback в Actions |
| Ручной бэкап | `docker compose ... exec -T db pg_dump ... > backups/x.dump` |
| Восстановление | `pg_restore -U <project> -d <project> --clean < dumps/pg-*.dump` |

**Мониторинг — 4 уровня:**
1. `restart: unless-stopped` + HEALTHCHECK в compose — самопочинка контейнера;
2. health-check внутри CI — падающий деплой = авто-откат;
3. внешний пинг (UptimeRobot и т.п.) на `https://домен/api/health` — узнаёте
   о проблеме раньше пользователей;
4. `bash scripts/status.sh` по расписанию/при подозрении.

---

## 9. ГРАБЛИ — симптомы, причины, фиксы

| № | Симптом | Причина | Фикс |
|---|---|---|---|
| 1 | deploy.sh падает `exit 126 Permission denied` | файл, залитый с Windows, без бита `x`; CI зовёт `./script.sh` | все вызовы **через `bash`** (`bash scripts/deploy.sh`), `chmod +x` в CI — запасной |
| 2 | `env file /opt/.../deploy/.env not found`, exit 1 | `env_file` в compose ищется **от каталога compose-файла**, а не от cwd | писать `env_file: ../.env` (или абсолютный путь) |
| 3 | на сервере творится ересь: старый баннер, чужие настройки, `429` от Docker Hub | на VPS лежат **устаревшие** скрипты/compose, залитые когда-то вручную; деплой их не обновлял | scp-автосинк `scripts/` + `deploy/` при каждом деплое (см. cd.yml) |
| 4 | `prisma db push` в контейнере: `Cannot find package 'effect'` | в runtime-образ не скопированы зависимости (standalone Next.js их не включает) | `COPY ... /app/node_modules ./node_modules` ЦЕЛИКОМ |
| 5 | GHCR push: `denied: installation not allowed to Create organization package` | у GITHUB_TOKEN нет прав на пакеты | в job build: `permissions: packages: write` |
| 6 | прод раздаёт исходники/бандлы по `/download/...` | каталоги поставки попали в образ и раздаются как статика | `.dockerignore` c `public/download`, секретами и логами |
| 7 | сборка падает `exit 127` на `adduser`/`addgroup` | в минимальных образах (bun/alpine) нет этих утилит | `USER 1001:1001` числовым uid/gid без adduser |
| 8 | логи Docker съели диск, прод лежит | docker по умолчанию пишет json-логи без лимита | `logging: json-file, max-size 10m, max-file 3` каждому сервису |
| 9 | деплой «прошёл», но сайт не открывается | health-check не проверялся вообще / не было ручки `/api/health` | ручка health + цикл curl в deploy.sh с авто-откатом + внешний 200-check в CI |
| 10 | порт приложения открыт миру (сканы, эксплойты) | `ports: "3000:3000"` = `0.0.0.0` | `ports: "127.0.0.1:3000:3000"` — только nginx |
| 11 | дубль деплоя при повторном прогоне Actions | нет блокировки одновременных запусков | `concurrency: group: cd-production, cancel-in-progress: false` |
| 12 | после смены домена куки/sitemap смотрят на старый | домен зашит в конфиге приложения | единственный источник — `SITE_URL` в `.env`; смена = env + certbot |
| 13 | `prisma db push` удалил данные | в CI флаг `--accept-data-loss` | только аддитивные push; деструктив — через `prisma migrate` руками |
| 14 | CI не может `docker pull` приватный образ | образ приватный, сервер не авторизован в GHCR | `docker login ghcr.io` в ssh-скрипте перед deploy.sh |

---

## 10. Чек-лист перед первым деплоем (сверьте за 2 минуты)

- [ ] `/api/health` отвечает `{ok:true}` локально
- [ ] `next.config`: `output: "standalone"`
- [ ] Dockerfile: node_modules скопированы ЦЕЛИКОМ, `USER 1001:1001`
- [ ] `.dockerignore`: без `.env`, `public/download`, бэкапов
- [ ] compose: `env_file: ../.env`, порт `127.0.0.1:3000`, логи 10m×3, healthcheck
- [ ] deploy.sh: бэкап → db push → up → health с авто-откатом
- [ ] cd.yml: `permissions: packages: write` в build; scp-автосинк; ssh через `bash`
- [ ] Секреты: DEPLOY_HOST / DEPLOY_USER / DEPLOY_SSH_KEY / DEPLOY_PUBLIC_URL
- [ ] На сервере: `/opt/<project>/.env` заполнен
- [ ] ufw открыт только 22/80/443

## 11. «Сайт упал» — порядок действий

1. `bash scripts/status.sh` — первый красный пункт укажет слой проблемы.
2. `docker logs <project>-app --tail 100` — ошибки приложения.
3. `docker compose -f deploy/docker-compose.prod.yml ps` — кто не поднялся.
4. `bash scripts/rollback.sh` — если проблема началась после релиза.
5. `df -h /` — диск полный? (логи → Грабли №8)
6. Внешний пинг и `curl -I https://домен` — возможно, дело в DNS/ nginx/cert.

