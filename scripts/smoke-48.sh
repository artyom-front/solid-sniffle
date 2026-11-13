#!/usr/bin/env bash
# SMOKE-48 · приёмка v1.0.48 (брендинг из админки) одним вызовом
# (грабли Task 44/45: фоновые процессы не переживают конец вызова shell):
#   1) поднять standalone :3100 (дев-БД с сидом), убив старый сервер смоука;
#   2) ДЕФОЛТ: file-conventions /icon.svg и /apple-icon.png УДАЛЕНЫ (404),
#      дефолтные иконки — /brand/logo47/mark-simple.svg + apple-icon.png;
#      <link rel=icon> в HTML главной указывает на дефолт; шапка —
#      двухъярусная вертикаль (2 пути + маска, НЕТ текст-узлов);
#   3) API-сценарий по-настоящему: логин (cookie) → GET /api/admin/brand
#      → загрузка фавикона POST multipart → ссылка icon в HTML главной
#      меняется на /api/media/<id> (+200, image/png) → загрузка лого →
#      в шапке <img src=/api/media/…> вместо svg → ЕVIL SVG (onload)
#      отклоняется 422 → PATCH-сброс → главная снова на дефолте;
#   4) UI админки: логин демо-кнопкой admin@ff21.ru → /admin?section=branding
#      → панель «Брендинг сайта» с тремя блоками (скриншот);
#   5) регресс: мобильный 375 (лого влезает, нет гориз. скролла);
#   6) скриншоты для VLM-контроля.
set -uo pipefail
cd /home/z/my-project

DB="postgresql://postgres:postgres@127.0.0.1:5432/scoresbox?schema=public"
JAR=/tmp/sb48-jar.txt
ICON_PNG=/tmp/sb48-icon.png
LOGO_PNG=/tmp/sb48-logo.png
EVIL_SVG=/tmp/sb48-evil.svg

# ── 0. тестовые ассеты (sharp из node_modules) + зачистка старого сервера ──
node -e '
const sharp = require("sharp");
(async () => {
  await sharp({ create: { width: 180, height: 180, channels: 4, background: { r: 192, g: 57, b: 43, alpha: 1 } } }).png().toFile("/tmp/sb48-icon.png");
  await sharp({ create: { width: 420, height: 140, channels: 4, background: { r: 41, g: 182, b: 246, alpha: 1 } } }).png().toFile("/tmp/sb48-logo.png");
  console.log("test assets ok");
})();
'
printf '%s\n' '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>' > "$EVIL_SVG"

pkill -f "bun server.js" 2>/dev/null
sleep 1
bash scripts/smoke-standalone.sh stop >/dev/null 2>&1
export DATABASE_URL="$DB" AUTH_SECRET="smoke-test-secret-v22" NODE_ENV=production PORT=3100 HOSTNAME=127.0.0.1 APP_VERSION="v1.0.48-smoke"
( cd .next/standalone && setsid nohup bun server.js </dev/null >/tmp/standalone-48.log 2>&1 & echo $! > /tmp/standalone.pid )

