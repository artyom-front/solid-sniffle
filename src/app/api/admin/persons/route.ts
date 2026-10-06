// Справочник персон для админки: поиск, пагинация, создание.
// Персона ≠ игрок: общие поля (ФИО, ДР, пол, фото) + специализации (roles).
// v1.0.34: поиск — регистронезависимый (фамилия/имя/отчество), список —
// постраничный (page/pageSize, в ответе total) — раньше 200 записей молча
// обрезались и «Мамонтов» был за пределами выборки.
// v1.0.49: ?officials=1 — корпус назначений для бригады матча (без пагинации).
// Защита от дублей: при совпадении ФИО+даты рождения — 409 со списком кандидатов
// (создание возможно только с force: true; объединить позже — «Merge профилей»).

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { normalizeRoles, refereeFromRoles, MATCH_OFFICIAL_ROLE_CODES } from "@/lib/roles";
import { caseVariants } from "@/lib/text";

const POSITIONS = ["GK", "DF", "MF", "FW"];

export async function GET(req: Request) {
  try {
    await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN", "REFEREE");
    const { searchParams } = new URL(req.url);
    // v1.0.34 · ПОИСК: без toLowerCase на сервере! Prisma contains на
    // PostgreSQL РЕГИСТРОЗАВИСИМ — вместе с mode:"insensitive" ищем и
    // «Мамонтов», и «мамонтов»; ищем и в фамилии, и в имени, и в отчестве
    // (двуязычные опечатки, «по отчеству помню только»).
    const q = searchParams.get("q")?.trim() ?? "";
    const seasonId = searchParams.get("seasonId");
    // v1.0.34 · ПАГИНАЦИЯ: страница от 1, размер 20–200 (дефолт 50).
    // Раньше список молча обрезался на 200 записей — «выдаётся только до
    // буквы К, а Мамонтова не видно»; теперь в ответе total и постранично.
    const officialsOnly = searchParams.get("officials") === "1";
    // v1.0.49 · КОРПУС НАЗНАЧЕНИЙ: ?officials=1 — только кандидаты в
    // бригаду матча (судейский корпус + врач), БЕЗ пагинации (take 500).
    // ГРАБЛИ v1.0.34→49: диалог матча фетчил список персон без параметров
    // и фильтровал судей на клиенте — пагинация (дефолт 50) молча
    // обрезала корпус: при >50 персон в дропдауне «Главный судья»
    // оставались только судьи с фамилиями на первые буквы алфавита
    // («выбрать можно только Алексееву»). Фильтр переносится на сервер —
    // корпус мал по определению, ему пагинация не нужна.
    const page = officialsOnly ? 1 : Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = officialsOnly ? 500 : Math.min(200, Math.max(20, Number(searchParams.get("pageSize")) || 50));
    const skip = officialsOnly ? 0 : (page - 1) * pageSize;

    // ГРАБЛЯ alpine-postgres (locale=C/SQL_ASCII): mode:"insensitive"
    // НЕ складывает кириллицу — «мамонтов» не находил «Мамонтов».
    // Регистр сворачиваем в JS и ищем ПО ВАРИАНТАМ (см. lib/text.ts).
    const variants = caseVariants(q);
    const searchWhere = variants.length
      ? {
          OR: variants.flatMap((v) => [
            { lastName: { contains: v, mode: "insensitive" as const } },
            { firstName: { contains: v, mode: "insensitive" as const } },
            { middleName: { contains: v, mode: "insensitive" as const } },
          ]),
        }
      : {};
    // корпус назначений: isReferee (миграция 05 + normalizeRoles) либо
    // любая легаси-должность в ролях; врач — тоже кандидат (бригада матча)
    const officialsWhere = {
      OR: [
        { isReferee: true },
        { roles: { hasSome: [...MATCH_OFFICIAL_ROLE_CODES] } },
      ],
    };
    const where = officialsOnly
      ? (variants.length ? { AND: [searchWhere, officialsWhere] } : officialsWhere)
      : searchWhere;

    const [persons, total] = await Promise.all([
      db.person.findMany({
        where,
        include: {
          registrations: seasonId ? { where: { seasonId }, include: { team: true } } : { include: { team: true } },
        },
        skip,
        take: pageSize,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
      db.person.count({ where }),
    ]);

    return Response.json({
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
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
    const body = await req.json();

    // ---------- Массовое удаление персон (v1.0.19) ----------
    // Правила те же, что у одиночного DELETE: с cascade удаляются
    // персоны без турнирной истории вместе с заявками; заблокированные
    // (история/дисквалификации) пропускаются с причиной в отчёте.
    if (body.action === "bulk-delete") {
      if (user.role !== "LEAGUE_ADMIN" && user.role !== "SUPER_ADMIN") {
        throw new HttpError(403, "Массовое удаление доступно администраторам лиги");
      }
      const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
      if (ids.length === 0) throw new HttpError(422, "Ничего не выбрано");
      const cascade = !!body.cascade;

      const persons = await db.person.findMany({
        where: { id: { in: ids } },
        include: {
          _count: {
            select: {
              events: true, assists: true, lineups: true, registrations: true,
              suspensions: true, refereedMatches: true, ratingsReceived: true,
            },
          },
        },
      });
      const deleted: string[] = [];
      const blocked: { id: string; label: string; reason: string }[] = [];
      for (const p of persons) {
        const hard =
          p._count.events + p._count.assists + p._count.lineups +
          p._count.suspensions + p._count.refereedMatches + p._count.ratingsReceived;
        if (hard > 0) {
          blocked.push({ id: p.id, label: `${p.lastName} ${p.firstName}`.trim(), reason: "есть турнирная история — используйте Merge профилей" });
          continue;
        }
        if (p._count.registrations > 0 && !cascade) {
          blocked.push({ id: p.id, label: `${p.lastName} ${p.firstName}`.trim(), reason: `заявок ${p._count.registrations} — повторите с каскадом или удалите по одному` });
          continue;
        }
        await db.$transaction(async (tx) => {
          await tx.user.updateMany({ where: { personId: p.id }, data: { personId: null } });
          if (cascade && p._count.registrations > 0) {
            await tx.registration.deleteMany({ where: { personId: p.id } });
          }
          await tx.person.delete({ where: { id: p.id } });
        });
        await audit(user, "Person", p.id, "DELETE", null, { bulk: true, cascade });
        deleted.push(p.id);
      }
      return Response.json({ ok: true, deleted: deleted.length, blocked });
    }

    const { firstName, lastName, middleName, position, birthDate, gender, photoUrl, roles, force } = body;
    if (!firstName || !lastName) throw new HttpError(422, "Укажите имя и фамилию");

    const roleList = normalizeRoles(roles);
    // v1.0.34: карточный конфликт «судья × игрок» разрешён — запрет
    // живёт на уровне сезона (lib/engine/conflicts.ts); узкие должности
    // корпуса normalizeRoles уже перевёл в единый REFEREE

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
  // дубль ищем по ВАРИАНТАМ написания (locale-C-грабля: equals insensitive
  // не складывает кириллицу — «МАМОНТОВ» и «Мамонтов» считались разными)
  const candidates = await db.person.findMany({
    where: {
      AND: [
        { OR: caseVariants(lastName).map((v) => ({ lastName: { equals: v, mode: "insensitive" as const } })) },
        { OR: caseVariants(firstName).map((v) => ({ firstName: { equals: v, mode: "insensitive" as const } })) },
        ...(middleName
          ? [{ OR: caseVariants(middleName).map((v) => ({ middleName: { equals: v, mode: "insensitive" as const } })) }]
          : []),
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
