// СМОК v1.0.56 (фидбек 2026-11-13): «фото игроков и клубов не видны
// на клиенте» + «проверь добавление видео, фото и прочих медиа».
//
// Проверяет ПОЛНУЮ цепочку: аплоад → поле сущности → публичный API →
// SSR-HTML страницы (фото/лого реально рендерятся), плюс видео:
// аплоад mp4 → раздача с Accept-Ranges/206.
//
// Запуск: npx tsx scripts/smoke56.ts (dev-сервер на :3000 должен стоять)

import { deflateSync } from "node:zlib";

const BASE = "http://localhost:3000";

async function j<T = any>(r: Response): Promise<T> {
  return (await r.json()) as T;
}

/** Мини-PNG 64×64 (красный квадрат) — собирается вручную (chunk+CRC) */
function makePng(): Buffer {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crcBuf]);
  };
  const W = 64,
    H = 64;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    const off = y * (1 + W * 3) + 1;
    for (let x = 0; x < W * 3; x += 3) {
      raw[off + x] = 200;
      raw[off + x + 1] = 30;
      raw[off + x + 2] = 40;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function main() {
  const results: { name: string; ok: boolean; note: string }[] = [];
  const check = (name: string, ok: boolean, note = "") => {
    results.push({ name, ok, note });
    console.log(`${ok ? "✅" : "❌"} ${name}${note ? ` — ${note}` : ""}`);
  };

  const png = makePng();

  // ---------- 1. логин ----------
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@ff21.ru", password: "admin123" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  check("логин SUPER_ADMIN", login.ok, (await j(login)).email ?? "");

  const auth = { cookie };

  // ---------- 2. аплоад фото ----------
  const fd = new FormData();
  fd.append("file", new Blob([png], { type: "image/png" }), "smoke.png");
  const up = await fetch(`${BASE}/api/admin/media`, { method: "POST", headers: auth, body: fd });
  const media = await j(up);
  check("аплоад фото → Media", up.ok && media.url?.startsWith("/api/media/"), media.url ?? media.error ?? "");

  // фото реально раздаётся
  const served = await fetch(`${BASE}${media.url}`);
  check("фото раздаётся /api/media/<id>", served.ok && served.headers.get("content-type") === "image/webp", `size=${served.headers.get("content-length")}`);

  // ---------- 3. фото → игроку, лого → клубу ----------
  const persons = await j(await fetch(`${BASE}/api/admin/persons`, { headers: auth }));
  const person = (persons.persons ?? [])[0];
  const clubs = await j(await fetch(`${BASE}/api/admin/clubs`, { headers: auth }));
  const club = (clubs.clubs ?? [])[0];
  console.log("person:", person?.id, person?.lastName, "| club:", club?.id, club?.name, "| teams:", JSON.stringify(club?.teams?.map((t: any) => t.id)));

  const patchPerson = await fetch(`${BASE}/api/admin/persons/${person.id}`, {
    method: "PATCH",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ photoUrl: media.url }),
  });
  const pr = await j(patchPerson);
  check("фото записано игроку", patchPerson.ok && pr.person?.photoUrl === media.url, person.lastName ?? "");

  const patchClub = await fetch(`${BASE}/api/admin/clubs/${club.id}`, {
    method: "PATCH",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ logoUrl: media.url }),
  });
  const cr = await j(patchClub);
  check("лого записано клубу", patchClub.ok && cr.club?.logoUrl === media.url, club.name ?? "");

  // ---------- 4. публичный API отдаёт медиа ----------
  const pp = await j(await fetch(`${BASE}/api/public/players/${person.id}`));
  check("публичный профиль игрока → photoUrl", pp.player?.photoUrl === media.url);

  const teamOfClub = club.teams?.[0]?.id;
  if (teamOfClub) {
    const tp = await j(await fetch(`${BASE}/api/public/teams/${teamOfClub}`));
    // лого у команды нет → фолбэк на лого КЛУБА (ядро бага v1.0.55)
    check("профиль команды → лого клуба (фолбэк)", tp.team?.logoUrl === media.url, tp.team?.name ?? "");
  }

  // ---------- 5. SSR-страницы содержат рендер медиа ----------
  const playerHtml = await (await fetch(`${BASE}/player/${person.id}`)).text();
  check("SSR /player → <img> с фото", playerHtml.includes(media.url as string));

  if (teamOfClub) {
    const teamHtml = await (await fetch(`${BASE}/team/${teamOfClub}`)).text();
    check("SSR /team → <img> с лого", teamHtml.includes(media.url as string));
  }

  // таблица сезона: лого клуба у команды (клиент тянет /api/public/standings)
  const seasons = await j(await fetch(`${BASE}/api/public/overview`));
  const league = seasons.leagues?.[0];
  if (league?.seasons?.[0]) {
    const st = await j(await fetch(`${BASE}/api/public/standings?seasonId=${league.seasons[0].id}`));
    const withLogo = (st.standings ?? []).some((r: any) => r.logoUrl);
    check("таблица сезона → logoUrl в DTO (вкладка «Таблица»)", withLogo);
  }

  // ---------- 6. видео: аплоад mp4 + Range ----------
  // крошечный валидный mp4 (ftyp-бокс, 1 байт payload) — сервер не
  // пережимает видео, кладёт как есть
  const mp4 = Buffer.from("000000186674797069736f6d0000000069736f6d000000", "hex");
  const fdv = new FormData();
  fdv.append("file", new Blob([mp4], { type: "video/mp4" }), "smoke.mp4");
  const upv = await fetch(`${BASE}/api/admin/media`, { method: "POST", headers: auth, body: fdv });
  const videoMedia = await j(upv);
  check("аплоад видео → Media", upv.ok && videoMedia.url?.startsWith("/api/media/"), videoMedia.mime ?? videoMedia.error ?? "");

  const head = await fetch(`${BASE}${videoMedia.url}`, { headers: { range: "bytes=0-9" } });
  check("видео: Range → 206 + Accept-Ranges", head.status === 206 && (head.headers.get("content-range") ?? "").startsWith("bytes 0-9/"), head.headers.get("content-range") ?? "");

  const full = await fetch(`${BASE}${videoMedia.url}`);
  check("видео: полный GET → 200 video/mp4", full.ok && full.headers.get("content-type") === "video/mp4");

  // ---------- 7. видео в стат-карточке (правая колонка) ----------
  const sb = await fetch(`${BASE}/api/admin/statblocks`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "СМОК видео",
      text: "smoke56",
      imageUrl: videoMedia.url,
      isActive: false, // не светим на сайте
      priority: 100,
    }),
  });
  const sbj = await j(sb);
  check("стат-карточка с видео создана", sb.ok && sbj.statBlock?.imageUrl === videoMedia.url);
  if (sbj.statBlock?.id) {
    await fetch(`${BASE}/api/admin/statblocks/${sbj.statBlock.id}`, { method: "DELETE", headers: auth });
  }

  // ---------- ИТОГ ----------
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} проверок пройдено`);
  if (failed.length) {
    console.log("ПРОВАЛЫ:");
    failed.forEach((f) => console.log(`  ✗ ${f.name} — ${f.note}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("СМОК упал:", e);
  process.exit(1);
});
