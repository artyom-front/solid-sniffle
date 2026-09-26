#!/usr/bin/env bash
# ============================================================
# SCORESBOX · смоук редактора протокола после разборки v1.0.30:
#   • вход админом → «Протоколы матчей» → первый матч «К вводу
#     протокола»;
#   • клик по 5 вкладкам, маркеры содержимого (innerText — hidden
#     элементы в него НЕ попадают: проверяем и переключение тоже);
#   • черновик бригады переживает переключение вкладок (hidden-mount);
#   • скриншоты scripts/smoke-30-protocol-*.png.
# ⚠ ГРАБЛЯ agent-browser: eval держит ПЕРСИСТЕНТНЫЙ JS-контекст —
#   top-level `const` живёт между вызовами, повторное объявление =
#   SyntaxError → пустой результат. ВСЕ multi-statement eval — в IIFE!
# БД пересоздаётся (migrate deploy + seed) — детерминизм.
# Использование: bash scripts/smoke-protocol30.sh
# ============================================================
set -uo pipefail
cd /home/z/my-project

DB=scoresbox_smoke30
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/${DB}?schema=public"
export AUTH_SECRET='ci-secret-not-for-production'
export SHOW_DEMO_ACCOUNTS=1
export SITE_URL='http://localhost:3100'
export PORT=3100
export NODE_ENV=production

echo "==> пересоздание БД ${DB} (migrate + seed)"
bun scripts/reset-test-db.ts "$DB" >/dev/null || exit 1
bunx prisma migrate deploy 2>&1 | tail -1 >/dev/null
bun prisma/seed.ts >/dev/null 2>&1

echo "==> запуск standalone-сервера (порт 3100)"
bun .next/standalone/server.js > /tmp/smoke-protocol30.log 2>&1 &
SRV=$!
cleanup() { kill $SRV 2>/dev/null; pkill -f "standalone/server.js" 2>/dev/null; }
trap cleanup EXIT

for i in $(seq 1 30); do curl -sf http://localhost:3100/api/health >/dev/null 2>&1 && break; sleep 1; done
curl -sf http://localhost:3100/api/health | grep -q '"ok":true' || { echo "SERVER FAIL"; exit 1; }
echo "==> сервер поднят"

js() { agent-browser eval "$1" --json 2>/dev/null | bun -e 'let s=require("fs").readFileSync(0,"utf8");try{console.log(JSON.parse(s).data?.result??"")}catch{console.log("ERR")}'; }

agent-browser set viewport 1440 900 >/dev/null
agent-browser open http://localhost:3100/admin --timeout 30000 >/dev/null
agent-browser wait --load networkidle --timeout 20000 >/dev/null 2>&1
agent-browser wait 800 >/dev/null

agent-browser find label "Email" fill "admin@ff21.ru" >/dev/null 2>&1 || true
agent-browser find label "Пароль" fill "admin123" >/dev/null 2>&1 || true
agent-browser find role button click --name "Войти" >/dev/null 2>&1 || agent-browser find text "Войти" click >/dev/null 2>&1 || true
agent-browser wait --load networkidle --timeout 15000 >/dev/null 2>&1
agent-browser wait 1200 >/dev/null
echo "==> залогинен"

# «Протоколы матчей» в сайдбаре
MAT=$(js '(() => { const M=[...document.querySelectorAll("aside button")].find(b => b.textContent.trim().startsWith("Протоколы матчей")); if(M){M.click(); return "clicked"} return "NOT_FOUND" })()')
echo "NAV_PROTOCOL: $MAT"
agent-browser wait --load networkidle --timeout 15000 >/dev/null 2>&1
agent-browser wait 800 >/dev/null

# первый матч из «К вводу протокола»
ROW=$(js '(() => { const hdr=[...document.querySelectorAll("div")].find(d=>d.textContent.trim().startsWith("К вводу протокола")); if(!hdr) return "NO_HEADER"; const box=hdr.closest("div.overflow-hidden")||hdr.parentElement; const btn=box.querySelector("button"); if(!btn) return "NO_BUTTON"; btn.click(); return btn.textContent.replace(/\s+/g," ").slice(0,70); })()')
echo "MATCH_OPENED: $ROW"
agent-browser wait --load networkidle --timeout 15000 >/dev/null 2>&1
agent-browser wait 1500 >/dev/null

