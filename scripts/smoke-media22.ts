// SMOKE v1.0.22 · Этап 1: sharp 0.35.4 внутри живого standalone-сервера.
// Полный цикл media-аплоада: PNG (1600x1200) -> /api/admin/media ->
// WebP <=1200px в БД -> GET /api/media/[id] -> DELETE (уборка).
// Запуск: bun scripts/smoke-media22.ts (нужен сервер :3000).
export {};

const BASE = "http://127.0.0.1:3000";
let pass = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name} ${extra}`); }
}

// 1. Тестовый PNG 1600x1200 (больше 1200px — проверим ресайз) через сам sharp
const sharp = (await import("sharp")).default;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200">
  <rect width="100%" height="100%" fill="#1a5c2e"/>
  <circle cx="800" cy="600" r="300" fill="#f4d35e"/>
  <text x="800" y="640" font-size="120" fill="#111" text-anchor="middle">SMOKE 22</text>
</svg>`;
const png = await sharp(Buffer.from(svg)).png().toBuffer();
console.log(`PNG: ${png.length} bytes, ${sharp(png).info ? "" : ""}1600x1200`);

// 2. Логин SUPER_ADMIN
const loginResp = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "admin@ff21.ru", password: "admin123" }),
});
const cookie = (loginResp.headers.get("set-cookie") || "").split(";")[0];
check("логин admin", loginResp.status === 200 && !!cookie, `status=${loginResp.status}`);

// 3. Multipart-аплоад
const form = new FormData();
form.append("file", new Blob([png], { type: "image/png" }), "smoke22.png");
const upResp = await fetch(`${BASE}/api/admin/media`, { method: "POST", headers: { cookie }, body: form });
const upJson = await upResp.json().catch(() => ({}));
check("POST /api/admin/media -> 200", upResp.status === 200, `status=${upResp.status} body=${JSON.stringify(upJson).slice(0, 200)}`);
check("mime = image/webp", upJson.mime === "image/webp", `mime=${upJson.mime}`);
check("размер уменьшился (WebP)", typeof upJson.size === "number" && upJson.size > 0 && upJson.size < png.length, `size=${upJson.size}`);
const mediaId: string | undefined = upJson.id;

// 4. Читаем назад: immutable-кэш + webp-контент
if (mediaId) {
  const getResp = await fetch(`${BASE}/api/media/${mediaId}`);
  check("GET /api/media/[id] -> 200", getResp.status === 200, `status=${getResp.status}`);
  check("content-type image/webp", (getResp.headers.get("content-type") || "").includes("image/webp"));
  const buf = Buffer.from(await getResp.arrayBuffer());
  const meta = await sharp(buf).metadata();
  check("WebP валиден, <=1200px", meta.format === "webp" && (meta.width || 0) <= 1200 && (meta.height || 0) <= 1200,
    `format=${meta.format} ${meta.width}x${meta.height}`);

  // 5. Уборка
  const delResp = await fetch(`${BASE}/api/admin/media?url=/api/media/${mediaId}`, { method: "DELETE", headers: { cookie } });
  check("DELETE media (уборка)", delResp.status === 200, `status=${delResp.status}`);
} else {
  check("media id получен", false, "нет id — пропуск GET/DELETE");
}

console.log(`\n== Итог: ${pass} ok, ${fails.length} FAIL ==`);
process.exit(fails.length ? 1 : 0);
