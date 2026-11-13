#!/usr/bin/env bash
# SMOKE-46 · приёмка v1.0.46 (бриф 2026-10-06) одним вызовом (грабля
# Task 44/45: фоновые процессы не переживают конец вызова shell):
#   1) поднять standalone :3100 (дев-БД с сидом);
#   2) API: insights.streaks пришёл с бэкенда;
#   3) OG-карточка и favicon отдаются (200);
#   4) матч 1280: сетка 220|1fr|300; превью — дата 06.10.26 тремя
#      строками; «за N матчей:» и БЕЗ «забивала/пропускала»;
#      составы: бейджи событий ВПЛОТНУЮ к имени (не по центру);
#   5) планшет 900/1100: правый столбец 240/280px;
#   6) профили (игрок/команда) 1280: колонки статистики ВЕРНУЛИСЬ,
#      команда: «Состав» → «Матчи» друг под другом;
#   7) мобайл 375: профили без витрины («Прямо сейчас» нет);
#   8) /brand/logo-variants.html — витрина новой системы логотипа.
set -uo pipefail
cd /home/z/my-project

DB="postgresql://postgres:postgres@127.0.0.1:5432/scoresbox?schema=public"
MATCH_ID="${MATCH_ID:-cmuvby70y00rplzzifw6xwt29}"

bash scripts/smoke-standalone.sh stop >/dev/null 2>&1
export DATABASE_URL="$DB" AUTH_SECRET="smoke-test-secret-v22" NODE_ENV=production PORT=3100 HOSTNAME=127.0.0.1 APP_VERSION="v1.0.46-smoke"
( cd .next/standalone && setsid nohup bun server.js </dev/null >/tmp/standalone-46.log 2>&1 & echo $! > /tmp/standalone.pid )

