#!/usr/bin/env bash
# ============================================================
# SCORESBOX · смоук v1.0.33 (локальный, песочница):
#   • ФИКС ПЕРЕПОЛНЕНИЯ: LinkDialog со ссылкой ?pwset= — данные
#     не вылезают за рамку диалога (замер геометрии, 1440 и 390 px);
#   • приглашение (manual): создание юзера с длинным email →
#     диалог ссылки → тексты про подтверждение почты;
#   • страница ?pwset=: предпросмотр email → подтверждение →
#     поля пароля появляются только после подтверждения;
#   • UsersPanel: баннер ручного режима, бейджи «без пароля» /
#     «почта не подтверждена», кнопки Приглашение/Сброс/Почта.
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

# база: чистая + сид (с флагами emailVerified/passwordSet)
bun scripts/reset-test-db.ts "$DB" >/dev/null
bunx prisma migrate deploy >/dev/null 2>&1
bun prisma/seed.ts >/dev/null 2>&1

pkill -f "standalone/server.js" 2>/dev/null; sleep 1
bun .next/standalone/server.js > /tmp/scoresbox-smoke33.log 2>&1 &
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

FAILS=0
check() { if [ "$2" = "OK" ]; then echo "  ✓ $1"; else echo "  ✗ $1 → $2"; FAILS=$((FAILS+1)); fi; }

agent-browser set viewport 1440 900 >/dev/null 2>&1
login "admin@ff21.ru"

echo "==> 1. создание юзера с длинным email → LinkDialog (1440)"
js '(() => { const M=[...document.querySelectorAll("aside button")].find(b=>b.textContent.trim().startsWith("Пользователи")); if(M){M.click(); return "ok"} return "NF" })()' >/dev/null
agent-browser wait 2000 >/dev/null
BANNER=$(js '(() => { const t=document.body.innerText; return JSON.stringify({manual:t.includes("Письма не настроены"),smtp:t.includes("Письма включены")}) })()')
check "баннер ручного режима доставки" "$(echo "$BANNER" | grep -q '"manual":true' && echo OK || echo "$BANNER")"
js '(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Пользователь"); if(b){b.click(); return "opened"} return "NF" })()' >/dev/null
agent-browser wait 700 >/dev/null
js '(() => { const inp=document.querySelector("input[type=\"email\"]"); if(!inp) return "NF"; const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set; setter.call(inp,"a.verylong.surname.gennadievich.petrov.jr@some-very-long-company-domain.example.ru"); inp.dispatchEvent(new Event("input",{bubbles:true})); return "filled" })()' >/dev/null
agent-browser wait 400 >/dev/null
js '(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Создать"); if(b){b.click(); return "submitted"} return "NF" })()' >/dev/null
agent-browser wait 2200 >/dev/null
GEO=$(js '(() => { const dlg=document.querySelector("[data-slot=\"dialog-content\"]"); if(!dlg) return "NO-DIALOG"; const r=dlg.getBoundingClientRect(); const code=dlg.querySelector("code"); const cr=code?code.getBoundingClientRect():null; return JSON.stringify({dlgRight:+r.right.toFixed(0),vw:innerWidth,codeRight:cr?+cr.right.toFixed(0):null,overflow:cr?(cr.right>r.right+1):null,scroll:dlg.scrollWidth>dlg.clientWidth+1}) })()')
check "ссылка ВНУТРИ рамки диалога" "$(echo "$GEO" | grep -q '"overflow":false' && echo OK || echo "$GEO")"
check "нет горизонтального скролла в диалоге" "$(echo "$GEO" | grep -q '"scroll":false' && echo OK || echo "$GEO")"
NOTE=$(js '(() => { const t=document.body.innerText; return JSON.stringify({confirm:t.includes("подтвердит его"),ttl48:t.includes("48 часов")}) })()')
check "текст: получатель подтвердит адрес" "$(echo "$NOTE" | grep -q '"confirm":true' && echo OK || echo "$NOTE")"
check "текст: срок ссылки 48 часов" "$(echo "$NOTE" | grep -q '"ttl48":true' && echo OK || echo "$NOTE")"
agent-browser screenshot scripts/smoke-33-linkdialog-1440.png >/dev/null 2>&1 || true

echo "==> 2. тот же диалог на телефоне (390px)"
agent-browser set viewport 390 844 >/dev/null 2>&1
agent-browser wait 600 >/dev/null
GEO390=$(js '(() => { const dlg=document.querySelector("[data-slot=\"dialog-content\"]"); if(!dlg) return "NO-DIALOG"; const r=dlg.getBoundingClientRect(); const code=dlg.querySelector("code"); const cr=code?code.getBoundingClientRect():null; return JSON.stringify({vw:innerWidth,codeRight:cr?+cr.right.toFixed(0):null,dlgRight:+r.right.toFixed(0),overflow:cr?(cr.right>r.right+1):null}) })()')
check "мобильный: ссылка внутри рамки" "$(echo "$GEO390" | grep -q '"overflow":false' && echo OK || echo "$GEO390")"
agent-browser screenshot scripts/smoke-33-linkdialog-390.png >/dev/null 2>&1 || true
# забираем токен из диалога для шага 3
TOKEN=$(js '(() => { const c=document.querySelector("[data-slot=\"dialog-content\"] code"); return c?c.textContent.trim().split("pwset=")[1]??"NOTOK":"" })()')
agent-browser set viewport 1440 900 >/dev/null 2>&1
js '(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Закрыть"); if(b){b.click(); return "closed"} return "NF" })()' >/dev/null
agent-browser wait 800 >/dev/null

