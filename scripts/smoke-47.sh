#!/usr/bin/env bash
# SMOKE-47 · приёмка v1.0.47 (лого-бриф 2026-10-06) одним вызовом
# (грабля Task 44/45: фоновые процессы не переживают конец вызова shell):
#   1) поднять standalone :3100 (дев-БД с сидом);
#   2) ассеты: /icon.svg — УПРОЩЁННЫЙ знак (без штрафных), apple-icon и
#      og-image PNG 200, витрина /brand/logo-variants.html 200,
#      /logo.svg (вертикальный) и /brand/logo47/*.svg 200;
#   3) шапка 1280: лого = ЧИСТЫЕ ПУТИ (svg path, НЕТ живого текста),
#      знак 32px, слоган справа; футер — горизонтальный лого;
#   4) мобайл 375: лого влезает, горизонтального скролла нет;
#   5) /admin (вход): вертикальный лого-путь (scores белый над box);
#   6) регресс сети: главная 1280 — 3 колонки; матч: дата цифрами,
#      «за N матч», БЕЗ «забивала/пропускала»;
#   7) скриншоты для VLM-контроля.
set -uo pipefail
cd /home/z/my-project

DB="postgresql://postgres:postgres@127.0.0.1:5432/scoresbox?schema=public"
MATCH_ID="${MATCH_ID:-cmuvby70y00rplzzifw6xwt29}"

bash scripts/smoke-standalone.sh stop >/dev/null 2>&1
export DATABASE_URL="$DB" AUTH_SECRET="smoke-test-secret-v22" NODE_ENV=production PORT=3100 HOSTNAME=127.0.0.1 APP_VERSION="v1.0.47-smoke"
( cd .next/standalone && setsid nohup bun server.js </dev/null >/tmp/standalone-47.log 2>&1 & echo $! > /tmp/standalone.pid )

UP=0
for i in $(seq 1 40); do
  sleep 1
  H=$(curl -s --max-time 3 http://localhost:3100/api/health 2>/dev/null | head -c 60)
  [ -n "$H" ] && { echo "health: $H"; UP=1; break; }
done
[ "$UP" = "1" ] || { echo "SERVER DID NOT START"; tail -10 /tmp/standalone-47.log; exit 2; }

ab() { agent-browser "$@" 2>&1 | grep -v "^✓ Done$"; }

# ── 0. ассеты ──
FAV=$(curl -s http://localhost:3100/icon.svg)
FAV_STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/icon.svg)
# упрощённый знак: НЕТ координат штрафных (y0=21.5 у полной версии)
FAV_SIMPLE=$(echo "$FAV" | grep -c 'y="21.5"')
FAV_RING=$(echo "$FAV" | grep -c '<circle')
APPLE=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' http://localhost:3100/apple-icon.png)
OG=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' http://localhost:3100/og-image.png)
LOGO=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' http://localhost:3100/logo.svg)
SHOW=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/brand/logo-variants.html)
CANON=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/brand/logo47/vertical-dark.svg)
echo "ASSETS: icon=$FAV_STATUS(penRects=$FAV_SIMPLE circles=$FAV_RING) apple=[$APPLE] og=[$OG] logo=[$LOGO] showcase=$SHOW canonical=$CANON"

# ── 1. ШАПКА 1280: лого = пути, знак 32, слоган ──
ab set viewport 1280 900 >/dev/null
ab open "http://localhost:3100/" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
agent-browser screenshot scripts/smoke-47-home-1280.png >/dev/null 2>&1
HEADER=$(agent-browser eval "(function(){
  var a = document.querySelector('header a[aria-label*=главную]') || document.querySelector('header a');
  var svg = a ? a.querySelector('svg') : null;
  var res = {hasSvg: !!svg};
  if (svg) {
    res.paths = svg.querySelectorAll('path').length;
    res.texts = svg.querySelectorAll('text, tspan, textPath').length; // 0 = чистые пути
    res.mask = svg.querySelectorAll('mask').length;
    res.h = svg.getAttribute('height') || (svg.getBoundingClientRect().height);
    res.w = Math.round(svg.getBoundingClientRect().width);
    res.box = Math.round(svg.getBoundingClientRect().height);
  }
  var grid = document.querySelector('main > div');
  res.gridCols = grid ? getComputedStyle(grid).gridTemplateColumns : '';
  return JSON.stringify(res);
})()" 2>/dev/null | tail -1)
echo "HEADER-1280: $HEADER"

