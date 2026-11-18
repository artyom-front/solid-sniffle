-- Этап 3 (v1.0.29): контент сайта под управлением админки.
-- 1) FormatLink — виды футбола в меню сайта: админ добавляет/убирает/переименовывает
--    форматы (11×11, футзал 5×5, ЛФЛ 8×8 и разновидности). code = League.format.
-- 2) StatBlock — редакционные стат-карточки правой колонки с опциональным фото
--    (фото бомбардира, лого клуба) — бокс фиксированной высоты, анти-CLS.
-- Всё аддитивно: существующие таблицы не трогаем.

-- CreateTable
CREATE TABLE "FormatLink" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormatLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatBlock" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT,
    "value" TEXT,
    "imageUrl" TEXT,
    "linkUrl" TEXT,
    "imageFit" TEXT,
    "imagePos" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormatLink_code_key" ON "FormatLink"("code");

-- Seed: базовая четвёрка видов футбола (та же, что была в хардкоде).
-- ON CONFLICT — идемпотентность. updatedAt задаём явно: Prisma @updatedAt
-- не имеет DEFAULT в БД (клиент пишет сам), а это сырой SQL.
INSERT INTO "FormatLink" ("id", "code", "label", "sortOrder", "isVisible", "updatedAt") VALUES
    ('fmt_f11',    'F11',    'Футбол',      10, true, CURRENT_TIMESTAMP),
    ('fmt_f8',     'F8',     '8×8',         20, true, CURRENT_TIMESTAMP),
    ('fmt_f6',     'F6',     '6×6',         30, true, CURRENT_TIMESTAMP),
    ('fmt_futsal', 'FUTSAL', 'Мини-футбол', 40, true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
