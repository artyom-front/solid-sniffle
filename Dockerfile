# SCORESBOX — Dockerfile (multi-stage, standalone-сборка Next.js)
# Сборка:  docker build -t scoresbox .
# Запуск:  docker run -p 3000:3000 --env-file .env scoresbox
# База данных — PostgreSQL (внешний сервис/контейнер db), коннект через DATABASE_URL.

FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# DATABASE_URL на этапе сборки не нужен — Prisma генерирует клиента без коннекта
RUN bunx prisma generate && bun run build

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HOME=/tmp

# Непривилегированный пользователь — ЧИСЛОВЫМ uid/gid, без adduser/addgroup:
# в базовом образе oven/bun:1 этих команд нет (exit 127 — именно это роняло
# «Docker build» и «Build & push» в GitHub Actions 04.09.2026, сборка падала за 2 c).
# USER 1001:1001 работает на ЛЮБОМ базовом образе (пользователь в /etc/passwd не нужен).

COPY --from=builder --chown=1001:1001 /app/.next/standalone ./
COPY --from=builder --chown=1001:1001 /app/public ./public
# Prisma-клиент и схема — для миграций при деплое (scripts/deploy.sh)
COPY --from=builder --chown=1001:1001 /app/prisma ./prisma
COPY --from=builder --chown=1001:1001 /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=1001:1001 /app/node_modules/@prisma ./node_modules/@prisma
# Prisma CLI — для прогона миграций из deploy.sh
COPY --from=builder --chown=1001:1001 /app/node_modules/prisma ./node_modules/prisma

USER 1001:1001
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "server.js"]
