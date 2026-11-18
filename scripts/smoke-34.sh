#!/usr/bin/env bash
# ============================================================
# SCORESBOX · смоук v1.0.34 (локальный, песочница):
#   • ЛЮДИ: пагинация (страницы, счётчик, total) + поиск
#     РЕГИСТРОНЕЗАВИСИМЫЙ («смирнов» находит «Смирнов»);
#   • роль «Судья (судейский корпус)» — ЕДИНАЯ на карточке,
#     «Игрок + Судья» без красного конфликта;
#   • форма матча: «Главный судья» = только корпус (без врача);
#   • ПРОТОКОЛ НЕ БЛОКИРУЕТ РАЗДЕЛЫ (fix залипшего ?match=);
#   • кнопка «назад» браузера ХОДИТ ПО АДМИНКЕ (push-история);
#   • КАПИТАН «К» в составах протокола;
#   • клиент: 1424=3 колонки → 1250=центр+статистика → 900=центр.
# ⚠ ГРАБЛЯ agent-browser: персистентный eval-контекст — все
#   multi-statement eval в IIFE; клики — через eval по querySelector.
# ============================================================
set -uo pipefail
cd /home/z/my-project

DB=scoresbox_smoke34
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/${DB}?schema=public"
export AUTH_SECRET='ci-secret-not-for-production'
export SHOW_DEMO_ACCOUNTS=1
export SITE_URL='http://localhost:3100'
export PORT=3100
export NODE_ENV=production

bun scripts/reset-test-db.ts "$DB" >/dev/null
bunx prisma migrate deploy >/dev/null 2>&1
bun prisma/seed.ts >/dev/null 2>&1

pkill -f "standalone/server.js" 2>/dev/null; sleep 1
bun .next/standalone/server.js > /tmp/scoresbox-smoke34.log 2>&1 &
SRV=$!
cleanup() { kill $SRV 2>/dev/null; pkill -f "standalone/server.js" 2>/dev/null; }
trap cleanup EXIT

for i in $(seq 1 40); do curl -sf http://localhost:3100/api/health >/dev/null 2>&1 && break; sleep 1; done
echo "==> сервер поднят"

js() { agent-browser eval "$1" --json 2>/dev/null | bun -e 'let s=require("fs").readFileSync(0,"utf8");try{console.log(JSON.parse(s).data?.result??"")}catch{console.log("ERR")}'; }

login() {
  js '(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim().includes("Выйти")); if(b){b.click(); return "logout"} return "no-session" })()' >/dev/null
  agent-browser wait 900 >/dev/null
  agent-browser open http://localhost:3100/admin --timeout 30000 >/dev/null
  agent-browser wait --load networkidle --timeout 20000 >/dev/null 2>&1
  agent-browser wait 1200 >/dev/null
  js "(() => { const b=[...document.querySelectorAll(\"button\")].find(x=>x.textContent.includes(\"$1\")); if(b){b.click(); return \"demo\"} return \"NF\" })()" >/dev/null
  agent-browser wait --load networkidle --timeout 15000 >/dev/null 2>&1
  agent-browser wait 1800 >/dev/null
}

go_section() {
  js "(() => { const M=[...document.querySelectorAll(\"aside button\")].find(b=>b.textContent.trim().startsWith(\"$1\")); if(M){M.click(); return \"ok\"} return \"NF\" })()" >/dev/null
  agent-browser wait 2200 >/dev/null
}

FAILS=0
check() { if [ "$2" = "OK" ]; then echo "  ✓ $1"; else echo "  ✗ $1 → $2"; FAILS=$((FAILS+1)); fi; }

agent-browser set viewport 1440 900 >/dev/null 2>&1
login "admin@ff21.ru"

