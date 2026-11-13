#!/usr/bin/env bash
# SMOKE-44-UI · приёмка UI-правок v1.0.44 одним вызовом (грабля из
# Task 44/45: фоновые процессы не переживают конец вызова shell):
#   1) поднять standalone :3100 (дев-БД с сидом);
#   2) скриншоты: матч 1280/375, главная, профиль игрока;
#   3) метрики eval-ом: боковые колонки на матче, фикс-ширина кнопки
#      даты при листании, «И. Иванов» в протоколе, отсутствие
#      «Прямо сейчас»/«Самый результативный» на профиле.
set -uo pipefail
cd /home/z/my-project

DB="postgresql://postgres:postgres@127.0.0.1:5432/scoresbox?schema=public"
MATCH_ID="${MATCH_ID:-cmuvby70y00rplzzifw6xwt29}"
PLAYER_ID="${PLAYER_ID:-}"
TEAM_ID="${TEAM_ID:-}"

bash scripts/smoke-standalone.sh stop >/dev/null 2>&1
export DATABASE_URL="$DB" AUTH_SECRET="smoke-test-secret-v22" NODE_ENV=production PORT=3100 HOSTNAME=127.0.0.1 APP_VERSION="v1.0.44-smoke"
( cd .next/standalone && setsid nohup bun server.js </dev/null >/tmp/standalone-44.log 2>&1 & echo $! > /tmp/standalone.pid )

UP=0
for i in $(seq 1 40); do
  sleep 1
  H=$(curl -s --max-time 3 http://localhost:3100/api/health 2>/dev/null | head -c 60)
  [ -n "$H" ] && { echo "health: $H"; UP=1; break; }
done
[ "$UP" = "1" ] || { echo "SERVER DID NOT START"; tail -10 /tmp/standalone-44.log; exit 2; }

if [ -z "$PLAYER_ID" ]; then
  PLAYER_ID=$(curl -s "http://localhost:3100/api/public/matches/$MATCH_ID" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); ev=d.get('match',{}).get('events') or []; print(ev[0].get('person',{}).get('id','') if ev else '')" 2>/dev/null)
fi
if [ -z "$TEAM_ID" ]; then
  TEAM_ID=$(curl -s "http://localhost:3100/api/public/matches/$MATCH_ID" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('match',{}).get('homeTeam',{}).get('id',''))" 2>/dev/null)
fi
echo "ids: match=$MATCH_ID player=$PLAYER_ID team=$TEAM_ID"

ab() { agent-browser "$@" 2>&1 | grep -v "^✓ Done$"; }

# ── 1. МАТЧ 1280: боковые колонки вернулись? ──
ab set viewport 1280 900 >/dev/null
ab open "http://localhost:3100/match/$MATCH_ID" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
agent-browser screenshot scripts/smoke-44-match-1280.png >/dev/null 2>&1
MATCH_LAYOUT=$(agent-browser eval "(function(){
  var grid = document.querySelector('main > div');
  var cols = grid ? getComputedStyle(grid).gridTemplateColumns : '';
  var asides = document.querySelectorAll('main aside').length;
  var rightRail = document.querySelectorAll('main aside [data-rail], main aside .right-rail').length;
  var topAds = document.querySelectorAll('[data-match-ads]').length;
  return JSON.stringify({cols: cols, asides: asides, topAdsRow: topAds});
})()" 2>/dev/null | tail -1)
echo "MATCH-1280 layout: $MATCH_LAYOUT"

# ── 2. ПРОТОКОЛ: открыть вкладку, короткие имена «И. X» и ассист без скобок ──
agent-browser eval "(function(){ var b=document.querySelectorAll('button'); for(var i=0;i<b.length;i++){ var t=(b[i].textContent||'').trim(); if(t.indexOf('Протокол')===0){ b[i].click(); return 1; } } return 0; })()" >/dev/null 2>&1
sleep 2
agent-browser screenshot scripts/smoke-44-protocol-1280.png >/dev/null 2>&1
PROTO=$(agent-browser eval "(function(){
  var ev = document.querySelectorAll('[data-timeline-event]');
  var texts = [];
  ev.forEach(function(n){ if (n.textContent) texts.push(n.textContent.trim()); });
  var joined = texts.join(' | ').slice(0, 400);
  var hasShort = texts.filter(function(t){ return /(^|\\s)[А-ЯЁA-Z]\\. /.test(t); }).length;
  var assistParen = joined.match(/\\([^)]*[А-ЯЁA-Z]\\. [^)]*\\)/g) || [];
  return JSON.stringify({events: ev.length, withShortName: hasShort, assistInParens: assistParen.length, sample: joined.slice(0, 220)});
})()" 2>/dev/null | tail -1)
echo "PROTOCOL: $PROTO"

