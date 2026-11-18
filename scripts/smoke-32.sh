#!/usr/bin/env bash
# ============================================================
# SCORESBOX · смоук v1.0.32 (локальный, песочница):
#   • каскадный диалог удаления матча (тексты предупреждений);
#   • пользователи: создание БЕЗ пароля (одноразовая ссылка);
#   • безопасность: карта «Смена пароля»;
#   • скоуп-админ (liga2@): нет разделов Сайт/Система, одна лига;
#   • F5: позиция (section) сохраняется через URL.
# ⚠ ГРАБЛЯ agent-browser: ПЕРСИСТЕНТНЫЙ eval-контекст — все
#   multi-statement eval в IIFE; клики — через eval по querySelector.
# ============================================================
set -uo pipefail
cd /home/z/my-project

DB=scoresbox_smoke32
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/${DB}?schema=public"
export AUTH_SECRET='ci-secret-not-for-production'
export SHOW_DEMO_ACCOUNTS=1
export SITE_URL='http://localhost:3100'
export PORT=3100
export NODE_ENV=production

bun scripts/reset-test-db.ts "$DB" >/dev/null
bunx prisma migrate deploy >/dev/null 2>&1
bun prisma/seed.ts >/dev/null 2>&1

bun .next/standalone/server.js > /tmp/scoresbox-smoke32.log 2>&1 &
SRV=$!
cleanup() { kill $SRV 2>/dev/null; pkill -f "standalone/server.js" 2>/dev/null; }
trap cleanup EXIT

for i in $(seq 1 30); do curl -sf http://localhost:3100/api/health >/dev/null 2>&1 && break; sleep 1; done
echo "==> сервер поднят"

js() { agent-browser eval "$1" --json 2>/dev/null | bun -e 'let s=require("fs").readFileSync(0,"utf8");try{console.log(JSON.parse(s).data?.result??"")}catch{console.log("ERR")}'; }

login() {
  # выходим из текущей сессии, если залогинены (кука httpOnly — через кнопку «Выйти»)
  js '(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim().includes("Выйти")); if(b){b.click(); return "logout"} return "no-session" })()' >/dev/null
  agent-browser wait 900 >/dev/null
  agent-browser open http://localhost:3100/admin --timeout 30000 >/dev/null
  agent-browser wait --load networkidle --timeout 20000 >/dev/null 2>&1
  agent-browser wait 900 >/dev/null
  # демо-кнопка по email: одно нажатие (find-label-fill не триггерит
  # React-состояние — controlled input остаётся пустым, submit блокируется)
  js "(() => { const b=[...document.querySelectorAll(\"button\")].find(x=>x.textContent.includes(\"$1\")); if(b){b.click(); return \"demo\"} return \"NF\" })()" >/dev/null
  agent-browser wait --load networkidle --timeout 15000 >/dev/null 2>&1
  agent-browser wait 1600 >/dev/null
  STATE=$(js '(() => document.querySelector("header p")?.textContent?.trim() ?? "NO_SHELL")()')
  echo "  (вход $1 → $STATE)"
}

agent-browser set viewport 1440 900 >/dev/null

FAILS=0
check() { if [ "$2" = "OK" ]; then echo "  ✓ $1"; else echo "  ✗ $1 → $2"; FAILS=$((FAILS+1)); fi; }

echo "==> 1. скоуп-админ liga2@ (демо): навигация и контекст"
login "liga2@ff21.ru" "liga2123"
NAV=$(js '(() => { const t=document.body.innerText; const has=(s)=>t.includes(s)?"1":"0"; return JSON.stringify({site:has("Баннеры сайта"),users:has("Пользователи и доступы")||has("Пользователи"),audit:has("Журнал изменений"),merge:has("Merge профилей")}) })()')
check "нет «Баннеры сайта» (контент сайта)" "$(echo "$NAV" | grep -q '"site":"0"' && echo OK || echo "$NAV")"
check "нет «Пользователи»" "$(echo "$NAV" | grep -q '"users":"0"' && echo OK || echo "$NAV")"
check "нет «Журнал изменений»" "$(echo "$NAV" | grep -q '"audit":"0"' && echo OK || echo "$NAV")"
js '(() => { const M=[...document.querySelectorAll("aside button")].find(b=>b.textContent.trim().startsWith("Протоколы матчей")); if(M){M.click(); return "ok"} return "NF" })()' >/dev/null
agent-browser wait 2500 >/dev/null
LEAGUES=$(js '(() => { const sel=[...document.querySelectorAll("select[aria-label=\"Лига\"]")]; const opts=sel.length?sel[0].options.length:-1; return String(opts) })()')
echo "  (заголовок: $(js '(() => document.querySelector("header p")?.textContent?.trim() ?? "?")()'))"
check "в контексте одна лига (opts=1)" "$( [ "$LEAGUES" = "1" ] && echo OK || echo "opts=$LEAGUES")"

