// ============================================================
// Массовый импорт из CSV/текст (вставка или загрузка файла).
// Сущности: players (заявка команды), persons, teams, stadiums, clubs.
//
// Принципы:
//  • Идемпотентность: повторный импорт тех же строк НЕ создаёт дублей —
//    существующие сущности находятся по естественному ключу
//    (персона: ФИО+дата рождения; команда/клуб/стадион: название).
//  • dryRun: полная проверка без записи (транзакция + rollback).
//  • Разделители: ; , или таб. Заголовок — русские/английские алиасы.
// ============================================================

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { normalizeRoles, refereeFromRoles } from "@/lib/roles";
import type { Prisma } from "@prisma/client";

type Row = Record<string, string>;

export async function POST(req: Request) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { entity, csv, dryRun, teamId, seasonId, closePrevious } = await req.json();
    if (typeof csv !== "string" || !csv.trim()) throw new HttpError(422, "Пустые данные");
    if (!["players", "persons", "teams", "stadiums", "clubs"].includes(entity)) {
      throw new HttpError(422, "Неизвестный тип импорта");
    }

    let season: { id: string; startDate: Date } | null = null;
    let team: { id: string; name: string } | null = null;
    if (entity === "players") {
      if (!teamId || !seasonId) throw new HttpError(422, "Для импорта заявки укажите команду и сезон");
      team = await db.team.findUnique({ where: { id: teamId }, select: { id: true, name: true } });
      season = await db.season.findUnique({ where: { id: seasonId }, select: { id: true, startDate: true } });
      if (!team || !season) throw new HttpError(404, "Команда или сезон не найдены");
    }

    // ---------- разбор CSV ----------
    const { header, rows } = parseCsv(csv);
    if (rows.length === 0) throw new HttpError(422, "Не найдено ни одной строки с данными");
    if (rows.length > 2000) throw new HttpError(422, "Слишком много строк (максимум 2000 за раз)");

    const col = (r: Row, aliases: string[]): string => {
      for (const a of aliases) {
        const key = header.find((h) => h === a);
        if (key && r[key] != null) return r[key].trim();
      }
      // точный алиас не найден — ищем по началу названия колонки
      for (const a of aliases) {
        const key = Object.keys(r).find((h) => h.toLowerCase().startsWith(a.toLowerCase()));
        if (key) return (r[key] ?? "").trim();
      }
      return "";
    };

    const report: { row: number; status: string; name: string; message?: string }[] = [];

    // ---------- применение (в транзакции; dryRun = rollback) ----------
    const ROLLBACK = Symbol("dry-run-rollback");
    let summary = { created: 0, updated: 0, exists: 0, errors: 0 };

    await db
      .$transaction(
        async (tx) => {
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const rowNo = i + 2; // + заголовок, нумерация с 1
            try {
              const res = await importRow(tx, entity, r, col, {
                teamId: team?.id ?? null,
                seasonId: season?.id ?? null,
                seasonStart: season?.startDate ?? new Date(),
                closePrevious: !!closePrevious,
              });
              report.push({ row: rowNo, status: res.status, name: res.name, message: res.message });
              summary[res.status === "error" ? "errors" : res.status === "created" ? "created" : res.status === "updated" ? "updated" : "exists"]++;
            } catch (e) {
              const message = e instanceof HttpError ? e.message : e instanceof Error ? e.message : "Ошибка строки";
              report.push({ row: rowNo, status: "error", name: col(r, ["фамилия", "название", "lastname", "name"]), message });
              summary.errors++;
            }
          }
          if (dryRun) throw ROLLBACK;
        },
        { timeout: 60000, maxWait: 10000 }
      )
      .catch((e: unknown) => {
        if (e !== ROLLBACK) throw e;
      });

    const ok = summary.errors === 0;
    return Response.json({
      ok,
      dryRun: !!dryRun,
      total: rows.length,
      ...summary,
      rows: report,
      team: team?.name ?? null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";

// ============================================================
// Импорт одной строки. Возвращает статус для отчёта.
// ============================================================

async function importRow(
  tx: Prisma.TransactionClient,
  entity: string,
  r: Row,
  col: (r: Row, aliases: string[]) => string,
  ctx: { teamId: string | null; seasonId: string | null; seasonStart: Date; closePrevious: boolean }
): Promise<{ status: "created" | "updated" | "exists" | "error"; name: string; message?: string }> {
  if (entity === "teams") {
    const name = col(r, ["название", "команда", "name", "team"]);
    if (!name) throw new HttpError(422, "Пустое название команды");
    const city = col(r, ["город", "city"]);
    const clubName = col(r, ["клуб", "club"]);
    const existing = await tx.team.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (existing) return { status: "exists", name, message: "команда уже существует" };
    let clubId: string | null = null;
    if (clubName) {
      const club = await tx.club.findFirst({ where: { name: { equals: clubName, mode: "insensitive" } } });
      clubId = club
        ? club.id
        : (await tx.club.create({ data: { name: clubName, city: city || null } })).id;
    }
    await tx.team.create({ data: { name, city: city || null, clubId } });
    return { status: "created", name };
  }

  if (entity === "stadiums") {
    const name = col(r, ["название", "name", "стадион"]);
    if (!name) throw new HttpError(422, "Пустое название стадиона");
    const existing = await tx.stadium.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (existing) return { status: "exists", name, message: "стадион уже существует" };
    const city = col(r, ["город", "city"]);
    const address = col(r, ["адрес", "address"]);
    const capacity = parseInt(col(r, ["вместимость", "capacity"]), 10);
    await tx.stadium.create({
      data: { name, city: city || null, address: address || null, capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : null },
    });
    return { status: "created", name };
  }

  if (entity === "clubs") {
    const name = col(r, ["название", "клуб", "name"]);
    if (!name) throw new HttpError(422, "Пустое название клуба");
    const existing = await tx.club.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (existing) return { status: "exists", name, message: "клуб уже существует" };
    const city = col(r, ["город", "city"]);
    const description = col(r, ["описание", "description"]);
    await tx.club.create({ data: { name, city: city || null, description: description || null } });
    return { status: "created", name };
  }

  // ---------- persons / players: общая персона ----------
  const lastName = col(r, ["фамилия", "lastname"]);
  const firstName = col(r, ["имя", "firstname"]);
  const middleName = col(r, ["отчество", "middlename"]);
  if (!lastName || !firstName) throw new HttpError(422, "Нужны фамилия и имя");

  const birthDateRaw = col(r, ["дата", "др", "birthdate"]);
  const birthDate = parseDate(birthDateRaw);
  const position = parsePosition(col(r, ["позиция", "position", "амплуа"]));
  const gender = parseGender(col(r, ["пол", "gender"]));
  const roles = parseRolesField(col(r, ["роль", "roles", "role"]));
  // персона без явной роли в справочнике — игрок; в заявке — тоже игрок по умолчанию
  if (roles.length === 0 && entity === "persons") roles.push("PLAYER");
  if (roles.length === 0 && entity === "players") roles.push("PLAYER");

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  // ключ дедупликации: ФИО (без учёта регистра) + дата рождения, если указана
  const sameFio = await tx.person.findMany({
    where: {
      AND: [
        { lastName: { equals: norm(lastName), mode: "insensitive" as const } },
        { firstName: { equals: norm(firstName), mode: "insensitive" as const } },
        ...(middleName ? [{ middleName: { equals: norm(middleName), mode: "insensitive" as const } }] : []),
        ...(birthDate ? [{ birthDate }] : []),
      ],
    },
    take: 1,
  });
  let person: { id: string; birthDate: Date | null; position: string | null; gender: string | null; roles: string[]; middleName: string | null } | null = sameFio[0] ?? null;
  let personStatus: "created" | "updated" | "exists";

  if (person) {
    // дополним пустые поля — идемпотентное обновление
    const patch: Prisma.PersonUpdateInput = {};
    let changed = false;
    if (!person.birthDate && birthDate) { patch.birthDate = birthDate; changed = true; }
    if (!person.position && position) { patch.position = position; changed = true; }
    if (!person.gender && gender) { patch.gender = gender; changed = true; }
    const mergedRoles = [...new Set([...person.roles, ...roles])];
    if (mergedRoles.length !== person.roles.length) { patch.roles = mergedRoles; patch.isReferee = refereeFromRoles(mergedRoles); changed = true; }
    if (!person.middleName && middleName) { patch.middleName = middleName; changed = true; }
    if (changed) await tx.person.update({ where: { id: person.id }, data: patch });
    personStatus = changed ? "updated" : "exists";
  } else {
    person = await tx.person.create({
      data: {
        firstName, lastName, middleName: middleName || null,
        birthDate: birthDate ?? null,
        position: position || null,
        gender: gender || null,
        roles,
        isReferee: refereeFromRoles(roles),
      },
    });
    personStatus = "created";
  }

  const fullName = `${lastName} ${firstName} ${middleName}`.trim();

  if (entity === "persons") {
    return { status: personStatus, name: fullName, message: personStatus === "exists" ? "персона уже была" : undefined };
  }

  // ---------- players: заявка на сезон ----------
  const numberRaw = col(r, ["номер", "number", "№"]);
  const number = parseInt(numberRaw, 10);
  const regRole = roles.includes("PLAYER") ? "PLAYER" : roles[0];

  const existingReg = await tx.registration.findUnique({
    where: { personId_teamId_seasonId: { personId: person.id, teamId: ctx.teamId!, seasonId: ctx.seasonId! } },
  });
  if (existingReg) {
    // обновим номер, если передан и отличается
    if (Number.isFinite(number) && number > 0 && existingReg.number !== number) {
      await tx.registration.update({ where: { id: existingReg.id }, data: { number } });
      return { status: "updated", name: fullName, message: "номер в заявке обновлён" };
    }
    return { status: "exists", name: fullName, message: "уже в заявке" };
  }

  // закрываем предыдущую активную заявку (трансфер), если попросили
  let transferNote: string | undefined;
  if (ctx.closePrevious) {
    const closed = await tx.registration.updateMany({
      where: { personId: person.id, seasonId: ctx.seasonId!, status: "ACTIVE", endDate: null },
      data: { endDate: new Date(), status: "ENDED" },
    });
    if (closed.count > 0) transferNote = "предыдущая заявка закрыта (трансфер)";
  } else {
    const active = await tx.registration.findFirst({
      where: { personId: person.id, seasonId: ctx.seasonId!, status: "ACTIVE", endDate: null },
      include: { team: { select: { name: true } } },
    });
    if (active) transferNote = `уже заявлен за «${active.team.name}» — создана вторая заявка`;
  }

  await tx.registration.create({
    data: {
      personId: person.id,
      teamId: ctx.teamId!,
      seasonId: ctx.seasonId!,
      startDate: ctx.seasonStart,
      number: Number.isFinite(number) && number > 0 ? number : null,
      role: regRole,
      status: "ACTIVE",
    },
  });

  return { status: "created", name: fullName, message: transferNote };
}

// ============================================================
// CSV-парсер: BOM, CRLF, кавычки, авто-разделитель (; , таб)
// ============================================================

function parseCsv(csv: string): { header: string[]; rows: Row[] } {
  const text = csv.replace(/^\uFEFF/, "").trim();
  if (!text) return { header: [], rows: [] };
  const lines: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ";" || ch === "," || ch === "\t") { row.push(field); field = ""; continue; }
    if (ch === "\n") { row.push(field); field = ""; lines.push(row); row = []; continue; }
    if (ch === "\r") continue;
    field += ch;
  }
  if (field || row.length > 0) { row.push(field); lines.push(row); }

  const nonEmpty = lines.filter((l) => l.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) return { header: [], rows: [] };

  const header = nonEmpty[0].map((h) => h.trim().toLowerCase());
  const rows: Row[] = [];
  for (const line of nonEmpty.slice(1)) {
    const obj: Row = {};
    header.forEach((h, idx) => { obj[h] = (line[idx] ?? "").trim(); });
    rows.push(obj);
  }
  return { header, rows };
}