# шапка редактора: вкладки на месте
TABS=$(js '(() => [...document.querySelectorAll("button")].map(b=>b.textContent.trim()).filter(t=>/^(Составы|События|Бригада|Файл протокола|Завершение)/.test(t)).join(" | "))()')
echo "TABS: $TABS"

click_tab() { js "(() => { const b=[...document.querySelectorAll(\"button\")].find(x => x.textContent.trim().startsWith(\"$1\")); if(!b) return \"NOT_FOUND\"; b.click(); return \"ok\" })()"; }

# ---------- вкладка Составы (по умолчанию) ----------
agent-browser wait 800 >/dev/null
LU=$(js '(() => { const t=document.querySelector("main").innerText; return JSON.stringify({lineup:/старт\s+\d+\/\d+/.test(t), noFile:!t.includes("Бумажный протокол"), noOfficials:!t.includes("Судейская бригада")}) })()')
echo "TAB_LINEUP: $LU"
agent-browser screenshot scripts/smoke-30-protocol-lineup.png >/dev/null

# ---------- События ----------
click_tab "События" >/dev/null; agent-browser wait 700 >/dev/null
EV=$(js '(() => { const t=document.querySelector("main").innerText; return JSON.stringify({form:t.includes("Добавить событие"), timeline:t.includes("Хронология"), noFile:!t.includes("Бумажный протокол")}) })()')
echo "TAB_EVENTS: $EV"
agent-browser screenshot scripts/smoke-30-protocol-events.png >/dev/null

# ---------- Бригада: +1 строка → переключение вкладок → черновик жив ----------
click_tab "Бригада" >/dev/null; agent-browser wait 700 >/dev/null
OF1=$(js '(() => { const t=document.querySelector("main").innerText; return JSON.stringify({panel:t.includes("Судейская бригада и официальные лица"), addBtn:t.includes("Добавить официальное лицо")}) })()')
echo "TAB_OFFICIALS: $OF1"
agent-browser screenshot scripts/smoke-30-protocol-officials.png >/dev/null

ADDROW=$(js '(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.includes("Добавить официальное лицо")); if(!b) return "NO_BTN"; b.click(); return "added" })()')
echo "DRAFT_ADD: $ADDROW"
agent-browser wait 400 >/dev/null
ROWS1=$(js '(() => { const t=document.querySelector("main").innerText; const n=(t.match(/Сохранить бригаду|Бригада актуальна/g)||[]).length; return JSON.stringify({saveBtn:n>0, dirty:t.includes("Сохранить бригаду")}) })()')
echo "DRAFT_STATE_1: $ROWS1"

# ушли на «События», вернулись — черновик должен сохраниться (hidden-mount)
click_tab "События" >/dev/null; agent-browser wait 500 >/dev/null
click_tab "Бригада" >/dev/null; agent-browser wait 500 >/dev/null
ROWS2=$(js '(() => { const t=document.querySelector("main").innerText; return JSON.stringify({dirty:t.includes("Сохранить бригаду"), hint:t.includes("несохранённые изменения")}) })()')
echo "DRAFT_AFTER_SWITCH: $ROWS2"

# убрать черновую строку (без сохранения — чистый выход)
js '(() => { const b=[...document.querySelectorAll("button[aria-label=\"Убрать из бригады\"]")]; b.pop()?.click(); return "removed" })()' >/dev/null
agent-browser wait 400 >/dev/null

# ---------- Файл протокола ----------
click_tab "Файл протокола" >/dev/null; agent-browser wait 700 >/dev/null
FL=$(js '(() => { const t=document.querySelector("main").innerText; return JSON.stringify({panel:t.includes("Бумажный протокол: скан или фото"), upload:t.includes("Выбрать файл")||t.includes("Загрузка"), noEvents:!t.includes("Добавить событие")}) })()')
echo "TAB_FILE: $FL"
agent-browser screenshot scripts/smoke-30-protocol-file.png >/dev/null

# ---------- Завершение ----------
click_tab "Завершение" >/dev/null; agent-browser wait 700 >/dev/null
FIN=$(js '(() => { const t=document.querySelector("main").innerText; return JSON.stringify({complete:t.includes("Завершение матча"), wo:t.includes("Техническое поражение"), btn:t.includes("Завершить матч"), noFile:!t.includes("Бумажный протокол")}) })()')
echo "TAB_FINISH: $FIN"
agent-browser screenshot scripts/smoke-30-protocol-finish.png >/dev/null

agent-browser close >/dev/null 2>&1
echo "==> СМОУК ЗАВЕРШЁН"
