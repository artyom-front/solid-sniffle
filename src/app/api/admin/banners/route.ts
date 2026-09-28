// CRUD баннеров (Milestone 4, рекламные слоты): список и создание.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { isSafeWebUrl } from "@/lib/urlguard";

// v1.0.29: LEFT_TOP/LEFT_BOTTOM добавлены в белый список — в v1.0.28
// админка предлагала эти слоты, а API молча отвергал их (422).
const PLACEMENTS = ["TOP", "LEFT_TOP", "LEFT_BOTTOM", "RIGHT_TOP", "RIGHT_BOTTOM", "BOTTOM", "BACKGROUND"];
const IMAGE_FITS = ["cover", "contain", "repeat"];
const IMAGE_POSITIONS = ["center", "top", "bottom"];

export function bannerPayload(body: Record<string, unknown>) {
  const title = String(body.title ?? "").trim();
  if (!title) throw new HttpError(422, "Укажите название баннера");
  const placement = String(body.placement ?? "");
  if (!PLACEMENTS.includes(placement)) throw new HttpError(422, "Размещение: TOP, LEFT_TOP, LEFT_BOTTOM, RIGHT_TOP, RIGHT_BOTTOM, BOTTOM или BACKGROUND");
  if (placement === "BACKGROUND" && !body.imageUrl) throw new HttpError(422, "Фоновому баннеру нужна большая картинка (например 1920×1080)");
  const priority = body.priority === undefined || body.priority === null || body.priority === "" ? 0 : Number(body.priority);
  if (!Number.isInteger(priority) || priority < 0 || priority > 100) throw new HttpError(422, "Приоритет: 0–100");

  // масштабирование и позиция картинки
  const imageFit = body.imageFit === undefined || body.imageFit === null || body.imageFit === "" ? null : String(body.imageFit);
  if (imageFit && !IMAGE_FITS.includes(imageFit)) throw new HttpError(422, "Масштаб: cover, contain или repeat");
  const imagePos = body.imagePos === undefined || body.imagePos === null || body.imagePos === "" ? null : String(body.imagePos);
  if (imagePos && !IMAGE_POSITIONS.includes(imagePos)) throw new HttpError(422, "Позиция: center, top или bottom");

  // маркировка «Реклама»: размер и прозрачность
  const markSize = body.markSize === undefined || body.markSize === null || body.markSize === "" ? null : Number(body.markSize);
  if (markSize !== null && (!Number.isInteger(markSize) || markSize < 6 || markSize > 16)) throw new HttpError(422, "Размер маркировки: 6–16 px");
  const markOpacity = body.markOpacity === undefined || body.markOpacity === null || body.markOpacity === "" ? null : Number(body.markOpacity);
  if (markOpacity !== null && (!Number.isInteger(markOpacity) || markOpacity < 20 || markOpacity > 100)) throw new HttpError(422, "Прозрачность маркировки: 20–100%");

  // SECURITY (аудит Task 27 🟠-2, v1.0.24): схемы URL баннера — только
  // http(s) или путь внутри сайта. Раньше «javascript:alert(…)» писался
  // в БД и исполнялся в браузере посетителя по клику (stored XSS).
  const imageUrl = body.imageUrl ? String(body.imageUrl) : null;
  if (imageUrl && !isSafeWebUrl(imageUrl)) {
    throw new HttpError(422, "Ссылка на картинку: только http(s) или путь внутри сайта (начинается с /)");
  }
  const linkUrl = body.linkUrl ? String(body.linkUrl) : null;
  if (linkUrl && !isSafeWebUrl(linkUrl)) {
    throw new HttpError(422, "Ссылка перехода: только http(s) или путь внутри сайта (начинается с /). Схемы javascript:, data:, vbscript: и т.п. запрещены");
  }

  // v1.0.24: даты показа — валидные, иначе Invalid Date уезжал в БД
  // и ломал публичную выборку баннеров на рендере
  const startsAt = body.startsAt ? new Date(String(body.startsAt)) : null;
  if (startsAt && Number.isNaN(startsAt.getTime())) throw new HttpError(422, "Некорректная дата начала показа");
  const endsAt = body.endsAt ? new Date(String(body.endsAt)) : null;
  if (endsAt && Number.isNaN(endsAt.getTime())) throw new HttpError(422, "Некорректная дата окончания показа");
  if (startsAt && endsAt && startsAt > endsAt) throw new HttpError(422, "Дата окончания показа раньше даты начала");

  return {
    title,
    placement,
    imageUrl,
    linkUrl,
    text: body.text ? String(body.text) : null,
    isActive: body.isActive === undefined ? true : !!body.isActive,
    priority,
    startsAt,
    endsAt,
    imageFit,
    imagePos,
    markSize,
    markOpacity,
  };
}

export async function GET() {
  try {
    await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const banners = await db.banner.findMany({ orderBy: [{ placement: "asc" }, { priority: "asc" }, { createdAt: "desc" }] });
    return Response.json({
      banners: banners.map((b) => ({
        id: b.id, title: b.title, placement: b.placement, imageUrl: b.imageUrl, linkUrl: b.linkUrl,
        text: b.text, isActive: b.isActive, priority: b.priority,
        startsAt: b.startsAt?.toISOString() ?? null, endsAt: b.endsAt?.toISOString() ?? null,
        imageFit: b.imageFit, imagePos: b.imagePos, markSize: b.markSize, markOpacity: b.markOpacity,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const data = bannerPayload(await req.json());
    const banner = await db.banner.create({ data });
    await audit(user, "Banner", banner.id, "CREATE", null, data);
    return Response.json({ ok: true, banner });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
