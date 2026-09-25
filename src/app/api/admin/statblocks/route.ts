// CRUD стат-карточек (v1.0.29): редакционные блоки статистики правой
// колонки с опциональным фото (фото бомбардира, лого клуба).
// Карточка на сайте — бокс ФИКСИРОВАННОЙ высоты: с фото и без фото
// размер одинаков (анти-CLS), подпись/цифра поверх фото.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { isSafeWebUrl } from "@/lib/urlguard";

const IMAGE_FITS = ["cover", "contain"];
const IMAGE_POSITIONS = ["center", "top", "bottom"];

export function statBlockPayload(body: Record<string, unknown>) {
  const title = String(body.title ?? "").trim();
  if (!title) throw new HttpError(422, "Укажите заголовок (например: «Бомбардир тура»)");
  if (title.length > 80) throw new HttpError(422, "Заголовок: до 80 символов");
  const text = body.text === undefined || body.text === null ? null : String(body.text).trim();
  if (text && text.length > 120) throw new HttpError(422, "Подпись: до 120 символов");
  const value = body.value === undefined || body.value === null || body.value === "" ? null : String(body.value).trim();
  if (value && value.length > 8) throw new HttpError(422, "Цифра: до 8 символов (например «12» или «+7»)");

  const priority = body.priority === undefined || body.priority === null || body.priority === "" ? 0 : Number(body.priority);
  if (!Number.isInteger(priority) || priority < 0 || priority > 100) throw new HttpError(422, "Приоритет: 0–100");

  const imageFit = body.imageFit === undefined || body.imageFit === null || body.imageFit === "" ? null : String(body.imageFit);
  if (imageFit && !IMAGE_FITS.includes(imageFit)) throw new HttpError(422, "Масштаб: cover или contain");
  const imagePos = body.imagePos === undefined || body.imagePos === null || body.imagePos === "" ? null : String(body.imagePos);
  if (imagePos && !IMAGE_POSITIONS.includes(imagePos)) throw new HttpError(422, "Позиция: center, top или bottom");

  // SECURITY: схемы URL — только http(s) или путь внутри сайта (анти-XSS,
  // как у баннеров с аудита Task 27 🟠-2)
  const imageUrl = body.imageUrl ? String(body.imageUrl) : null;
  if (imageUrl && !isSafeWebUrl(imageUrl)) {
    throw new HttpError(422, "Ссылка на картинку: только http(s) или путь внутри сайта (начинается с /)");
  }
  const linkUrl = body.linkUrl ? String(body.linkUrl) : null;
  if (linkUrl && !isSafeWebUrl(linkUrl)) {
    throw new HttpError(422, "Ссылка перехода: только http(s) или путь внутри сайта (начинается с /)");
  }

  return {
    title,
    text: text || null,
    value,
    imageUrl,
    linkUrl,
    imageFit,
    imagePos,
    isActive: body.isActive === undefined ? true : !!body.isActive,
    priority,
  };
}

export async function GET() {
  try {
    await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const blocks = await db.statBlock.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "desc" }] });
    return Response.json({
      statBlocks: blocks.map((b) => ({
        id: b.id, title: b.title, text: b.text, value: b.value,
        imageUrl: b.imageUrl, linkUrl: b.linkUrl,
        imageFit: b.imageFit, imagePos: b.imagePos,
        isActive: b.isActive, priority: b.priority,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const data = statBlockPayload(await req.json());
    const block = await db.statBlock.create({ data });
    await audit(user, "StatBlock", block.id, "CREATE", null, data);
    return Response.json({ ok: true, statBlock: block });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
