# SCORESBOX — Dockerfile (multi-stage, standalone-сборка Next.js)

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

# Standalone-сборка Next.js
COPY --from=builder --chown=1001:1001 /app/.next/standalone ./

# 🆕 ВАЖНО: static-файлы не включаются в standalone, их нужно копировать отдельно
COPY --from=builder --chown=1001:1001 /app/.next/static ./.next/static

COPY --from=builder --chown=1001:1001 /app/public ./public
COPY --from=builder --chown=1001:1001 /app/prisma ./prisma

# Prisma-клиент и схема
COPY --from=builder --chown=1001:1001 /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=1001:1001 /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=1001:1001 /app/node_modules/prisma ./node_modules/prisma

# 🆕 Зависимости Prisma CLI для миграций (effect используется в @prisma/config)
COPY --from=builder --chown=1001:1001 /app/node_modules/effect ./node_modules/effect
COPY --from=builder --chown=1001:1001 /app/node_modules/fast-check ./node_modules/fast-check
COPY --from=builder --chown=1001:1001 /app/node_modules/pure-rand ./node_modules/pure-rand
COPY --from=builder --chown=1001:1001 /app/node_modules/dotenv ./node_modules/dotenv

USER 1001:1001
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "server.js"]
