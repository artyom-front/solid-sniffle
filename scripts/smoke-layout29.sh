#!/usr/bin/env bash
# ============================================================
# SCORESBOX · смоук лэйаута v1.0.29 (локальный, песочница):
#   • стартует прод-сервер на тестовой БД (порт 3100);
#   • логинится админом, создаёт тестовые сущности:
#     - стат-карточку с картинкой (правая колонка, фикс. 120px);
#     - баннер LEFT_TOP (левая колонка, над списком лиг);
#   • agent-browser: 1920px (три колонки: слева ЛИГИ, справа
#     СТАТИСТИКА+ТАБЛИЦА) и 1280px (одна колонка);
#   • проверяет геометрию: left.x < center.x < right.x;
#   • скриншоты в scripts/smoke-29-*.png.
# Использование: bash scripts/smoke-layout29.sh
# ============================================================
set -uo pipefail
cd /home/z/my-project

export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/scoresbox_test?schema=public'
export AUTH_SECRET='ci-secret-not-for-production'
export SHOW_DEMO_ACCOUNTS=1
export SITE_URL='http://localhost:3100'
export PORT=3100
export NODE_ENV=production

bun .next/standalone/server.js > /tmp/scoresbox-smoke.log 2>&1 &
SRV=$!

cleanup() { kill $SRV 2>/dev/null; pkill -f "standalone/server.js" 2>/dev/null; }
trap cleanup EXIT

for i in $(seq 1 25); do curl -sf http://localhost:3100/api/health >/dev/null 2>&1 && break; sleep 1; done
echo "==> сервер поднят"

# ---------- тестовые сущности через админ-API ----------
COOKIE=$(curl -s -i -X POST http://localhost:3100/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@ff21.ru","password":"admin123"}' | grep -i '^set-cookie' | head -1 | sed 's/[Ss]et-[Cc]ookie: //' | cut -d';' -f1)
echo "==> cookie: ${COOKIE:0:24}…"

SB=$(curl -s -X POST http://localhost:3100/api/admin/statblocks \
  -H 'Content-Type: application/json' -H "Cookie: $COOKIE" \
  -d '{"title":"Бомбардир тура","value":"12","text":"голов · Артемьев («Атал»)","imageUrl":"/icon.svg","imageFit":"cover","priority":1}')
SB_ID=$(echo "$SB" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "==> стат-карточка: ${SB_ID:0:10}…"

BN=$(curl -s -X POST http://localhost:3100/api/admin/banners \
  -H 'Content-Type: application/json' -H "Cookie: $COOKIE" \
  -d '{"placement":"LEFT_TOP","title":"Тест левой колонки","text":"реклама над списком лиг","priority":1}')
BN_ID=$(echo "$BN" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "==> баннер LEFT_TOP: ${BN_ID:0:10}…"

# ---------- 1920px: три колонки ----------
agent-browser set viewport 1920 1080
agent-browser open http://localhost:3100/ --timeout 30000 >/dev/null
agent-browser wait --load networkidle --timeout 20000 >/dev/null 2>&1
agent-browser wait 1500 >/dev/null

agent-browser screenshot scripts/smoke-29-home-1920.png >/dev/null
echo "==> скриншот 1920px сохранён"

agent-browser eval '(() => {
  const asides = document.querySelectorAll("main div.grid > aside");
  const a = asides[0]?.getBoundingClientRect();
  const b = asides[1]?.getBoundingClientRect();
  const center = document.querySelector("main div.grid > div.max-w-\\[800px\\]")?.getBoundingClientRect();
  return JSON.stringify({
    asideCount: asides.length,
    leftX: Math.round(a?.x ?? -1), rightX: Math.round(b?.x ?? -1), centerX: Math.round(center?.x ?? -1),
    leftW: Math.round(a?.width ?? 0), rightW: Math.round(b?.width ?? 0), centerW: Math.round(center?.width ?? 0),
    leftHasLeagues: asides[0]?.textContent.includes("Топ-лиги"),
    rightHasTable: asides[1]?.textContent.includes("Турнирная таблица"),
    rightHasStatCard: asides[1]?.textContent.includes("Бомбардир тура"),
    rightHasTopPlayers: asides[1]?.textContent.includes("Топ игроков"),
    leftHasBanner: asides[0]?.textContent.includes("Тест левой колонки"),
    statCardH: document.querySelector("a.h-\\[120px\\], div.h-\\[120px\\]")?.getBoundingClientRect().height ?? null,
    centerNoTable: !(center?.textContent || "").includes("Турнирная таблица"),
  });
})()' --json > /tmp/geo1920.json 2>/dev/null
GEO1920=$(bun -e 'const j=JSON.parse(require("fs").readFileSync("/tmp/geo1920.json","utf8")); console.log(j.result ?? JSON.stringify(j))' 2>/dev/null)
echo "GEO1920: $GEO1920"

# ---------- 1280px: одна колонка ----------
agent-browser set viewport 1280 900
agent-browser wait 800 >/dev/null
agent-browser screenshot scripts/smoke-29-home-1280.png >/dev/null
echo "==> скриншот 1280px сохранён"

GEO1280=$(agent-browser eval '(() => {
  const visible = [...document.querySelectorAll("main aside")].filter(a => a.offsetParent !== null);
  const gridShowcase = document.querySelector("main div.grid > div section");
  return JSON.stringify({
    visibleAsides: visible.length,
    showcaseHasTable: gridShowcase?.textContent.includes("Турнирная таблица") ?? false,
    detailsLeagues: !!document.querySelector("main details"),
  });
})()' --json > /tmp/geo1280.json 2>/dev/null; bun -e 'const j=JSON.parse(require("fs").readFileSync("/tmp/geo1280.json","utf8")); console.log(j.result ?? JSON.stringify(j))' 2>/dev/null)
echo "GEO1280: $GEO1280"