UP=0
for i in $(seq 1 40); do
  sleep 1
  H=$(curl -s --max-time 3 http://localhost:3100/api/health 2>/dev/null | head -c 60)
  [ -n "$H" ] && { echo "health: $H"; UP=1; break; }
done
[ "$UP" = "1" ] || { echo "SERVER DID NOT START"; tail -10 /tmp/standalone-48.log; exit 2; }

ab() { agent-browser "$@" 2>&1 | grep -v "^✓ Done$"; }

# ── 1. ДЕФОЛТ: ассеты и ссылки ──
ICON_DEF=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' http://localhost:3100/brand/logo47/mark-simple.svg)
APPLE_DEF=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' http://localhost:3100/brand/logo47/apple-icon.png)
ICON_OLD=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/icon.svg)
APPLE_OLD=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/apple-icon.png)
OG=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/og-image.png)
HTML=$(curl -s http://localhost:3100/)
ICON_LINK=$(echo "$HTML" | grep -o '<link rel="icon" href="[^"]*"' | head -2 | tr '\n' ' ')
APPLE_LINK=$(echo "$HTML" | grep -o '<link rel="apple-touch-icon" href="[^"]*"' | head -1)
echo "DEFAULTS: mark-simple=[$ICON_DEF] apple=[$APPLE_DEF] old-icon-svg=$ICON_OLD old-apple=$APPLE_OLD og=$OG"
echo "LINKS: icon=$ICON_LINK apple=$APPLE_LINK"

ab set viewport 1280 900 >/dev/null
ab open "http://localhost:3100/" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
agent-browser screenshot scripts/smoke-48-home-default-1280.png >/dev/null 2>&1
HEADER=$(agent-browser eval "(function(){
  var a = document.querySelector('header a[aria-label*=главную]') || document.querySelector('header a');
  var svg = a ? a.querySelector('svg') : null;
  var img = a ? a.querySelector('img') : null;
  var res = {hasImg: !!img, imgSrc: img ? (img.getAttribute('src')||'').slice(0,40) : null};
  if (svg) {
    res.paths = svg.querySelectorAll('path').length;
    res.texts = svg.querySelectorAll('text, tspan, textPath').length;
    res.mask = svg.querySelectorAll('mask').length;
    res.h = Math.round(svg.getBoundingClientRect().height);
    res.w = Math.round(svg.getBoundingClientRect().width);
  }
  return JSON.stringify(res);
})()" 2>/dev/null | tail -1)
echo "HEADER-DEFAULT-1280: $HEADER"

FOOTER=$(agent-browser eval "(function(){
  var svg = document.querySelector('footer svg');
  return JSON.stringify({footerSvg: !!svg, paths: svg ? svg.querySelectorAll('path').length : 0,
    h: svg ? Math.round(svg.getBoundingClientRect().height) : 0});
})()" 2>/dev/null | tail -1)
echo "FOOTER-DEFAULT: $FOOTER"

