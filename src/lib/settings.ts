// Глобальные настройки сайта (key-value, таблица Setting).
// Управление — из админки (раздел «Пользователи»), API /api/admin/settings.
// Читаются на горячих путях (логин) — только точечные findUnique.

import { db } from "@/lib/db";

/** Ключи настроек (булевы хранятся как "1"/"0") */
export const SETTING_KEYS = {
  /** TOTP-логин для пользователей: "0" — шаг 2FA при входе пропускается
   *  для всех (аварийный режим, admin override). Отсутствие записи = "1". */
  totpRequired: "totp_required",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

/** TOTP-вход включён глобально? (default: да — безопасный дефолт) */
export async function isTotpRequired(): Promise<boolean> {
  return (await getSetting(SETTING_KEYS.totpRequired)) !== "0";
}