UP=0
for i in $(seq 1 40); do
  sleep 1
  H=$(curl -s --max-time 3 http://localhost:3100/api/health 2>/dev/null | head -c 60)
  [ -n "$H" ] && { echo "health: $H"; UP=1; break; }
done
[ "$UP" = "1" ] || { echo "SERVER DID NOT START"; tail -10 /tmp/standalone-46.log; exit 2; }

# ── 0. API: streaks в инсайтах + актуальный матч ──
API=$(curl -s "http://localhost:3100/api/public/matches/$MATCH_ID" 2>/dev/null)
MID=$(echo "$API" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('match',{}).get('id',''))" 2>/dev/null)
if [ -z "$MID" ]; then
  MID=$(curl -s "http://localhost:3100/api/public/matches/day?date=all" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for l in d.get('leagues') or []:
  for m in l.get('matches') or []:
    if m.get('status')=='COMPLETED': print(m['id']); raise SystemExit
" 2>/dev/null)
  API=$(curl -s "http://localhost:3100/api/public/matches/$MID" 2>/dev/null)
fi
echo "match id: $MID"
INSIGHTS=$(echo "$API" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ins=d.get('insights') or {}
h=ins.get('home') or {}
l5=h.get('last5'); st=h.get('streaks')
print('last5=', l5, ' streaks=', st)
" 2>/dev/null)
echo "INSIGHTS: $INSIGHTS"

OG=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' http://localhost:3100/og-image.png)
FAV=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' http://localhost:3100/icon.svg)
echo "OG: $OG | FAVICON: $FAV"

PLAYER_ID=$(echo "$API" | python3 -c "import json,sys; d=json.load(sys.stdin); ev=d.get('match',{}).get('events') or []; print(ev[0].get('person',{}).get('id','') if ev else '')" 2>/dev/null)
TEAM_ID=$(echo "$API" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('match',{}).get('homeTeam',{}).get('id',''))" 2>/dev/null)
echo "ids: player=$PLAYER_ID team=$TEAM_ID"

ab() { agent-browser "$@" 2>&1 | grep -v "^✓ Done$"; }

# ── 1. МАТЧ 1280: сетка + превью + статистика ──
ab set viewport 1280 900 >/dev/null
ab open "http://localhost:3100/match/$MID" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
agent-browser screenshot scripts/smoke-46-match-1280.png >/dev/null 2>&1
PREVIEW=$(agent-browser eval "(function(){
  var grid = document.querySelector('main > div');
  var cols = grid ? getComputedStyle(grid).gridTemplateColumns : '';
  var asides = document.querySelectorAll('main aside').length;
  var body = document.body.textContent || '';
  // ВАЖНО: \b в eval-строках интерпретируется как backspace — регэкспы
  // без \b; дата — «DD.MM.YY» (точка в регэкспе без экрейпа = любой символ,
  // для смоука достаточно)
  var dateNum = /\d{2}.\d{2}.\d{2}/.test(body);
  var timeMsk = /\d{2}:\d{2} МСК/.test(body);
  var shortForm = /за \d+ матч/.test(body);
  var oldWords = /(забивала|пропускала) /.test(body);
  var bomber = /бомбардир:/.test(body);
  return JSON.stringify({cols: cols, asides: asides, dateNum: dateNum, timeMsk: timeMsk, shortForm: shortForm, oldWords: oldWords, bomber: bomber});
})()" 2>/dev/null | tail -1)
echo "MATCH-1280: $PREVIEW"

# ── 2. СОСТАВЫ: бейджи вплотную к имени ──
agent-browser eval "(function(){ var b=document.querySelectorAll('button'); for(var i=0;i<b.length;i++){ var t=(b[i].textContent||'').trim(); if(t.indexOf('Составы')===0){ b[i].click(); return 1; } } return 0; })()" >/dev/null 2>&1
sleep 2
agent-browser screenshot scripts/smoke-46-lineups-1280.png >/dev/null 2>&1
LINEUPS=$(agent-browser eval "(function(){
  var players = document.querySelectorAll('[data-lineup-player]');
  var checked = 0, adjacent = 0, mid = 0;
  players.forEach(function(btn){
    var name = btn.querySelector('[data-lineup-name]');
    var mark = btn.querySelector('[data-lineup-mark]');
    if (!name || !mark) return;
    var justify = getComputedStyle(btn).justifyContent;
    var nr = name.getBoundingClientRect(), mr = mark.getBoundingClientRect();
    var gap = Math.max(0, Math.round(Math.min(Math.abs(mr.left - nr.right), Math.abs(nr.left - mr.right))));
    checked++;
    if (gap <= 16) adjacent++;
    else if (gap > 60) mid++;
  });
  var subtabs = document.querySelectorAll('[data-lineup-subtabs]').length;
  return JSON.stringify({playersWithMarks: checked, marksGluedToName: adjacent, marksFarFromName: mid});
})()" 2>/dev/null | tail -1)
echo "LINEUPS-1280: $LINEUPS"

# ── 3. ПЛАНШЕТ 900 и 1100: правый столбец 240/280 ──
ab set viewport 900 800 >/dev/null
sleep 1
TABLET9=$(agent-browser eval "(function(){ var g=document.querySelector('main > div'); var c=g?getComputedStyle(g).gridTemplateColumns:''; var a=document.querySelectorAll('main aside').length; return JSON.stringify({cols:c, asides:a}); })()" 2>/dev/null | tail -1)
echo "MATCH-900: $TABLET9"
ab set viewport 1100 800 >/dev/null
sleep 1
TABLET11=$(agent-browser eval "(function(){ var g=document.querySelector('main > div'); var c=g?getComputedStyle(g).gridTemplateColumns:''; var a=document.querySelectorAll('main aside').length; return JSON.stringify({cols:c, asides:a}); })()" 2>/dev/null | tail -1)
echo "MATCH-1100: $TABLET11"
agent-browser screenshot scripts/smoke-46-match-900.png >/dev/null 2>&1
ab set viewport 1280 900 >/dev/null
sleep 1

# ── 4. КОМАНДА 1280: колонки вернулись, состав → матчи друг под другом ──
if [ -n "$TEAM_ID" ]; then
  ab open "http://localhost:3100/team/$TEAM_ID" >/dev/null
  agent-browser wait --load networkidle >/dev/null 2>&1
  sleep 2
  agent-browser screenshot scripts/smoke-46-team-1280.png >/dev/null 2>&1
  TEAM=$(agent-browser eval "(function(){
    var g=document.querySelector('main > div');
    var cols=g?getComputedStyle(g).gridTemplateColumns:'';
    var asides=document.querySelectorAll('main aside').length;
    var cards=[].slice.call(document.querySelectorAll('main .grid > div'));
    var squad=null, matches=null;
    cards.forEach(function(c){
      var h=c.querySelector('p');
      var t=(h&&h.textContent||'');
      if(t.indexOf('Состав')===0&&squad===null) squad=c.getBoundingClientRect();
      if(t.indexOf('Матчи')===0&&matches===null) matches=c.getBoundingClientRect();
    });
    var stacked = squad&&matches ? (Math.abs(squad.left-matches.left)<8 && (matches.top-squad.bottom)>0) : null;
    var full = squad ? Math.round(squad.width) : null;
    return JSON.stringify({cols:cols, asides:asides, squadFullWidth:full, stacked:stacked});
  })()" 2>/dev/null | tail -1)
  echo "TEAM-1280: $TEAM"
fi

