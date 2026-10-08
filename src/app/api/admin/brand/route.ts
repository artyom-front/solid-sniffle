// Брендинг сайта (v1.0.48): логотипы и иконка браузера из админки.
//
//   GET   — текущие настройки { branding };
//   POST  — multipart/form-data, поля-файлы (необязательные, но хоть одно):
//             logoDark  — лого для тёмного фона (шапка/футер сайта, вход);
//             logoLight — лого для светлого фона (панель управления);
//             icon      — фавикон (иконка вкладки + apple-touch).
//           Файлы кладутся в Media КАК ЕСТЬ (без WebP-конвертации медиа-
//           эндпоинта: Safari не читает WebP-фавиконы, SVG обязан
//           остаться вектором), SVG — через sanitizeSvg. Каждая загрузка
//           = НОВЫЙ Media id = НОВЫЙ URL → immutable-кэш не мешает;
//   PATCH — JSON { logoDarkUrl: null, logoLightUrl: null, iconUrl: null } —
//           сброс выбранных полей к встроенным лого (строки запрещены:
//           URL брендинга создаётся ТОЛЬКО загрузкой сюда, произвольные
//           ссылки не принимаются — анти-XSS).
//
// После изменения: revalidatePath('/', 'layout') — ISR страниц сайта не
// ждём 60 с, фавикон и лого меняются на СЛЕДУЮЩЕМ запросе любой страницы.
// Доступ: SUPER_ADMIN (матрица ADMIN-GUIDE §1 — контент сайта).

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { revalidatePath } from "next/cache";
import { BRAND_KINDS, BRAND_KIND_LABELS, validateBrandFile, sanitizeSvg } from "@/lib/branding";
import { readBranding } from "@/lib/services/branding";
import type { BrandingDTO } from "@/lib/branding";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await requireRole("SUPER_ADMIN");
    return Response.json({ ok: true, branding: await readBranding() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("SUPER_ADMIN");
    const form = await req.formData();

    const updates: Partial<Record<`${(typeof BRAND_KINDS)[number]}Url`, string>> = {};
    for (const kind of BRAND_KINDS) {
      const file = form.get(kind);
      if (!(file instanceof File) || file.size === 0) continue;

      const err = validateBrandFile(kind, file.type, file.size);
      if (err) throw new HttpError(422, `${BRAND_KIND_LABELS[kind]}: ${err}`);

      const buf = Buffer.from(await file.arrayBuffer());
      if (file.type === "image/svg+xml") {
        const svg = sanitizeSvg(buf.toString("utf8"));
        if (!svg.ok) throw new HttpError(422, `${BRAND_KIND_LABELS[kind]}: ${svg.error}`);
      }

      const media = await db.media.create({
        data: { mime: file.type, filename: file.name || null, size: buf.length, data: new Uint8Array(buf) },
      });
      updates[`${kind}Url`] = `/api/media/${media.id}`;
    }

    if (Object.keys(updates).length === 0) {
      throw new HttpError(422, "Не передан ни один файл (поля logoDark / logoLight / icon)");
    }

    await db.brandSetting.upsert({
      where: { id: "site" },
      update: updates,
      create: { id: "site", ...updates },
    });

    await audit(user, "BrandSetting", "site", "UPDATE", null, updates);
    revalidatePath("/", "layout");
    return Response.json({ ok: true, branding: await readBranding() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireRole("SUPER_ADMIN");
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") throw new HttpError(422, "Ожидается JSON-тело");

    const updates: Partial<BrandingDTO> = {};
    for (const kind of BRAND_KINDS) {
      const key = `${kind}Url` as keyof BrandingDTO;
      if (!(key in body)) continue;
      // сброс — ТОЛЬКО null: произвольные URL запрещены (см. шапку)
      if (body[key] !== null) {
        throw new HttpError(422, `Поле ${key}: сброс к встроенному лого — передайте null`);
      }
      updates[key] = null;
    }
    if (Object.keys(updates).length === 0) {
      throw new HttpError(422, "Нечего сбрасывать: передайте logoDarkUrl/logoLightUrl/iconUrl = null");
    }

    await db.brandSetting.upsert({
      where: { id: "site" },
      update: updates,
      create: { id: "site", ...updates },
    });

    await audit(user, "BrandSetting", "site", "UPDATE", null, { ...updates, note: "reset" });
    revalidatePath("/", "layout");
    return Response.json({ ok: true, branding: await readBranding() });
  } catch (e) {
    return errorResponse(e);
  }
}
