// CRUD баннеров (Milestone 4, рекламные слоты): список и создание.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

const PLACEMENTS = ["TOP", "RIGHT_TOP", "RIGHT_BOTTOM"];

export function bannerPayload(body: Record<string, unknown>) {
  const title = String(body.title ?? "").trim();
  if (!title) throw new HttpError(422, "Укажите название баннера");
  const placement = String(body.placement ?? "");
  if (!PLACEMENTS.includes(placement)) throw new HttpError(422, "Размещение: TOP, RIGHT_TOP или RIGHT_BOTTOM");
  const priority = body.priority === undefined || body.priority === null || body.priority === "" ? 0 : Number(body.priority);
  if (!Number.isInteger(priority) || priority < 0 || priority > 100) throw new HttpError(422, "Приоритет: 0–100");
  return {
    title,
    placement,
    imageUrl: body.imageUrl ? String(body.imageUrl) : null,
    linkUrl: body.linkUrl ? String(body.linkUrl) : null,
    text: body.text ? String(body.text) : null,
    isActive: body.isActive === undefined ? true : !!body.isActive,
    priority,
    startsAt: body.startsAt ? new Date(String(body.startsAt)) : null,
    endsAt: body.endsAt ? new Date(String(body.endsAt)) : null,
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