// ============================================================
// Нормализация значений
// ============================================================

function parseDate(v: string): Date | null {
  if (!v) return null;
  const clean = v.trim().replace(/\s+/g, "");
  let d: number | null = null, m: number | null = null, y: number | null = null;
  let match: RegExpMatchArray | null;
  if ((match = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else if ((match = clean.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/))) {
    d = +match[1]; m = +match[2]; y = +match[3];
    if (y < 100) y += y > 30 ? 1900 : 2000;
  }
  if (d == null || m == null || y == null) return null;
  if (y < 1900 || y > new Date().getFullYear() || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePosition(v: string): string | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (/^(gk|вр|врат)/.test(s)) return "GK";
  if (/^(df|защ|sw|cb|lb|rb)/.test(s)) return "DF";
  if (/^(mf|пз|полузащ|dm|cm|am|lm|rm)/.test(s)) return "MF";
  if (/^(fw|нап|st|cf|lw|rw)/.test(s)) return "FW";
  return null;
}

function parseGender(v: string): string | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (/^(м|муж|male|m)$/i.test(s)) return "MALE";
  if (/^(ж|жен|female|f)$/i.test(s)) return "FEMALE";
  return null;
}

/** Роль из текста: «игрок», «судья», «тренер», VAR… или системный код */
function parseRolesField(v: string): string[] {
  if (!v.trim()) return [];
  const parts = v.split(/[,;+\/]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const code = ROLE_ALIASES[p];
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

const ROLE_ALIASES: Record<string, string> = {
  "игрок": "PLAYER", "player": "PLAYER",
  "тренер": "COACH", "главный тренер": "COACH", "гл. тренер": "COACH", "coach": "COACH", "head coach": "COACH",
  "помощник тренера": "ASSISTANT_COACH", "ассистент тренера": "ASSISTANT_COACH", "assistant coach": "ASSISTANT_COACH",
  "тренер вратарей": "GOALKEEPER_COACH", "goalkeeper coach": "GOALKEEPER_COACH",
  "физподготовка": "FITNESS_COACH", "тренер по физподготовке": "FITNESS_COACH", "fitness coach": "FITNESS_COACH",
  "судья": "REFEREE", "арбитр": "REFEREE", "referee": "REFEREE",
  "помощник судьи": "ASSISTANT_REFEREE", "ассистент судьи": "ASSISTANT_REFEREE", "лайнсмен": "ASSISTANT_REFEREE", "assistant referee": "ASSISTANT_REFEREE",
  "резервный судья": "FOURTH_OFFICIAL", "fourth official": "FOURTH_OFFICIAL",
  "var": "VAR", "var-судья": "VAR", "главный var": "VAR",
  "avar": "AVAR", "помощник var": "AVAR",
  "инспектор": "INSPECTOR", "инспектор матча": "INSPECTOR", "ассессор": "INSPECTOR",
  "делегат": "DELEGATE", "делегат матча": "DELEGATE", "delegate": "DELEGATE",
  "администратор": "ADMINISTRATOR", "администратор команды": "ADMINISTRATOR", "administrator": "ADMINISTRATOR",
  "врач": "DOCTOR", "doctor": "DOCTOR",
  "массажист": "MASSEUR", "masseur": "MASSEUR",
  "президент": "PRESIDENT", "председатель": "PRESIDENT", "president": "PRESIDENT",
  "пресс-атташе": "PRESS_OFFICER", "прессатташе": "PRESS_OFFICER",
  "менеджер": "GENERAL_MANAGER", "генеральный менеджер": "GENERAL_MANAGER",
};

// normalizeRoles реэкспортируем для потенциального переиспользования
export { normalizeRoles };
