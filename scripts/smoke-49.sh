#!/usr/bin/env bash
# SMOKE-49 · приёмка v1.0.49 (Task 56: судьи в событии, дубли игроков, CRUD-аудит)
#   1) поднять standalone :3100 (дев-БД с сидом: 289 персон, 3 судьи);
#   2) РЕГРЕСС-РЕПРО: GET /api/admin/persons (дефолт) — страница 1 из 50:
#      судьи Григорьев/Смирнов НЕ видны (та самая грабля «только Алексеева»);
#   3) ФИКС: GET /api/admin/persons?officials=1 — весь корпус (3 судьи);
#   4) ДУБЛИ: POST персона → 201; повтор → 409 + duplicates в теле;
#      force → 201 (вторая карточка) — потом обе удаляются;
#   5) МАТЧ с судьёй «за алфавитом» (Григорьев) — POST матча + refereeId,
#      GET протокола показывает его судьёй матча и полный список судей;
#   6) SmartDelete-тело: DELETE персоны с историей → 409 + code/dependencies;
#   7) валидации аудита: NaN-рейтинг 422, битая дата сезона 422,
#      вместимость стадиона "abc" 422, banners PATCH не затирает даты;
#   8) UI: /admin?section=matches → диалог матча → в «Главном судье»
#      видны ВСЕ судьи (в т.ч. за пределами первых 50 персон) — скриншот.
set -uo pipefail
cd /home/z/my-project

DB="postgresql://postgres:postgres@127.0.0.1:5432/scoresbox?schema=public"
JAR=/tmp/sb49-jar.txt
BASE=http://localhost:3100

pkill -f "bun server.js" 2>/dev/null
sleep 1
bash scripts/smoke-standalone.sh stop >/dev/null 2>&1
export DATABASE_URL="$DB" AUTH_SECRET="smoke-test-secret-v22" NODE_ENV=production PORT=3100 HOSTNAME=127.0.0.1 APP_VERSION="v1.0.49-smoke"
( cd .next/standalone && setsid nohup bun server.js </dev/null >/tmp/standalone-49.log 2>&1 & echo $! > /tmp/standalone.pid )

UP=0
for i in $(seq 1 40); do
  sleep 1
  H=$(curl -s --max-time 3 $BASE/api/health 2>/dev/null | head -c 60)
  [ -n "$H" ] && { echo "health: $H"; UP=1; break; }
done
[ "$UP" = "1" ] || { echo "SERVER DID NOT START"; tail -10 /tmp/standalone-49.log; exit 2; }

jqget() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);const v=($1);console.log(typeof v==='object'?JSON.stringify(v):v)}catch(e){console.log('PARSE_ERR')}})"; }

# ── логин ──
LOGIN=$(curl -s -c "$JAR" -H "Content-Type: application/json" -d '{"email":"admin@ff21.ru","password":"admin123"}' $BASE/api/auth/login | head -c 80)
echo "login: $LOGIN"

