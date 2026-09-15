// Загрузка медиафайлов (фото персон/клубов/команд/стадионов, файлы протоколов).
// POST multipart/form-data: file=<image|pdf>
// Изображения автоматически уменьшаются до 1200px и конвертируются в WebP (sharp).
// Возвращает { url: "/api/media/<id>", ... } — URL кладётся в поле сущности.
// DELETE ?url=/api/media/<id> — удаление (только для файлов, не привязанных жёстко).

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const FILE_TYPES = [...IMAGE_TYPES, "application/pdf"];
const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 МБ до обработки
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 МБ для PDF

export async function POST(req: Request) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(422, "Файл не передан (поле file)");

    const mime = file.type || "application/octet-stream";
    const isImage = IMAGE_TYPES.includes(mime);
    if (!FILE_TYPES.includes(mime)) {
      throw new HttpError(422, `Тип не поддерживается: ${mime}. Разрешены JPG, PNG, WebP, AVIF, PDF`);
    }
    const limit = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
    if (file.size > limit) throw new HttpError(422, `Файл больше ${Math.round(limit / 1024 / 1024)} МБ`);

    let data: Buffer;
    let outMime = mime;
    let filename = file.name || null;

    if (isImage) {
      // нормализация: максимум 1200px по длинной стороне, WebP — экономит место в БД
      const sharp = (await import("sharp")).default;
      const buf = Buffer.from(await file.arrayBuffer());
      data = await sharp(buf)
        .rotate() // учитываем EXIF-ориентацию (фото с телефона)
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      outMime = "image/webp";
      filename = filename ? filename.replace(/\.[^.]+$/, "") + ".webp" : null;
    } else {
      data = Buffer.from(await file.arrayBuffer());
    }

    const media = await db.media.create({
      data: { mime: outMime, filename, size: data.length, data: new Uint8Array(data) },
    });
    await audit(user, "Media", media.id, "CREATE", null, { mime: outMime, size: data.length });
    return Response.json({ ok: true, id: media.id, url: `/api/media/${media.id}`, mime: outMime, size: data.length });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const id = new URL(req.url).searchParams.get("url")?.split("/").pop();
    if (!id) throw new HttpError(422, "Укажите ?url=/api/media/<id>");
    await db.media.delete({ where: { id } });
    await audit(user, "Media", id, "DELETE", null, null);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