echo "==> 2. супер-админ: диалог удаления матча (каскад)"
login "admin@ff21.ru" "admin123"
js '(() => { const M=[...document.querySelectorAll("aside button")].find(b=>b.textContent.trim().startsWith("Матчи")); if(M){M.click(); return "ok"} return "NF" })()' >/dev/null
agent-browser wait 1500 >/dev/null
DELBTN=$(js '(() => { const b=document.querySelector("button[aria-label=\"Удалить матч\"]"); if(!b) return "NF"; b.click(); return "opened" })()')
check "кнопка удаления на строке матча" "$( [ "$DELBTN" = "opened" ] && echo OK || echo "$DELBTN")"
agent-browser wait 600 >/dev/null
DIALOG=$(js '(() => { const t=document.body.innerText; return JSON.stringify({remove:t.includes("Удалится навсегда (детали матча)"),keep:t.includes("Останутся (мастер-данные)"),btn:t.includes("Удалить безвозвратно")}) })()')
check "диалог: «Удалится навсегда…»" "$(echo "$DIALOG" | grep -q '"remove":true' && echo OK || echo "$DIALOG")"
check "диалог: «Останутся…»" "$(echo "$DIALOG" | grep -q '"keep":true' && echo OK || echo "$DIALOG")"
agent-browser screenshot scripts/smoke-32-delete-dialog.png >/dev/null 2>&1 || true
js '(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Не удалять"); if(b){b.click(); return "closed"} return "NF" })()' >/dev/null

echo "==> 3. пользователи: создание без пароля"
js '(() => { const M=[...document.querySelectorAll("aside button")].find(b=>b.textContent.trim().startsWith("Пользователи")); if(M){M.click(); return "ok"} return "NF" })()' >/dev/null
agent-browser wait 1800 >/dev/null
echo "  (панель: $(js '(() => document.querySelector("header p")?.textContent?.trim() ?? "?")()'))"
CREATE=$(js '(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Пользователь"); if(!b) return "NF"; b.click(); return "opened" })()')
check "диалог создания пользователя" "$( [ "$CREATE" = "opened" ] && echo OK || echo "$CREATE")"
agent-browser wait 600 >/dev/null
NUD=$(js '(() => { const t=document.body.innerText; return JSON.stringify({nopw:t.includes("Пароль (минимум 8"),link:t.includes("одноразовую ссылку"),league:t.includes("Лига (опционально)")}) })()')
check "НЕТ поля ввода пароля" "$(echo "$NUD" | grep -q '"nopw":false' && echo OK || echo "$NUD")"
check "есть уведомление про одноразовую ссылку" "$(echo "$NUD" | grep -q '"link":true' && echo OK || echo "$NUD")"
check "есть выбор лиги (скоуп)" "$(echo "$NUD" | grep -q '"league":true' && echo OK || echo "$NUD")"
agent-browser screenshot scripts/smoke-32-users-create.png >/dev/null 2>&1 || true
js '(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Отмена"); if(b){b.click(); return "closed"} return "NF" })()' >/dev/null

echo "==> 4. безопасность: смена пароля"
js '(() => { const M=[...document.querySelectorAll("aside button")].find(b=>b.textContent.trim().startsWith("Безопасность")); if(M){M.click(); return "ok"} return "NF" })()' >/dev/null
agent-browser wait 1200 >/dev/null
SEC=$(js '(() => { const t=document.body.innerText; return JSON.stringify({card:t.includes("Смена пароля"),cur:t.includes("Текущий пароль"),totpHint:t.includes("одноразовую ссылку")}) })()')
check "карта «Смена пароля»" "$(echo "$SEC" | grep -q '"card":true' && echo OK || echo "$SEC")"
check "поле «Текущий пароль»" "$(echo "$SEC" | grep -q '"cur":true' && echo OK || echo "$SEC")"
agent-browser screenshot scripts/smoke-32-security.png >/dev/null 2>&1 || true

echo "==> 5. F5: позиция сохраняется"
js '(() => { const M=[...document.querySelectorAll("aside button")].find(b=>b.textContent.trim().startsWith("Матчи")); if(M){M.click(); return "ok"} return "NF" })()' >/dev/null
agent-browser wait 1000 >/dev/null
URL1=$(js '(() => location.href)()')
agent-browser open "$URL1" --timeout 20000 >/dev/null
agent-browser wait --load networkidle --timeout 15000 >/dev/null 2>&1
agent-browser wait 1200 >/dev/null
AFTER=$(js '(() => { const h=document.querySelector("header p"); return (h?h.textContent.trim():"") + " | " + location.search })()')
check "после F5 — раздел «Матчи» (URL: section=matches)" "$(echo "$AFTER" | grep -q "Матчи" && echo OK || echo "$AFTER")"

echo ""
if [ $FAILS -eq 0 ]; then echo "ИТОГО: все проверки смоука v1.0.32 прошли"; else echo "ИТОГО: упало проверок: $FAILS"; exit 1; fi
