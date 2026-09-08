import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { SETTING_KEYS, isTotpRequired, setSetting } from "@/lib/settings";

// ============================================================
// Глобальные настройки сайта (SUPER_ADMIN): TOTP-логин вкл/выкл.
// GET  — текущее состояние тумблеров
// POST { totpRequired: boolean } — переключить TOTP-вход
// Выключение пропускает шаг 2FA при входе ВСЕХ пользователей
// (аварийный режим); включение — стандартное поведение.
// ============================================================

export async function GET() {
  try {
    await requireRole();
    return Response.json({ totpRequired: await isTotpRequired() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole();
    const body = await req.json().catch(() => ({}));
    if (typeof body.totpRequired !== "boolean") throw new HttpError(422, "Укажите totpRequired (boolean)");

    const before = await isTotpRequired();
    await setSetting(SETTING_KEYS.totpRequired, body.totpRequired ? "1" : "0");
    await audit(user, "Setting", SETTING_KEYS.totpRequired, "UPDATE", { totpRequired: before }, { totpRequired: body.totpRequired });

    // сколько сотрудников сейчас защищено 2FA — контекст для решения
    const protectedCount = await db.user.count({ where: { totpEnabled: true } });
    return Response.json({ totpRequired: body.totpRequired, protectedCount });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
