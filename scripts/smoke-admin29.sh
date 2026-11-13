#!/usr/bin/env bash
# Смоук админки v1.0.29: новые секции «Сайт → Стат-карточки» и
# «Сайт → Виды футбола» (SiteContentPanels) — вход, навигация, рендер.
set -uo pipefail
cd /home/z/my-project
export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/scoresbox_test?schema=public'
export AUTH_SECRET='ci-secret-not-for-production' SHOW_DEMO_ACCOUNTS=1
export SITE_URL='http://localhost:3100' PORT=3100 NODE_ENV=production

bun .next/standalone/server.js > /tmp/scoresbox-admin.log 2>&1 &
SRV=$!
cleanup() { kill $SRV 2>/dev/null; pkill -f "standalone/server.js" 2>/dev/null; }
trap cleanup EXIT
for i in $(seq 1 25); do curl -sf http://localhost:3100/api/health >/dev/null 2>&1 && break; sleep 1; done
echo "==> сервер поднят"

agent-browser set viewport 1440 900 >/dev/null
agent-browser open http://localhost:3100/admin --timeout 30000 >/dev/null
agent-browser wait --load networkidle --timeout 20000 >/dev/null 2>&1
agent-browser wait 1000 >/dev/null

# логин (форма админки)
agent-browser snapshot -i > /tmp/admin-snap.txt 2>&1 || true
EMAIL_REF=$(grep -o '@[a-z0-9]*' /tmp/admin-snap.txt | head -1)
echo "==> первый ref: $EMAIL_REF"
agent-browser find label "Email" fill "admin@ff21.ru" >/dev/null 2>&1 || true
agent-browser find label "Пароль" fill "admin123" >/dev/null 2>&1 || true
agent-browser find role button click --name "Войти" >/dev/null 2>&1 || agent-browser find text "Войти" click >/dev/null 2>&1 || true
agent-browser wait --load networkidle --timeout 15000 >/dev/null 2>&1
agent-browser wait 1500 >/dev/null

NAV=$(agent-browser eval 'document.querySelector("aside")?.innerText.replace(/\\s+/g," ")?.slice(0,300)' --json 2>/dev/null | bun -e 'let s=require("fs").readFileSync(0,"utf8");try{console.log(JSON.parse(s).data?.result??"")}catch{console.log("")}')
echo "NAV: ${NAV:0:200}"

HAS_SECTIONS=$(bun -e 'const t=process.argv[1]; console.log(JSON.stringify({stat:t.includes("Стат-карточки"),fmt:t.includes("Виды футбола"),banners:t.includes("Баннеры сайта")}))' "$NAV")
echo "SECTIONS: $HAS_SECTIONS"

# открываем «Виды футбола» (по ref из снапшота — find text тут не находит
# кнопки с иконкой) и делаем скриншот панели
agent-browser snapshot -i > /tmp/snap29.txt 2>&1 || true
click_ref() { sed 's/.*\[ref=\(@*[a-z0-9]*\)\].*/\1/' <<< "$(grep "$1" /tmp/snap29.txt | head -1)"; }
FMTREF=$(click_ref "Виды футбола")
[ -n "$FMTREF" ] && agent-browser click "@${FMTREF#@}" >/dev/null 2>&1
agent-browser wait 1500 >/dev/null
agent-browser screenshot scripts/smoke-29-admin-formats.png >/dev/null
FMT_PANEL=$(agent-browser eval 'document.querySelector("main")?.innerText.includes("Как это работает")' --json 2>/dev/null | bun -e 'let s=require("fs").readFileSync(0,"utf8");try{console.log(JSON.parse(s).data?.result??"")}catch{console.log("")}')
echo "FMT_PANEL_RENDERED: $FMT_PANEL"
FMT_ROWS=$(agent-browser eval 'document.querySelector("main")?.innerText.includes("Мини-футбол") && document.querySelector("main")?.innerText.includes("FUTSAL")' --json 2>/dev/null | bun -e 'let s=require("fs").readFileSync(0,"utf8");try{console.log(JSON.parse(s).data?.result??"")}catch{console.log("")}')
echo "FMT_ROWS_SEEDED: $FMT_ROWS"

# «Стат-карточки»
SBREF=$(click_ref "Стат-карточки")
[ -n "$SBREF" ] && agent-browser click "@${SBREF#@}" >/dev/null 2>&1
agent-browser wait 1500 >/dev/null
agent-browser screenshot scripts/smoke-29-admin-statblocks.png >/dev/null
SB_PANEL=$(agent-browser eval 'document.querySelector("main")?.innerText.includes("Правая колонка сайта")' --json 2>/dev/null | bun -e 'let s=require("fs").readFileSync(0,"utf8");try{console.log(JSON.parse(s).data?.result??"")}catch{console.log("")}')
echo "SB_PANEL_RENDERED: $SB_PANEL"

agent-browser close >/dev/null 2>&1
echo "==> АДМИН-СМОУК ЗАВЕРШЁН"