# ---------- формат-меню: динамические ссылки ----------
FMT=$(agent-browser eval 'document.querySelector("nav[aria-label=\\"Виды футбола\\"]")?.innerText.replace(/\\s+/g, " ").trim()' --json > /tmp/fmt.json 2>/dev/null; bun -e 'const j=JSON.parse(require("fs").readFileSync("/tmp/fmt.json","utf8")); console.log(j.result ?? "")' 2>/dev/null)
echo "FORMATNAV: $FMT"

# ---------- карточка матча: города вместо «хозяева/гости» ----------
MATCH_HREF=$(agent-browser eval 'document.querySelector("main a[href^=\\"/match/\\"]")?.getAttribute("href")' --json > /tmp/mh.json 2>/dev/null; bun -e 'const j=JSON.parse(require("fs").readFileSync("/tmp/mh.json","utf8")); console.log(j.result ?? "")' 2>/dev/null)
echo "MATCH: $MATCH_HREF"
if [ -n "${MATCH_HREF//\"/}" ] && [ "$MATCH_HREF" != "" ]; then
  agent-browser open "http://localhost:3100${MATCH_HREF//\"/}" --timeout 30000 >/dev/null 2>&1 || true
  agent-browser wait --load networkidle --timeout 15000 >/dev/null 2>&1
  agent-browser wait 1200 >/dev/null 2>&1
  agent-browser screenshot scripts/smoke-29-match.png >/dev/null 2>&1
  MATCHCHECK=$(agent-browser eval '(() => {
    const t = document.body.innerText;
    return JSON.stringify({
      noHostGuest: !t.includes("хозяева") && !t.includes("гости"),
      hasCities: ["Шумерля","Алатырь","Чебоксары","Новочебоксарск","Канаш"].some(c => t.includes(c)),
    });
  })()' --json > /tmp/mc.json 2>/dev/null; bun -e 'const j=JSON.parse(require("fs").readFileSync("/tmp/mc.json","utf8")); console.log(j.result ?? "")' 2>/dev/null)
  echo "MATCHCHECK: $MATCHCHECK"
  echo "==> скриншот карточки матча сохранён"
fi

# ---------- уборка тестовых сущностей ----------
[ -n "$SB_ID" ] && curl -s -X DELETE "http://localhost:3100/api/admin/statblocks/$SB_ID" -H "Cookie: $COOKIE" >/dev/null
[ -n "$BN_ID" ] && curl -s -X DELETE "http://localhost:3100/api/admin/banners/$BN_ID" -H "Cookie: $COOKIE" >/dev/null
echo "==> тестовые сущности удалены"

agent-browser close >/dev/null 2>&1
echo "==> СМОУК ЗАВЕРШЁН"