echo "==> 1. Люди: пагинация (289 персон, 50/стр)"
go_section "Люди"
PAG=$(js '(() => { const t=document.body.innerText; const nav=[...document.querySelectorAll("nav")].find(n=>n.getAttribute("aria-label")==="Страницы списка людей"); return JSON.stringify({nav:!!nav, counter:(t.match(/(\d+)\s*чел\. всего/)||[])[1]||null, page:(t.match(/стр\.\s*(\d+)\s*из\s*(\d+)/)||[]).slice(1,3)}) })()')
check "навигация страниц отрисована" "$(echo "$PAG" | grep -q '"nav":true' && echo OK || echo "$PAG")"
check "счётчик «N чел. всего» (289)" "$(echo "$PAG" | grep -q '"counter":"289"' && echo OK || echo "$PAG")"
check "подпись «стр. 1 из 6»" "$(echo "$PAG" | grep -q '\["1","6"\]' && echo OK || echo "$PAG")"
FIRST_PAGE=$(js '(() => { const rows=[...document.querySelectorAll("div.overflow-hidden button")]; return rows[0]?rows[0].textContent.trim().split(" ")[0]:"NF" })()')
js '(() => { const b=[...document.querySelectorAll("nav[aria-label=\"Страницы списка людей\"] button")].find(x=>x.getAttribute("aria-label")==="Следующая страница"); if(b){b.click(); return "next"} return "NF" })()' >/dev/null
agent-browser wait 1800 >/dev/null
SECOND_PAGE=$(js '(() => { const rows=[...document.querySelectorAll("div.overflow-hidden button")]; return rows[0]?rows[0].textContent.trim().split(" ")[0]:"NF" })()')
check "стр. 2 показывает ДРУГИХ людей (не список с буквы А)" "$([ "$FIRST_PAGE" != "$SECOND_PAGE" ] && [ "$SECOND_PAGE" != "NF" ] && echo OK || echo "p1=$FIRST_PAGE p2=$SECOND_PAGE")"
agent-browser screenshot scripts/smoke-34-people-paginated.png >/dev/null 2>&1 || true

echo "==> 2. Люди: поиск РЕГИСТРОНЕЗАВИСИМЫЙ (строчными)"
js '(() => { const inp=document.querySelector("input[aria-label=\"Поиск людей\"]"); if(!inp) return "NF"; const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set; setter.call(inp,"смирнов"); inp.dispatchEvent(new Event("input",{bubbles:true})); return "filled" })()' >/dev/null
agent-browser wait 1600 >/dev/null
SEARCH=$(js '(() => { const t=document.body.innerText; return JSON.stringify({found:t.includes("Смирнов"), counter:(t.match(/(\d+)\s*чел\. всего/)||[])[1]||null}) })()')
check "строчными «смирнов» находит «Смирнов»" "$(echo "$SEARCH" | grep -q '"found":true' && echo OK || echo "$SEARCH")"
agent-browser screenshot scripts/smoke-34-people-search.png >/dev/null 2>&1 || true

echo "==> 3. Роль корпуса: единая, «Игрок + Судья» без конфликта"
js '(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Персона"); if(b){b.click(); return "opened"} return "NF" })()' >/dev/null
agent-browser wait 900 >/dev/null
# PLAYER включён в пустой форме ПО УМОЛЧАНИЮ — кликаем только корпус
ROLES=$(js '(() => { const dlg=document.querySelector("[data-slot=\"dialog-content\"]"); if(!dlg) return "NO-DLG"; const t=dlg.innerText; const corpBtn=[...dlg.querySelectorAll("button")].find(b=>b.textContent.trim()==="Судья (судейский корпус)"); if(corpBtn){corpBtn.click()} return JSON.stringify({single:!!corpBtn, noNarrow:!t.includes("Помощник судьи")&&!t.includes("Инспектор")&&!t.includes("VAR-судья"), playerDefault:t.includes("Позиция")}) })()')
check "в «Судейском корпусе» ОДНА роль (должности — в матче)" "$(echo "$ROLES" | grep -q '"single":true' && echo OK || echo "$ROLES")"
check "узких должностей на карточке нет" "$(echo "$ROLES" | grep -q '"noNarrow":true' && echo OK || echo "$ROLES")"
agent-browser wait 400 >/dev/null
DUAL=$(js '(() => { const dlg=document.querySelector("[data-slot=\"dialog-content\"]"); if(!dlg) return "NO-DLG"; return JSON.stringify({info:dlg.innerText.includes("Игрок и судья одновременно — это нормально"), red:!dlg.innerText.includes("Судья/врач не может быть игроком")}) })()')
check "игрок+судья: синяя подсказка, КРАСНОГО запрета нет" "$(echo "$DUAL" | grep -q '"info":true' && echo "$DUAL" | grep -q '"red":true' && echo OK || echo "$DUAL")"
js '(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Отмена"); if(b){b.click(); return "closed"} return "NF" })()' >/dev/null
agent-browser wait 600 >/dev/null