FOOTER=$(agent-browser eval "(function(){
  var svg = document.querySelector('footer svg');
  return JSON.stringify({footerSvg: !!svg, paths: svg ? svg.querySelectorAll('path').length : 0,
    h: svg ? Math.round(svg.getBoundingClientRect().height) : 0});
})()" 2>/dev/null | tail -1)
echo "FOOTER: $FOOTER"

# ── 2. МОБАЙЛ 375: лого влезает, нет горизонтального скролла ──
ab set viewport 375 700 >/dev/null
sleep 1
agent-browser screenshot scripts/smoke-47-home-375.png >/dev/null 2>&1
MOBILE=$(agent-browser eval "(function(){
  var a = document.querySelector('header a[aria-label*=главную]') || document.querySelector('header a');
  var svg = a ? a.querySelector('svg') : null;
  var r = svg ? svg.getBoundingClientRect() : null;
  return JSON.stringify({
    logoRight: r ? Math.round(r.right) : null,
    logoW: r ? Math.round(r.width) : null,
    logoH: r ? Math.round(r.height) : null,
    scrollW: document.documentElement.scrollWidth,
    noHScroll: document.documentElement.scrollWidth <= 375
  });
})()" 2>/dev/null | tail -1)
echo "HOME-375: $MOBILE"

# ── 3. /admin: вертикальный лого из путей ──
ab set viewport 1280 900 >/dev/null
ab open "http://localhost:3100/admin" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
agent-browser screenshot scripts/smoke-47-admin-login.png >/dev/null 2>&1
LOGIN=$(agent-browser eval "(function(){
  var svgs = document.querySelectorAll('svg[role=img]');
  var v = null;
  svgs.forEach(function(s){ if ((s.getAttribute('aria-label')||'')==='SCORESBOX' && !v) v = s; });
  return JSON.stringify({verticalSvg: !!v, paths: v ? v.querySelectorAll('path').length : 0,
    masks: v ? v.querySelectorAll('mask').length : 0,
    h: v ? Math.round(v.getBoundingClientRect().height) : 0,
    w: v ? Math.round(v.getBoundingClientRect().width) : 0});
})()" 2>/dev/null | tail -1)
echo "ADMIN-LOGIN: $LOGIN"

# ── 4. ВИТРИНА + канонические SVG-файлы ──
ab open "http://localhost:3100/brand/logo-variants.html" >/dev/null
sleep 1
agent-browser screenshot scripts/smoke-47-brand.png >/dev/null 2>&1
BRAND=$(agent-browser eval "(function(){
  var imgs = document.querySelectorAll('img');
  var broken = [].slice.call(imgs).filter(function(i){ return i.complete && i.naturalWidth === 0; }).length;
  return JSON.stringify({imgs: imgs.length, broken: broken});
})()" 2>/dev/null | tail -1)
echo "BRAND-PAGE: $BRAND"

# ── 5. РЕГРЕСС: матч — превью в 3 строки + статистика ──
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
fi
echo "match id: $MID"
ab open "http://localhost:3100/match/$MID" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
agent-browser screenshot scripts/smoke-47-match-1280.png >/dev/null 2>&1
REG=$(agent-browser eval "(function(){
  var body = document.body.textContent || '';
  var grid = document.querySelector('main > div');
  return JSON.stringify({
    cols: grid ? getComputedStyle(grid).gridTemplateColumns : '',
    dateNum: /\d{2}.\d{2}.\d{2}/.test(body),
    timeMsk: /\d{2}:\d{2} МСК/.test(body),
    shortForm: /за \d+ матч/.test(body),
    oldWords: /(забивала|пропускала) /.test(body)
  });
})()" 2>/dev/null | tail -1)
echo "MATCH-REGRESS: $REG"

# ── 6. стоп ──
bash scripts/smoke-standalone.sh stop >/dev/null 2>&1
echo "SMOKE-47 DONE"
