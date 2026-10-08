-- v1.0.48 · Брендинг сайта из админки: логотип (тёмный/светлый фон) + фавикон.
-- Одна строка id='site' (upsert из /api/admin/brand). URL → Media (/api/media/<id>).
-- NULL = встроенный лого v1.0.47 (LogoVertical, SVG-пути) и знак-поле (фавикон).
-- Каждая загрузка = новый Media id = новый URL → immutable-кэш медиа не мешает.
-- CreateTable
CREATE TABLE "BrandSetting" (
    "id" TEXT NOT NULL DEFAULT 'site',
    "logoDarkUrl" TEXT,
    "logoLightUrl" TEXT,
    "iconUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandSetting_pkey" PRIMARY KEY ("id")
);
