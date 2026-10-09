-- v1.0.53 · SEO-картинки для поисковиков (feedback53 №2): og:image из админки.
-- Тот же паттерн, что logoDarkUrl/logoLightUrl/iconUrl (миграция 00000000000006):
-- URL → Media (/api/media/<id>), NULL = встроенная карточка
-- public/brand/og-default.png (SB-монограмма + SCORESBOX, 1200×630, PNG).
-- Каждая загрузка = новый Media id = новый URL → immutable-кэш медиа не мешает.
ALTER TABLE "BrandSetting" ADD COLUMN "ogImageUrl" TEXT;
