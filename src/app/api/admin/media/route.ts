// Загрузка медиафайлов (фото персон/клубов/команд/стадионов, файлы протоколов).
// POST multipart/form-data: file=<image|pdf|video>
// Изображения автоматически уменьшаются до 1920px и конвертируются в WebP (sharp);
// видео (mp4/webm, фидбек 2026-11-13 «проверь добавление видео») кладётся как есть.
// Возвращает { url: "/api/media/<id>", ... } — URL кладётся в поле сущности.
// DELETE ?url=/api/media/<id> — удаление.
// v1.0.42 (аудит 2026-10-05): DELETE — только SUPER_ADMIN. У Media нет модели
// владения/ссылок, а URL публичны — раньше ЛЮБОЙ CLUB_ADMIN мог удалить
// чужой логотип/фото/скан по прямому ID, оставив сущность с битой картинкой.
// Загрузка (POST) остаётся у CLUB_ADMIN — создание файлов безвредно.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const FILE_TYPES = [...IMAGE_TYPES, "application/pdf", ...VIDEO_TYPES];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 МБ до обработки
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 МБ для PDF
/** видео — до 64 МБ: минуты игры в 480p/720p укладываются; БД bytea */
const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
/** v1.0.46: 1920px по длинной стороне — фоновые баннеры (BACKGROUND)
 *  рекомендуются 1920×1080 и раньше сжимались до 1200 (мыло на больших
 *  экранах). WebP q82 держит размер в сотни КБ — БД не распухает. */
const IMAGE_MAX_DIM = 1920;

export async function POST(req: Request) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(422, "Файл не передан (поле file)");

    const mime = file.type || "application/octet-stream";
    const isImage = IMAGE_TYPES.includes(mime);
    const isVideo = VIDEO_TYPES.includes(mime);
    if (!FILE_TYPES.includes(mime)) {
      throw new HttpError(422, `Тип не поддерживается: ${mime}. Разрешены JPG, PNG, WebP, AVIF, PDF, MP4, WebM`);
    }
    // видео с телефона часто идёт без MIME (octet-stream) — верим по расширению
    const videoExtMatch = /\.(mp4|webm|mov)$/i.exec(file.name ?? "");
    const treatAsVideoByExt = !!videoExtMatch;
    const treatAsVideo = isVideo || (mime === "application/octet-stream" && treatAsVideoByExt);
    const limit = isImage ? MAX_IMAGE_BYTES : treatAsVideo ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
    if (file.size > limit) throw new HttpError(422, `Файл больше ${Math.round(limit / 1024 / 1024)} МБ`);

    let data: Buffer;
    let outMime = mime;
    let filename = file.name || null;

    if (isImage) {
      // нормализация: максимум 1920px по длинной стороне, WebP — экономит место в БД
      const sharp = (await import("sharp")).default;
      const buf = Buffer.from(await file.arrayBuffer());
      data = await sharp(buf)
        .rotate() // учитываем EXIF-ориентацию (фото с телефона)
        .resize(IMAGE_MAX_DIM, IMAGE_MAX_DIM, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      outMime = "image/webp";
      filename = filename ? filename.replace(/\.[^.]+$/, "") + ".webp" : null;
    } else if (treatAsVideo) {
      // видео не пережимаем на лету (ffmpeg в рантайме - тяжело):
      // кладём как есть, сервер отдаёт с поддержкой Range-запросов
      outMime = isVideo ? mime : videoExtMatch?.[0].toLowerCase() === ".webm" ? "video/webm" : "video/mp4";
      data = Buffer.from(await file.arrayBuffer());
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
    // SECURITY (v1.0.42, BOLA): см. шапку файла — без модели владения
    // удалять медиа может только супер-администратор.
    const user = await requireRole("SUPER_ADMIN");
    const id = new URL(req.url).searchParams.get("url")?.split("/").pop();
    if (!id) throw new HttpError(422, "Укажите ?url=/api/media/<id>");
    // v1.0.24 (аудит Task 27 🟡-5): несуществующий id раньше проходил в
    // delete() → P2025 → голый 500. Теперь честный 404 + осмысленный аудит.
    const media = await db.media.findUnique({ where: { id }, select: { id: true, filename: true, mime: true, size: true } });
    if (!media) throw new HttpError(404, "Файл не найден");
    await db.media.delete({ where: { id } });
    await audit(user, "Media", id, "DELETE", { filename: media.filename, mime: media.mime, size: media.size }, null);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