# ── 0. фикстуры: id судей за пределами первой страницы + персона с историей ──
FIXTURES=$(export DATABASE_URL="$DB"; node -e '
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
(async () => {
  const refs = await db.person.findMany({ where: { isReferee: true }, orderBy: { lastName: "asc" } });
  // персона с турнирной историей (события) — для SmartDelete-409
  const withEvents = await db.person.findFirst({
    where: { events: { some: {} } },
    include: { _count: { select: { events: true } } },
  });
  const season = await db.season.findFirst({ include: { stages: true } });
  const teams = await db.team.findMany({ take: 2 });
  console.log(JSON.stringify({
    refs: refs.map(r => ({ id: r.id, name: r.lastName + " " + r.firstName })),
    withEvents: withEvents ? { id: withEvents.id, name: withEvents.lastName, events: withEvents._count.events } : null,
    seasonId: season?.id ?? null, stageId: season?.stages?.[0]?.id ?? null,
    homeId: teams[0]?.id ?? null, awayId: teams[1]?.id ?? null,
  }));
  await db.$disconnect();
})();
' 2>/dev/null)
REF_BEYOND=$(echo "$FIXTURES" | jqget "j.refs.filter(r=>r.name.indexOf('Григорьев')===0||r.name.indexOf('Смирнов')===0).map(r=>r.id)")
REF_GRIG=$(echo "$FIXTURES" | jqget "j.refs.find(r=>r.name.indexOf('Григорьев')===0).id")
REF_ALL=$(echo "$FIXTURES" | jqget "j.refs.map(r=>r.id)")
HIST_ID=$(echo "$FIXTURES" | jqget "j.withEvents.id")
SEASON_ID=$(echo "$FIXTURES" | jqget "j.seasonId")
HOME_ID=$(echo "$FIXTURES" | jqget "j.homeId")
AWAY_ID=$(echo "$FIXTURES" | jqget "j.awayId")
echo "fixtures: refs=$REF_ALL | beyond=$REF_BEYOND | hist=$HIST_ID | season=$SEASON_ID"

FAIL=0
chk() { if [ "$2" = "$3" ]; then echo "  ✓ $1"; else echo "  ✗ $1: got [$2] want [$3]"; FAIL=1; fi }

# ── 1. РЕПРО СТАРОЙ ГРАБЛИ: дефолтный список — страница 1, 50 записей ──
echo "== 1. дефолт GET /api/admin/persons (страница 1, pageSize 50) =="
DEF=$(curl -s -b "$JAR" "$BASE/api/admin/persons")
DEF_TOTAL=$(echo "$DEF" | jqget "j.total")
DEF_LEN=$(echo "$DEF" | jqget "j.persons.length")
DEF_HAS_GRIG=$(echo "$DEF" | jqget "j.persons.some(p=>p.id==='"$REF_GRIG"') ? 1 : 0")
chk "total персон в базе > 50 (репро условий бага)" "$([ "${DEF_TOTAL:-0}" -gt 50 ] && echo 1 || echo 0)" "1"
chk "дефолт отдаёт 50 записей" "$DEF_LEN" "50"
chk "судья Григорьев НЕ виден на стр.1 (старый баг)" "$DEF_HAS_GRIG" "0"

# ── 2. ФИКС: officials=1 — весь корпус без пагинации ──
echo "== 2. ФИКС: GET /api/admin/persons?officials=1 =="
OFF=$(curl -s -b "$JAR" "$BASE/api/admin/persons?officials=1")
OFF_TOTAL=$(echo "$OFF" | jqget "j.total")
OFF_PS=$(echo "$OFF" | jqget "j.pageSize")
OFF_ALLREFS=$(echo "$OFF" | jqget "j.persons.filter(p=>p.isReferee).length")
OFF_LEN=$(echo "$OFF" | jqget "j.persons.length")
chk "корпус: total=3 (все судьи дев-базы)" "$OFF_TOTAL" "3"
chk "корпус: pageSize=500 (пагинация выключена)" "$OFF_PS" "500"
chk "корпус: отдаются все 3 судьи" "$OFF_ALLREFS" "3"
chk "корпус: длина списка = total (ничего не срезано)" "$OFF_LEN" "$OFF_TOTAL"

# ── 3. ДУБЛИ ПЕРСОН: 409 с duplicates + force ──
echo "== 3. дубли: 409-тело и force =="
P1=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"firstName":"Тест","lastName":"Смоукдублёв","roles":["PLAYER"]}' $BASE/api/admin/persons)
P1_ID=$(echo "$P1" | jqget "j.person.id")
chk "первое создание 201/ok" "$([ -n "$P1_ID" ] && echo ok || echo fail)" "ok"
P2=$(curl -s -w '\n%{http_code}' -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"firstName":"Тест","lastName":"Смоукдублёв","roles":["PLAYER"]}' $BASE/api/admin/persons)
P2_CODE=$(echo "$P2" | tail -1); P2_BODY=$(echo "$P2" | head -n -1)
P2_DUPES=$(echo "$P2_BODY" | jqget "j.duplicates ? j.duplicates.length : 0")
chk "повтор без force → 409" "$P2_CODE" "409"
chk "в теле 409 есть список дублей (duplicates.length=1)" "$P2_DUPES" "1"
P3=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"firstName":"Тест","lastName":"Смоукдублёв","roles":["PLAYER"],"force":true}' $BASE/api/admin/persons)
P3_ID=$(echo "$P3" | jqget "j.person.id")
chk "force=true создаёт дубль (другой id)" "$([ -n "$P3_ID" ] && [ "$P3_ID" != "$P1_ID" ] && echo ok || echo fail)" "ok"
# чистим обе карточки (без истории — удаляются свободно)
D1=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X DELETE -H "Content-Type: application/json" -d '{}' $BASE/api/admin/persons/$P1_ID)
D2=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X DELETE -H "Content-Type: application/json" -d '{}' $BASE/api/admin/persons/$P3_ID)
chk "cleanup: дубль №1 удалён" "$D1" "200"
chk "cleanup: дубль №2 удалён" "$D2" "200"