# ── 2. ЛОГИН (cookie) → GET brand ──
rm -f "$JAR"
LOGIN=$(curl -s -c "$JAR" -H "Content-Type: application/json" -d '{"email":"admin@ff21.ru","password":"admin123"}' http://localhost:3100/api/auth/login | head -c 120)
echo "LOGIN: $LOGIN"
BRAND0=$(curl -s -b "$JAR" http://localhost:3100/api/admin/brand)
echo "BRAND-GET-DEFAULT: $BRAND0"

# ── 3. ЗАГРУЗКА ФАВИКОНА → ссылка в HTML меняется ──
ICON_RES=$(curl -s -b "$JAR" -F "icon=@$ICON_PNG;type=image/png" http://localhost:3100/api/admin/brand)
echo "ICON-UPLOAD: $ICON_RES"
ICON_URL=$(echo "$ICON_RES" | python3 -c "import json,sys; print(json.load(sys.stdin)['branding']['iconUrl'])" 2>/dev/null)
ICON_MEDIA=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "http://localhost:3100$ICON_URL")
HTML2=$(curl -s http://localhost:3100/)
ICON_LINK2=$(echo "$HTML2" | grep -o '<link rel="icon" href="[^"]*"' | head -1)
echo "ICON-AFTER-UPLOAD: media=[$ICON_MEDIA] link=$ICON_LINK2 url-expected=$ICON_URL"

# ── 4. ЗАГРУЗКА ЛОГО → в шапке <img> вместо svg ──
LOGO_RES=$(curl -s -b "$JAR" -F "logoDark=@$LOGO_PNG;type=image/png" http://localhost:3100/api/admin/brand)
echo "LOGO-UPLOAD: $LOGO_RES"
LOGO_URL=$(echo "$LOGO_RES" | python3 -c "import json,sys; print(json.load(sys.stdin)['branding']['logoDarkUrl'])" 2>/dev/null)
ab open "http://localhost:3100/" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
agent-browser screenshot scripts/smoke-48-home-custom-1280.png >/dev/null 2>&1
HEADER2=$(agent-browser eval "(function(){
  var a = document.querySelector('header a[aria-label*=главную]') || document.querySelector('header a');
  var img = a ? a.querySelector('img') : null;
  var svg = a ? a.querySelector('svg') : null;
  return JSON.stringify({hasImg: !!img, src: img ? img.getAttribute('src') : null,
    h: img ? Math.round(img.getBoundingClientRect().height) : 0,
    svgGone: !svg, broken: img ? (img.complete && img.naturalWidth === 0) : null});
})()" 2>/dev/null | tail -1)
echo "HEADER-CUSTOM: $HEADER2 expected-src=$LOGO_URL"

FOOTER2=$(agent-browser eval "(function(){
  var img = document.querySelector('footer img');
  return JSON.stringify({footerImg: !!img, src: img ? img.getAttribute('src') : null});
})()" 2>/dev/null | tail -1)
echo "FOOTER-CUSTOM: $FOOTER2"

# ── 5. EVIL SVG отклоняется ──
EVIL=$(curl -s -o /tmp/sb48-evil-resp.json -w '%{http_code}' -b "$JAR" -F "logoLight=@$EVIL_SVG;type=image/svg+xml" http://localhost:3100/api/admin/brand)
EVIL_MSG=$(head -c 160 /tmp/sb48-evil-resp.json)
echo "EVIL-SVG: http=$EVIL body=$EVIL_MSG"

# ── 6. СБРОС → дефолт возвращается ──
RESET=$(curl -s -b "$JAR" -X PATCH -H "Content-Type: application/json" -d '{"logoDarkUrl":null,"logoLightUrl":null,"iconUrl":null}' http://localhost:3100/api/admin/brand)
echo "RESET: $RESET"
HTML3=$(curl -s http://localhost:3100/)
ICON_LINK3=$(echo "$HTML3" | grep -o '<link rel="icon" href="[^"]*"' | head -1)
ab open "http://localhost:3100/" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 1
BACK=$(agent-browser eval "(function(){
  var a = document.querySelector('header a[aria-label*=главную]') || document.querySelector('header a');
  return JSON.stringify({svgBack: !!a.querySelector('svg'), imgGone: !a.querySelector('img')});
})()" 2>/dev/null | tail -1)
echo "AFTER-RESET: link=$ICON_LINK3 header=$BACK"

# ── 7. UI АДМИНКИ: панель «Брендинг» ──
ab open "http://localhost:3100/admin" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
# демо-вход по кнопке с email (грабля: find label fill не триггерит React)
agent-browser eval "(function(){
  var btns = [].slice.call(document.querySelectorAll('button'));
  var b = btns.find(function(x){ return (x.textContent||'').indexOf('admin@ff21.ru') !== -1; });
  if (b) b.click();
  return b ? 'clicked' : 'not-found';
})()" >/dev/null 2>&1
sleep 3
ab open "http://localhost:3100/admin?section=branding" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
agent-browser screenshot scripts/smoke-48-admin-brand.png >/dev/null 2>&1
PANEL=$(agent-browser eval "(function(){
  var t = document.body.textContent || '';
  var has = function(s){ return t.indexOf(s) !== -1; };
  var blocks = document.querySelectorAll('h4').length;
  return JSON.stringify({branding: has('Брендинг сайта'), dark: has('тёмный фон'),
    light: has('светлый фон'), icon: has('Иконка браузера'), blocks: blocks,
    resetBtns: document.querySelectorAll('button').length});
})()" 2>/dev/null | tail -1)
echo "ADMIN-BRAND-PANEL: $PANEL"

# ── 8. РЕГРЕСС: мобильный 375 ──
ab set viewport 375 700 >/dev/null
ab open "http://localhost:3100/" >/dev/null
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
agent-browser screenshot scripts/smoke-48-home-375.png >/dev/null 2>&1
MOBILE=$(agent-browser eval "(function(){
  var a = document.querySelector('header a[aria-label*=главную]') || document.querySelector('header a');
  var el = a ? (a.querySelector('svg') || a.querySelector('img')) : null;
  var r = el ? el.getBoundingClientRect() : null;
  return JSON.stringify({
    logoRight: r ? Math.round(r.right) : null,
    logoH: r ? Math.round(r.height) : null,
    noHScroll: document.documentElement.scrollWidth <= 375
  });
})()" 2>/dev/null | tail -1)
echo "HOME-375: $MOBILE"

# ── 9. стоп ──
bash scripts/smoke-standalone.sh stop >/dev/null 2>&1
pkill -f "bun server.js" 2>/dev/null
echo "SMOKE-48 DONE"
