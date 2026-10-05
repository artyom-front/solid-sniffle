// Публичная раздача медиафайлов из БД: /api/media/<id>.
// Контент неизменен навсегда (id — cuid) → агрессивный immutable-кэш.
// CSP img-src 'self' — проксирование внешних картинок не требуется.

import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]+$/i.test(id)) return new Response("Bad id", { status: 400 });
  const media = await db.media.findUnique({ where: { id } });
  if (!media) return new Response("Not found", { status: 404 });

  const body = Buffer.from(media.data);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": media.mime,
      "Content-Length": String(body.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(media.filename ?? id)}`,
    },
  });
}