echo "==> 3. строка юзера: бейджи и кнопки"
ROW=$(js '(() => { const t=document.body.innerText; return JSON.stringify({nopw:t.includes("без пароля"),unverified:t.includes("почта не подтверждена"),inviteBtn:t.includes("Приглашение"),emailBtn:t.includes("Почта")}) })()')
check "бейдж «без пароля»" "$(echo "$ROW" | grep -q '"nopw":true' && echo OK || echo "$ROW")"
check "бейдж «почта не подтверждена»" "$(echo "$ROW" | grep -q '"unverified":true' && echo OK || echo "$ROW")"
check "кнопка «Приглашение»" "$(echo "$ROW" | grep -q '"inviteBtn":true' && echo OK || echo "$ROW")"
check "кнопка «Почта»" "$(echo "$ROW" | grep -q '"emailBtn":true' && echo OK || echo "$ROW")"
agent-browser screenshot scripts/smoke-33-users-panel.png >/dev/null 2>&1 || true

echo "==> 4. страница ?pwset=: предпросмотр и подтверждение email"
if [ -n "$TOKEN" ] && [ "$TOKEN" != "NOTOK" ]; then
  agent-browser open "http://localhost:3100/admin?pwset=$TOKEN" --timeout 20000 >/dev/null
  agent-browser wait --load networkidle --timeout 15000 >/dev/null 2>&1
  agent-browser wait 1300 >/dev/null
  PV=$(js '(() => { const t=document.body.innerText; return JSON.stringify({check:t.includes("Проверьте адрес аккаунта"),email:t.includes("a.verylong.surname"),yes:t.includes("Да, это мой адрес"),wrong:t.includes("Указан неверно"),noPw:!t.includes("Новый пароль (минимум 8")}) })()')
  check "шаг подтверждения email открыт" "$(echo "$PV" | grep -q '"check":true' && echo OK || echo "$PV")"
  check "email (длинный) показан и не ломает карточку" "$(echo "$PV" | grep -q '"email":true' && echo OK || echo "$PV")"
  YESOK=$(echo "$PV" | grep -q '"yes":true' && echo OK || echo FAIL)
  WRONGOK=$(echo "$PV" | grep -q '"wrong":true' && echo OK || echo FAIL)
  check "кнопки «Да» / «Указан неверно»" "$([ "$YESOK" = "OK" ] && [ "$WRONGOK" = "OK" ] && echo OK || echo "yes:$YESOK wrong:$WRONGOK")"
  check "полей пароля НЕТ до подтверждения" "$(echo "$PV" | grep -q '"noPw":true' && echo OK || echo "$PV")"
  agent-browser screenshot scripts/smoke-33-pwset-confirm.png >/dev/null 2>&1 || true
  # подтверждаем → поля пароля появляются
  js '(() => { const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="Да, это мой адрес"); if(b){b.click(); return "yes"} return "NF" })()' >/dev/null
  agent-browser wait 900 >/dev/null
  AFTER=$(js '(() => { const t=document.body.innerText; return JSON.stringify({confirmed:t.includes("Email подтверждён"),pw:t.includes("Новый пароль (минимум 8")}) })()')
  check "после «Да»: email подтверждён" "$(echo "$AFTER" | grep -q '"confirmed":true' && echo OK || echo "$AFTER")"
  check "после «Да»: поля пароля появились" "$(echo "$AFTER" | grep -q '"pw":true' && echo OK || echo "$AFTER")"
  agent-browser screenshot scripts/smoke-33-pwset-password.png >/dev/null 2>&1 || true
else
  check "токен из LinkDialog получен" "FAIL: TOKEN=$TOKEN"
fi

echo "==> 5. безопасность: смена пароля (данные не вылезают)"
# шаг 4 не отправлял пароль — сессия админа жива; возвращаемся в панель
agent-browser open http://localhost:3100/admin --timeout 20000 >/dev/null
agent-browser wait --load networkidle --timeout 15000 >/dev/null 2>&1
agent-browser wait 1500 >/dev/null
js '(() => { const M=[...document.querySelectorAll("aside button")].find(b=>b.textContent.trim().startsWith("Безопасность")); if(M){M.click(); return "ok"} return "NF" })()' >/dev/null
agent-browser wait 1500 >/dev/null
SEC=$(js '(() => { const cards=[...document.querySelectorAll("div.rounded-xl")]; const card=cards.find(d=>d.textContent.includes("Смена пароля")); if(!card) return "NF"; const r=card.getBoundingClientRect(); let overs=0; card.querySelectorAll("input,label,button,code,p").forEach(el=>{const er=el.getBoundingClientRect(); if(er.width>0&&er.right>r.right+1) overs++}); return JSON.stringify({overflowing:overs}) })()')
check "карта смены пароля без переполнений" "$(echo "$SEC" | grep -q '"overflowing":0' && echo OK || echo "$SEC")"
agent-browser screenshot scripts/smoke-33-security.png >/dev/null 2>&1 || true

echo ""
if [ $FAILS -eq 0 ]; then echo "ИТОГО: смоук v1.0.33 — все проверки прошли"; else echo "ИТОГО: упало проверок: $FAILS"; exit 1; fi
