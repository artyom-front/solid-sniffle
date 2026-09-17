import QRCode from "qrcode";
import { db } from "@/lib/db";
import { requireRole, verifyPassword } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/http";
import { generateTotpSecret, verifyTotp, otpauthUri, generateRecoveryCodes, hashRecoveryCode } from "@/lib/totp";
import { audit } from "@/lib/engine/lifecycle";

// ============================================================
// Управление 2FA (TOTP) для сотрудников.
// Действия (POST { action, ... }):
//   setup     — сгенерировать секрет + QR (не включает 2FA)
//   enable    — подтвердить кодом из приложения → 2FA включена,
//               выдаёт резервные коды (показываются ОДИН раз)
//   disable   — выключить (код или пароль)
//   recovery  — перегенерировать резервные коды (нужен пароль)
// ============================================================

const BRAND = "SCORESBOX";
const failByUser = new Map<string, number>();

function bumpFail(userId: string): number {
  const n = (failByUser.get(userId) ?? 0) + 1;
  failByUser.set(userId, n);
  return n;
}

export async function POST(req: Request) {
  try {
    // 2FA доступна всем ролям персонала (админ/лига/клуб/судья)
    const user = await requireRole("LEAGUE_ADMIN", "CLUB_ADMIN", "REFEREE");
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    const full = await db.user.findUnique({ where: { id: user.id }, include: { person: true } });

    switch (action) {
      // ---------- Подготовка: секрет + QR ----------
      case "setup": {
        const secret = generateTotpSecret();
        const uri = otpauthUri({ secret, account: user.email, issuer: BRAND });
        const qr = await QRCode.toDataURL(uri, { margin: 1, width: 240, color: { dark: "#0A0D13", light: "#FFFFFF" } });
        await db.user.update({
          where: { id: user.id },
          data: { totpSecret: secret, totpEnabled: false, totpLastStep: 0 },
        });
        await audit(user, "User", user.id, "TOTP_SETUP", null, { email: user.email });
        return Response.json({ secret, otpauth: uri, qr });
      }

      // ---------- Включение: подтверждение кодом ----------
      case "enable": {
        if (!full?.totpSecret) throw new HttpError(400, "Сначала сгенерируйте секрет (setup)");
        const step = verifyTotp(full.totpSecret, String(body.code ?? ""), { lastStep: 0 });
        if (!step) {
          if (bumpFail(user.id) >= 5) throw new HttpError(429, "Слишком много неверных кодов. Начните настройку заново");
          throw new HttpError(401, "Неверный код. Проверьте время в телефоне и попробуйте ещё раз");
        }
        failByUser.delete(user.id);
        const codes = generateRecoveryCodes(8);
        await db.user.update({
          where: { id: user.id },
          data: {
            totpEnabled: true,
            // lastStep не фиксируем: код настройки не должен блокировать
            // вход тем же окном («включил и сразу перезашёл»)
            recoveryCodes: JSON.stringify(codes.map(hashRecoveryCode)),
          },
        });
        await audit(user, "User", user.id, "TOTP_ENABLE", null, { email: user.email });
        return Response.json({ enabled: true, recoveryCodes: codes });
      }

      // ---------- Выключение ----------
      case "disable": {
        if (!full?.totpEnabled) throw new HttpError(400, "2FA не включена");
        const codeOk = full.totpSecret && verifyTotp(full.totpSecret, String(body.code ?? ""), {});
        const passOk = body.password && verifyPassword(String(body.password), full.passwordHash);
        if (!codeOk && !passOk) {
          if (bumpFail(user.id) >= 5) throw new HttpError(429, "Слишком много неверных попыток");
          throw new HttpError(401, "Укажите верный код из приложения или пароль");
        }
        failByUser.delete(user.id);
        await db.user.update({
          where: { id: user.id },
          data: { totpEnabled: false, totpSecret: null, totpLastStep: 0, recoveryCodes: null },
        });
        await audit(user, "User", user.id, "TOTP_DISABLE", { enabled: true }, { enabled: false });
        return Response.json({ enabled: false });
      }

      // ---------- Перегенерация резервных кодов ----------
      case "recovery": {
        if (!full?.totpEnabled) throw new HttpError(400, "2FA не включена");
        if (!body.password || !verifyPassword(String(body.password), full.passwordHash)) {
          bumpFail(user.id);
          throw new HttpError(401, "Неверный пароль");
        }
        failByUser.delete(user.id);
        const codes = generateRecoveryCodes(8);
        await db.user.update({ where: { id: user.id }, data: { recoveryCodes: JSON.stringify(codes.map(hashRecoveryCode)) } });
        await audit(user, "User", user.id, "TOTP_RECOVERY", null, { email: user.email });
        return Response.json({ recoveryCodes: codes });
      }

      // ---------- Статус (для панели) ----------
      case "status": {
        return Response.json({
          enabled: full?.totpEnabled ?? false,
          hasSecret: !!full?.totpSecret,
          recoveryLeft: full?.recoveryCodes ? JSON.parse(full.recoveryCodes).length : 0,
        });
      }

      default:
        throw new HttpError(422, "Неизвестное действие");
    }
  } catch (e) {
    return errorResponse(e);
  }
}

/** GET — текущий статус 2FA пользователя (для панели «Безопасность») */
export async function GET() {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "CLUB_ADMIN", "REFEREE");
    const full = await db.user.findUnique({ where: { id: user.id } });
    return Response.json({
      enabled: full?.totpEnabled ?? false,
      hasSecret: !!full?.totpSecret,
      recoveryLeft: full?.recoveryCodes ? JSON.parse(full.recoveryCodes).length : 0,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