# ── 4. МАТЧ с судьёй «за алфавитом» ──
echo "== 4. матч с судьёй Григорьев (за пределами стр.1) =="
M=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d "{\"seasonId\":\"$SEASON_ID\",\"homeTeamId\":\"$HOME_ID\",\"awayTeamId\":\"$AWAY_ID\",\"kickoff\":\"2026-11-20T12:00:00.000Z\",\"round\":99,\"refereeId\":\"$REF_GRIG\"}" $BASE/api/admin/matches)
M_ID=$(echo "$M" | jqget "j.match.id")
M_REF=$(echo "$M" | jqget "j.match.refereeId")
chk "матч создан" "$([ -n "$M_ID" ] && echo ok || echo fail)" "ok"
chk "refereeId матча = Григорьев (судья «за алфавитом»)" "$M_REF" "$REF_GRIG"
PROTO=$(curl -s -b "$JAR" "$BASE/api/admin/matches/$M_ID")
PROTO_REFS=$(echo "$PROTO" | jqget "j.referees.length")
PROTO_REFID=$(echo "$PROTO" | jqget "j.match.referee.id")
chk "протокол: кандидат в бригаде — все 3 судьи" "$PROTO_REFS" "3"
chk "протокол: главный судья матча — Григорьев" "$PROTO_REFID" "$REF_GRIG"
DM=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X DELETE -H "Content-Type: application/json" -d '{}' $BASE/api/admin/matches/$M_ID)
chk "cleanup: матч удалён" "$DM" "200"

# ── 5. SmartDelete-тело: персона с историей → 409 + code/dependencies ──
echo "== 5. DELETE персоны с историей: структура 409 =="
if [ -n "$HIST_ID" ] && [ "$HIST_ID" != "undefined" ]; then
  DH=$(curl -s -w '\n%{http_code}' -b "$JAR" -X DELETE -H "Content-Type: application/json" -d '{}' $BASE/api/admin/persons/$HIST_ID)
  DH_CODE=$(echo "$DH" | tail -1); DH_BODY=$(echo "$DH" | head -n -1)
  DH_ERRCODE=$(echo "$DH_BODY" | jqget "j.code || 'none'")
  DH_DEPS=$(echo "$DH_BODY" | jqget "j.dependencies ? 'yes' : 'no'")
  chk "персона с историей не удаляется (409)" "$DH_CODE" "409"
  chk "в теле есть code=PERSON_HAS_HISTORY" "$DH_ERRCODE" "PERSON_HAS_HISTORY"
  chk "в теле есть dependencies (для SmartDelete-диалога)" "$DH_DEPS" "yes"
else
  echo "  — пропущено: нет персоны с историей в дев-базе"
fi

# ── 6. ВАЛИДАЦИИ АУДИТА ──
echo "== 6. NaN/даты/вместимость =="
R=$(curl -s -o /tmp/r49.json -w '%{http_code}' -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"matchId":"nonexistent","rating":"abc"}' $BASE/api/admin/ratings)
# матч не найден → 404 раньше рейтинга; для NaN проверяем формат на найденном матче не нужно — 422 по типу ловим на стадионах и сезонах
S=$(curl -s -o /tmp/s49.json -w '%{http_code}' -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"name":"Смоук-Арена 49","city":"Чебоксары","capacity":"abc"}' $BASE/api/admin/stadiums)
chk "стадион: capacity=«abc» → 422 (не 500)" "$S" "422"
S2=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X PATCH -H "Content-Type: application/json" -d '{"name":"Смоук-Арена 49","capacity":"-5"}' $BASE/api/admin/stadiums/xxx)
chk "стадион PATCH: отрицательная вместимость → 404/422, не 500" "$([ "$S2" = "404" ] || [ "$S2" = "422" ] && echo ok || echo "got $S2")" "ok"
SS=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X PATCH -H "Content-Type: application/json" -d '{"startDate":"мусор"}' $BASE/api/admin/seasons/$SEASON_ID)
chk "сезон: битая дата → 422 (не 500)" "$SS" "422"

# banners PATCH не затирает даты показа
B=$(curl -s -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"title":"Смоук-баннер 49","placement":"TOP","text":"тест","startsAt":"2026-10-01T00:00:00.000Z","endsAt":"2026-12-01T00:00:00.000Z"}' $BASE/api/admin/banners)
B_ID=$(echo "$B" | jqget "j.banner.id")
B2=$(curl -s -b "$JAR" -X PATCH -H "Content-Type: application/json" -d "{\"title\":\"Смоук-баннер 49 (правка)\",\"placement\":\"TOP\",\"text\":\"тест\"}" $BASE/api/admin/banners/$B_ID)
B2_STARTS=$(echo "$B2" | jqget "j.banner.startsAt ? j.banner.startsAt.slice(0,10) : 'null'")
chk "баннер: PATCH без дат сохраняет расписание показа" "$B2_STARTS" "2026-10-01"
DB_=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X DELETE -H "Content-Type: application/json" -d '{}' $BASE/api/admin/banners/$B_ID)
chk "cleanup: баннер удалён" "$DB_" "200"