# ── 5. ИГРОК 1280: колонки вернулись ──
if [ -n "$PLAYER_ID" ]; then
  ab open "http://localhost:3100/player/$PLAYER_ID" >/dev/null
  agent-browser wait --load networkidle >/dev/null 2>&1
  sleep 2
  agent-browser screenshot scripts/smoke-46-player-1280.png >/dev/null 2>&1
  PLAYER=$(agent-browser eval "(function(){
    var g=document.querySelector('main > div');
    var cols=g?getComputedStyle(g).gridTemplateColumns:'';
    var asides=document.querySelectorAll('main aside').length;
    var rail=document.querySelectorAll('main aside .right-rail, main aside [class*=rail]').length;
    return JSON.stringify({cols:cols, asides:asides, railWidgets:rail});
  })()" 2>/dev/null | tail -1)
  echo "PLAYER-1280: $PLAYER"

  # ── 6. ИГРОК 375: без витрины статистики ──
  ab set viewport 375 700 >/dev/null
  sleep 1
  PLAYERM=$(agent-browser eval "(function(){
    // ВИДИМОСТЬ (не textContent: скрытый DOM тоже даёт текст):
    var visible = function(n){ return n.offsetParent !== null; };
    var asides = [].slice.call(document.querySelectorAll('main aside')).filter(visible).length;
    var vitrinaEls = [].slice.call(document.querySelectorAll('main p, main span')).filter(function(n){
      return /Прямо сейчас|Самый результативный/.test(n.textContent||'') && n.children.length===0;
    });
    var vitrina = vitrinaEls.some(visible);
    return JSON.stringify({asidesVisible:asides, vitrinaVisible:vitrina});
  })()" 2>/dev/null | tail -1)
  echo "PLAYER-375: $PLAYERM"
  agent-browser screenshot scripts/smoke-46-player-375.png >/dev/null 2>&1
fi

# ── 7. МАТЧ 375: мобильные подвкладки составов ──
ab open "http://localhost:3100/match/$MID" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
MOB=$(agent-browser eval "(function(){
  var b=document.querySelectorAll('button'); var opened=0;
  for(var i=0;i<b.length;i++){ var t=(b[i].textContent||'').trim(); if(t.indexOf('Составы')===0){ b[i].click(); opened=1; break; } }
  return opened;
})()" 2>/dev/null | tail -1)
sleep 1
MOBILE=$(agent-browser eval "(function(){
  var visible = function(n){ return n.offsetParent !== null; };
  var subtabs = document.querySelectorAll('[data-lineup-subtabs]');
  var subtabBtns = [].slice.call(document.querySelectorAll('[data-subtab]')).filter(visible).length;
  var subtabsVisible = subtabs.length > 0 && visible(subtabs[0]);
  var playerRows = [].slice.call(document.querySelectorAll('[data-lineup-player]')).filter(visible).length;
  return JSON.stringify({subtabsVisible:subtabsVisible, subtabButtons:subtabBtns, visiblePlayerRows:playerRows});
})()" 2>/dev/null | tail -1)
echo "LINEUPS-375: $MOBILE"
agent-browser screenshot scripts/smoke-46-lineups-375.png >/dev/null 2>&1

# ── 8. БРЕНД-СТРАНИЦА: витрина нового лого ──
ab set viewport 1024 900 >/dev/null
ab open "http://localhost:3100/brand/logo-variants.html" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
agent-browser screenshot scripts/smoke-46-brand-variants.png >/dev/null 2>&1
BRAND=$(agent-browser eval "(function(){
  var masks=document.querySelectorAll('svg mask').length;
  var rects=document.querySelectorAll('svg rect[mask]').length;
  var ogImgs=document.querySelectorAll('img[src=\"/og-image.png\"]').length;
  var h1=document.querySelector('h1');
  return JSON.stringify({masks:masks, maskedRects:rects, ogImages:ogImgs, h1:(h1?h1.textContent.trim():'')});
})()" 2>/dev/null | tail -1)
echo "BRAND-PAGE: $BRAND"

# ── 9. ШАПКА: логотип с маской рендерится ──
ab open "http://localhost:3100/" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
HEADER=$(agent-browser eval "(function(){
  var logo=document.querySelector('header a svg');
  var mask=logo?logo.querySelectorAll('mask').length:0;
  var rect=logo?logo.querySelectorAll('rect[mask]').length:0;
  var box=logo?logo.getBoundingClientRect():null;
  return JSON.stringify({headerSvg:!!logo, masks:mask, maskedRects:rect, w:box?Math.round(box.width):0, h:box?Math.round(box.height):0});
})()" 2>/dev/null | tail -1)
echo "HEADER-LOGO: $HEADER"
agent-browser screenshot scripts/smoke-46-home-1280.png >/dev/null 2>&1

bash scripts/smoke-standalone.sh stop >/dev/null 2>&1
echo "SMOKE-46 DONE"