# ── 3. МАТЧ 375: мобайл ──
ab set viewport 375 700 >/dev/null
sleep 1
agent-browser screenshot scripts/smoke-44-match-375.png >/dev/null 2>&1

# ── 4. ГЛАВНАЯ: фикс-ширина кнопки даты при листании ──
ab open "http://localhost:3100/" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
DATE_W=$(agent-browser eval "(function(){
  var btns = document.querySelectorAll('main button');
  var btn = null;
  for (var i=0;i<btns.length;i++){ if ((btns[i].className||'').indexOf('w-[88px]')>=0){ btn=btns[i]; break; } }
  if (!btn) return 'no-date-button';
  return Math.round(btn.getBoundingClientRect().width);
})()" 2>/dev/null | tail -1)
# листаем на день назад ×2 и вперёд ×3 — ширина обязана совпадать
agent-browser eval "(function(){ document.querySelectorAll('button[aria-label=Предыдущий\\ день]')[0].click(); return 1; })()" >/dev/null 2>&1
sleep 1
DATE_W2=$(agent-browser eval "(function(){ var b=null; var bs=document.querySelectorAll('main button'); for(var i=0;i<bs.length;i++){ if((bs[i].className||'').indexOf('w-[88px]')>=0){b=bs[i];break;} } return b?Math.round(b.getBoundingClientRect().width):'x'; })()" 2>/dev/null | tail -1)
agent-browser eval "(function(){ for(var i=0;i<3;i++) document.querySelectorAll('button[aria-label=Следующий\\ день]')[0].click(); return 1; })()" >/dev/null 2>&1
sleep 1
DATE_W3=$(agent-browser eval "(function(){ var b=null; var bs=document.querySelectorAll('main button'); for(var i=0;i<bs.length;i++){ if((bs[i].className||'').indexOf('w-[88px]')>=0){b=bs[i];break;} } return b?Math.round(b.getBoundingClientRect().width):'x'; })()" 2>/dev/null | tail -1)
FILTER_ROWS=$(agent-browser eval "(function(){ var p=document.querySelector('main .overflow-x-auto'); return p?Math.round(p.getBoundingClientRect().height):'x'; })()" 2>/dev/null | tail -1)
DATE_W2=${DATE_W2:-x}; DATE_W3=${DATE_W3:-x}
agent-browser screenshot scripts/smoke-44-home-date.png >/dev/null 2>&1
echo "DATE-BTN widths: today=$DATE_W -1day=$DATE_W2 +3day=$DATE_W3 (должны совпасть), filter-row h=$FILTER_ROWS (~48)"

# ── 5. ПРОФИЛЬ игрока: без «Прямо сейчас»/«Самый результативный»/таблицы ──
if [ -n "$PLAYER_ID" ]; then
  ab set viewport 1280 900 >/dev/null
  ab open "http://localhost:3100/player/$PLAYER_ID" >/dev/null
  agent-browser wait --load networkidle >/dev/null 2>&1
  sleep 2
  agent-browser screenshot scripts/smoke-44-player-1280.png >/dev/null 2>&1
  PLAYER_LAYOUT=$(agent-browser eval "(function(){
    var t = document.body.innerText || '';
    var grid = document.querySelector('main > div');
    return JSON.stringify({
      asides: document.querySelectorAll('main aside').length,
      now: t.indexOf('Прямо сейчас') >= 0,
      topScorer: t.indexOf('Самый результативный') >= 0,
      cols: grid ? getComputedStyle(grid).gridTemplateColumns : ''
    });
  })()" 2>/dev/null | tail -1)
  echo "PLAYER-1280: $PLAYER_LAYOUT (asides=0, now=false, topScorer=false)"
fi

# ── 6. ПРОФИЛЬ команды: то же ──
if [ -n "$TEAM_ID" ]; then
  ab open "http://localhost:3100/team/$TEAM_ID" >/dev/null
  agent-browser wait --load networkidle >/dev/null 2>&1
  sleep 2
  agent-browser screenshot scripts/smoke-44-team-1280.png >/dev/null 2>&1
  TEAM_LAYOUT=$(agent-browser eval "(function(){
    var t = document.body.innerText || '';
    return JSON.stringify({
      asides: document.querySelectorAll('main aside').length,
      now: t.indexOf('Прямо сейчас') >= 0,
      topScorer: t.indexOf('Самый результативный') >= 0
    });
  })()" 2>/dev/null | tail -1)
  echo "TEAM-1280: $TEAM_LAYOUT (asides=0, now=false, topScorer=false)"
fi

bash scripts/smoke-standalone.sh stop >/dev/null 2>&1
agent-browser close >/dev/null 2>&1
echo "SMOKE-44-UI done"