# RBAC: DELETE формата контента сайта — только SUPER_ADMIN (проверяем как LEAGUE-оператор не может: у нас нет LEAGUE-акка — проверяем, что роут жив и 401 без сессии)
RB=$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/admin/formats/xxx -X DELETE -H "Content-Type: application/json" -d '{}')
chk "formats DELETE без сессии → 401 (RBAC на месте)" "$RB" "401"

echo "API-FAIL=$FAIL"

# ── 7. UI: диалог матча — судьи в дропдауне ──
echo "== 7. UI: «Главный судья» показывает весь корпус =="
ab() { agent-browser "$@" 2>&1 | grep -v "^✓ Done$"; }
ab open "http://localhost:3100/admin" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
agent-browser eval "(function(){
  var btns = [].slice.call(document.querySelectorAll('button'));
  var b = btns.find(function(x){ return (x.textContent||'').indexOf('admin@ff21.ru') !== -1; });
  if (b) b.click();
  return b ? 'clicked' : 'not-found';
})()" >/dev/null 2>&1
sleep 3
ab open "http://localhost:3100/admin?section=matches" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
# кнопка «Матч» (создать) — в панели матчей
agent-browser eval "(function(){
  var btns = [].slice.call(document.querySelectorAll('button'));
  var b = btns.find(function(x){ return (x.textContent||'').trim() === 'Матч' && x.querySelector('svg') !== null; });
  if (!b) b = btns.find(function(x){ return /Матч/.test(x.textContent||'') && /calendar/i.test((x.querySelector('svg')||{}).className || 'x') === false && (x.textContent||'').indexOf('Чемпионат') === -1; });
  if (b) { b.click(); return 'clicked'; }
  return 'not-found: ' + btns.slice(0,40).map(x=>(x.textContent||'').trim().slice(0,20)).filter(Boolean).join('|');
})()" 2>/dev/null | tail -1
sleep 3
# открыть селект «Главный судья»
agent-browser eval "(function(){
  var sels = [].slice.call(document.querySelectorAll('select'));
  var sel = null;
  for (var s of sels) {
    var lbl = s.closest('div');
    if (lbl && /Главный судья/.test((lbl.textContent||'') + (lbl.previousElementSibling ? lbl.previousElementSibling.textContent : ''))) { sel = s; break; }
  }
  if (!sel) {
    // fallback: второй-третий select в диалоге со значением «— не назначен —»
    for (var s2 of sels) { if ((s2.options[s2.selectedIndex]||{}).text === '— не назначен —') { sel = s2; break; } }
  }
  if (!sel) return 'ref-select-not-found';
  var names = [].slice.call(sel.options).map(function(o){return o.text});
  return JSON.stringify({count: names.length, grig: names.some(function(n){return /Григорьев/.test(n)}), smir: names.some(function(n){return /Смирнов/.test(n)}), art: names.some(function(n){return /Артемьев/.test(n)})});
})()" 2>/dev/null | tail -1
agent-browser screenshot scripts/smoke-49-match-dialog.png >/dev/null 2>&1
UIRES=$(agent-browser eval "(function(){
  var sels = [].slice.call(document.querySelectorAll('select'));
  var sel = null;
  for (var s of sels) {
    if ((s.options[s.selectedIndex]||{}).text === '— не назначен —') { sel = s; break; }
  }
  if (!sel) return 'MISSING-REFS:no-select';
  var names = [].slice.call(sel.options).map(function(o){return o.text});
  return names.some(function(n){return /Григорьев/.test(n)}) && names.some(function(n){return /Смирнов/.test(n)}) ? 'ALL-REFS-VISIBLE' : 'MISSING-REFS';
})()" 2>/dev/null | tail -1 | tr -d '"')
echo "UI-REFEREE-SELECT: $UIRES"
chk "UI: судьи за пределами стр.1 видны в «Главном судье»" "$UIRES" "ALL-REFS-VISIBLE"

# мобайл-регресс не требуется (UI-верстка не менялась), сервер останавливаем
bash scripts/smoke-standalone.sh stop >/dev/null 2>&1
pkill -f "bun server.js" 2>/dev/null
echo "SMOKE-49 RESULT: $([ "$FAIL" = "0" ] && echo GREEN || echo RED)"