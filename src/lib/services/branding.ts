// Сервис-слой брендинга (v1.0.48): единый источник для SSR (layout
// сайта, generateMetadata) и API-роутов. React cache() — один запрос
// к БД на рендер, сколько бы компонентов ни спросили.
//
// ОТКАТ УСТОЙЧИВ: БД недоступна (сборка без базы, деградация) →
// встроенные лого/фавикон v1.0.47 — сайт не теряет облик.

import { cache } from "react";
import { db } from "@/lib/db";
import { DEFAULT_BRANDING, type BrandingDTO } from "@/lib/branding";

export async function readBranding(): Promise<BrandingDTO> {
  const row = await db.brandSetting.findUnique({ where: { id: "site" } });
  if (!row) return DEFAULT_BRANDING;
  return {
    logoDarkUrl: row.logoDarkUrl,
    logoLightUrl: row.logoLightUrl,
    iconUrl: row.iconUrl,
  };
}

/** Брендинг с фолбэком (SSR/metadata). Кэш — на запрос рендера. */
export const getBranding = cache(async (): Promise<BrandingDTO> => {
  try {
    return await readBranding();
  } catch {
    return DEFAULT_BRANDING;
  }
});
