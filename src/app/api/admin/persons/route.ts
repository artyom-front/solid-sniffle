// Справочник персон для админки (поиск, создание).
// Персона ≠ игрок: общие поля (ФИО, ДР, пол, фото) + специализации (roles).
// Защита от дублей: при совпадении ФИО+даты рождения — 409 со списком кандидатов
// (создание возможно только с force: true).

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { normalizeRoles, refereeFromRoles } from "@/lib/roles";

const POSITIONS = ["GK", "DF", "MF", "FW"];

export async function GET(req: Request) {
  try {
    await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN", "REFEREE");
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const seasonId = searchParams.get("seasonId");

    const where = q
      ? { OR: [{ lastName: { contains: q } }, { firstName: { contains: q } }] }
      : {};

    const persons = await db.person.findMany({
      where,
      include: {
        registrations: seasonId ? { where: { seasonId }, include: { team: true } } : { include: { team: true } },
      },
      take: 200,
      orderBy: [{ lastName: "asc" }],
    });

    return Response.json({
      persons: persons.map((p) => ({
        id: p.id,
        name: `${p.lastName} ${p.firstName} ${p.middleName ?? ""}`.trim(),
        firstName: p.firstName,
        lastName: p.lastName,
        middleName: p.middleName,
        birthDate: p.birthDate?.toISOString() ?? null,
        position: p.position,
        gender: p.gender,
        roles: p.roles,
        isReferee: p.isReferee,
        photoUrl: p.photoUrl,
        teams: [...new Set(p.registrations.map((r) => r.team.name))],
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { firstName, lastName, middleName, position, birthDate, gender, photoUrl, roles, force } = await req.json();
    if (!firstName || !lastName) throw new HttpError(422, "Укажите имя и фамилию");

    const roleList = normalizeRoles(roles);

    // ---- защита от дублей: ФИО + дата рождения ----
    const dup = await findDuplicate(String(lastName).trim(), String(firstName).trim(), String(middleName ?? "").trim(), birthDate ? new Date(birthDate) : null);
    if (dup.length > 0 && !force) {
      return Response.json({
        error: `Найдена похожая персона: ${dup[0].name}. Проверьте — возможно, это тот же человек (дубль)`,
        duplicates: dup,
      }, { status: 409 });
    }

    const person = await db.person.create({
      data: {
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        middleName: middleName ? String(middleName).trim() : null,
        position: position && POSITIONS.includes(position) ? position : null,
        birthDate: birthDate ? new Date(birthDate) : null,
        gender: gender === "MALE" || gender === "FEMALE" ? gender : null,
        photoUrl: typeof photoUrl === "string" && photoUrl.startsWith("/api/media/") ? photoUrl : null,
        roles: roleList,
        isReferee: refereeFromRoles(roleList),
      },
    });
    await audit(user, "Person", person.id, "CREATE", null, { firstName, lastName, roles: roleList, gender, hasPhoto: !!photoUrl });
    return Response.json({ ok: true, person });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Поиск вероятного дубля: ФИО без учёта регистра (+ дата рождения, если указана) */
async function findDuplicate(lastName: string, firstName: string, middleName: string, birthDate: Date | null) {
  const candidates = await db.person.findMany({
    where: {
      AND: [
        { lastName: { equals: lastName, mode: "insensitive" as const } },
        { firstName: { equals: firstName, mode: "insensitive" as const } },
        ...(middleName ? [{ middleName: { equals: middleName, mode: "insensitive" as const } }] : []),
        ...(birthDate ? [{ birthDate }] : []),
      ],
    },
    take: 5,
    include: { registrations: { take: 3, include: { team: true } } },
  });
  return candidates.map((p) => ({
    id: p.id,
    name: `${p.lastName} ${p.firstName} ${p.middleName ?? ""}`.trim(),
    birthDate: p.birthDate?.toISOString().slice(0, 10) ?? null,
    roles: p.roles,
    teams: [...new Set(p.registrations.map((r) => r.team.name))],
  }));
}

export const dynamic = "force-dynamic";
