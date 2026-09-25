// Bootstrap прод-администратора — выполняется при каждом деплое (идемпотентно).
// Создаёт SUPER_ADMIN из переменных окружения ADMIN_EMAIL / ADMIN_PASSWORD,
// если в системе ещё нет ни одного пользователя.
// Запуск: docker compose -f deploy/docker-compose.prod.yml exec app bun prisma/bootstrap.ts
// (также вызывается автоматически из scripts/deploy.sh)

import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const db = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("bootstrap: ADMIN_EMAIL/ADMIN_PASSWORD не заданы — пропускаю");
    return;
  }
  if (password.length < 8) {
    console.log("bootstrap: пароль короче 8 символов — пропускаю (небезопасно)");
    return;
  }

  const users = await db.user.count();

  if (users > 0) {
    console.log(`bootstrap: пользователи уже есть (${users}) — ничего не делаю`);
    return;
  }

  await db.user.create({
    data: {
      email,
      passwordHash: hashPassword(password),
      role: "SUPER_ADMIN",
    },
  });

  console.log(`bootstrap: создан SUPER_ADMIN ${email}`);
  console.log("bootstrap: после первого входа включите 2FA (TOTP) в разделе «Безопасность»");
}

main()
  .catch((e) => {
    console.error("bootstrap: ошибка", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