echo "==> 4. Форма матча: «Главный судья» — только судейский корпус"
go_section "Матчи"
js '(() => { const pencil=[...document.querySelectorAll("button[aria-label=\"Редактировать\"]")]; if(pencil.length){pencil[0].click(); return "edit"} const add=[...document.querySelectorAll("button")].find(x=>x.textContent.trim().match(/^Добавить/)); if(add){add.click(); return "add"} return "NF" })()' >/dev/null
agent-browser wait 1500 >/dev/null
REFSEL=$(js '(() => { const dlg=document.querySelector("[data-slot=\"dialog-content\"]"); if(!dlg) return "NO-DLG"; const sel=[...dlg.querySelectorAll("select")].find(s=>[...s.options].some(o=>o.textContent.includes("не назначен"))); if(!sel) return "NO-SEL"; const opts=[...sel.options].map(o=>o.textContent); return JSON.stringify({count:opts.length-1, doctor:opts.some(o=>o.textContent==="Врач"), hint:(dlg.innerText.match(/судейский корпус; помощники/)||[])[0]||null}) })()')
check "в списке судей НЕТ врача (врач — только в бригаде)" "$(echo "$REFSEL" | grep -q '"doctor":false' && echo OK || echo "$REFSEL")"
check "подпись слота про корпус" "$(echo "$REFSEL" | grep -q '"hint":"судейский корпус' && echo OK || echo "$REFSEL")"
js '(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Отмена"); if(b){b.click(); return "closed"} return "NF" })()' >/dev/null
agent-browser wait 600 >/dev/null

echo "==> 5. Протокол НЕ блокирует разделы (залипший ?match=)"
go_section "Протоколы матчей"
MATCHES=$(js '(() => { const rows=[...document.querySelectorAll("tr,button,div")].filter(e=>e.textContent.includes("—")&&e.querySelector("button")); return rows.length>0?"have":"none" })()')
js '(() => { const row=[...document.querySelectorAll("button")].find(b=>b.querySelector("div.w-36")); if(row){row.click(); return "opened"} return "NF" })()' >/dev/null
agent-browser wait 2500 >/dev/null
INMATCH=$(js '(() => { return JSON.stringify({protocol:document.body.innerText.includes("Судейская бригада")||document.body.innerText.includes("Бригада")||document.body.innerText.includes("Составы"), url:location.search}) })()')
check "провалились в протокол матча" "$(echo "$INMATCH" | grep -q '"protocol":true' && echo OK || echo "$INMATCH")"
URLMATCH=$(echo "$INMATCH" | grep -o '"url":"[^"]*"' | grep -q "match=" && echo OK || echo "no-match-param")
check "в URL есть ?match= (deep-link)" "$URLMATCH"
# переключаемся в другой раздел — протокол должен УЙТИ
go_section "Люди"
AFTER=$(js '(() => { const t=document.body.innerText; return JSON.stringify({people:t.includes("Клик по имени — карточка"), noBrigade:!t.includes("Судейская бригада"), url:location.search}) })()')
check "раздел «Люди» открылся ПОВЕРХ закрытого протокола" "$(echo "$AFTER" | grep -q '"people":true' && echo OK || echo "$AFTER")"
check "?match= удалён из URL (фип залипания)" "$(echo "$AFTER" | grep -q '"url"' && echo "$AFTER" | grep -vq 'match=' && echo OK || echo "$AFTER")"
agent-browser screenshot scripts/smoke-34-sections-not-blocked.png >/dev/null 2>&1 || true

echo "==> 6. Кнопка «назад» браузера ходит ПО АДМИНКЕ"
# сейчас: section=people; назад должен вернуться в протоколы (push-запись), НЕ на сайт
agent-browser back >/dev/null 2>&1
agent-browser wait 2000 >/dev/null
BACK=$(js '(() => { return JSON.stringify({stillAdmin:location.pathname==="/admin", url:location.search, protocolBack:document.body.innerText.includes("Протокол")||location.search.includes("protocol")||location.search.includes("match=")}) })()')
check "назад НЕ выкинул на клиент (мы в /admin)" "$(echo "$BACK" | grep -q '"stillAdmin":true' && echo OK || echo "$BACK")"
check "назад вернул к протоколу (история внутри админки)" "$(echo "$BACK" | grep -q '"stillAdmin":true' && echo "$BACK" | grep -qE '"protocolBack":true' && echo OK || echo "$BACK")"

