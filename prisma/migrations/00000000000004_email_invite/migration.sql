-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordSet" BOOLEAN NOT NULL DEFAULT false;

-- v1.0.33: аккаунты, существовавшие ДО ввода приглашений по почте, уже
-- пользуются своими паролями и адресами (входят, получают сбросы) —
-- засчитываем им оба флага, чтобы не требовать повторной верификации.
-- Новые пользователи создаются с false/false (ждут приглашения).
UPDATE "User" SET "emailVerified" = true, "passwordSet" = true;