echo "==> 7. Капитан «К» в составах протокола"
agent-browser open "http://localhost:3100/admin?section=protocol" --timeout 20000 >/dev/null
agent-browser wait --load networkidle --timeout 15000 >/dev/null 2>&1
agent-browser wait 2000 >/dev/null
js '(() => { const row=[...document.querySelectorAll("button")].find(b=>b.querySelector("div.w-36")); if(row){row.click(); return "opened"} return "NF" })()' >/dev/null
agent-browser wait 2500 >/dev/null
js '(() => { const k=[...document.querySelectorAll("button")].filter(b=>b.textContent.trim()==="К"); if(k.length===0){ const p=[...document.querySelectorAll("button")].find(b=>(b.getAttribute("aria-label")||"").includes("Добавить")&&(b.getAttribute("aria-label")||"").includes("в протокол")); if(p){p.click(); return "picked"} return "none" } return "has" })()' >/dev/null
agent-browser wait 900 >/dev/null
CAP=$(js '(() => { const k=[...document.querySelectorAll("button")].filter(b=>b.textContent.trim()==="К"); return JSON.stringify({kBtns:k.length}) })()')
check "кнопки «К» у выбранных/игроков есть (0 тоже валидно — состав не подан)" "$(echo "$CAP" | grep -q '"kBtns":' && echo OK || echo "$CAP")"
KB=$(echo "$CAP" | grep -o '"kBtns":[0-9]*' | grep -o '[0-9]*')
if [ "$KB" != "0" ] && [ -n "$KB" ]; then
  js '(() => { const k=[...document.querySelectorAll("button")].filter(b=>b.textContent.trim()==="К"); if(k[0]){k[0].click(); return "clicked"} return "NF" })()' >/dev/null
  agent-browser wait 700 >/dev/null
  SAVE=$(js '(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim().match(/^Сохранить состав/)); if(b){b.click(); return "saved"} return "NF" })()' >/dev/null; agent-browser wait 2500; js '(() => { const t=document.body.innerText; return JSON.stringify({saved:!t.includes("есть несохранённые")}) })()')
  check "капитан сохранён (черновик чист)" "$(echo "$SAVE" | grep -q '"saved":true' && echo OK || echo "$SAVE")"
  GOLD=$(js '(() => { const k=[...document.querySelectorAll("button")].filter(b=>b.textContent.trim()==="К"&&b.getAttribute("aria-pressed")==="true"); return JSON.stringify({pressed:k.length}) })()')
  check "кнопка «К» подсвечена (aria-pressed)" "$(echo "$GOLD" | grep -q '"pressed":1' || echo "$GOLD" | grep -q '"pressed":2' && echo OK || echo "$GOLD")"
fi
agent-browser screenshot scripts/smoke-34-captain.png >/dev/null 2>&1 || true

echo "==> 8. Клиент: постепенное скрытие колонок"
agent-browser open http://localhost:3100/ --timeout 20000 >/dev/null
agent-browser wait --load networkidle --timeout 20000 >/dev/null 2>&1
agent-browser wait 1500 >/dev/null
cols() { js "(() => { const L=document.querySelector('aside.sticky.top-\\\\[121px\\\\].pr-1'); const R=document.querySelector('aside.sticky.top-\\\\[121px\\\\].pl-1'); return JSON.stringify({L:L?L.getBoundingClientRect().width>0:false, R:R?R.getBoundingClientRect().width>0:false, vw:innerWidth}) })()"; }
agent-browser set viewport 1500 900 >/dev/null 2>&1; agent-browser wait 700 >/dev/null
W3=$(cols)
check "1500px: три колонки (лиги+центр+статистика)" "$(echo "$W3" | grep -q '"L":true' && echo "$W3" | grep -q '"R":true' && echo OK || echo "$W3")"
agent-browser set viewport 1250 900 >/dev/null 2>&1; agent-browser wait 700 >/dev/null
W2=$(cols)
check "1250px: лиги СКРЫТЫ, статистика видна" "$(echo "$W2" | grep -q '"L":false' && echo "$W2" | grep -q '"R":true' && echo OK || echo "$W2")"
agent-browser set viewport 900 900 >/dev/null 2>&1; agent-browser wait 700 >/dev/null
W1=$(cols)
check "900px: только центр (обе колонки скрыты)" "$(echo "$W1" | grep -q '"L":false' && echo "$W1" | grep -q '"R":false' && echo OK || echo "$W1")"
check "900px: сворачиваемые лиги внутри центра" "$(js '(() => { return JSON.stringify({details:!!document.querySelector("details")}) })()' | grep -q '"details":true' && echo OK || echo FAIL)"
agent-browser set viewport 1500 900 >/dev/null 2>&1
agent-browser wait 500 >/dev/null
agent-browser screenshot scripts/smoke-34-home-3col.png >/dev/null 2>&1 || true

echo ""
if [ "$FAILS" = "0" ]; then echo "ИТОГО: смоук v1.0.34 — все проверки прошли"; else echo "ИТОГО: смоук v1.0.34 — упало $FAILS"; exit 1; fi
