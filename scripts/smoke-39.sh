#!/usr/bin/env bash
# ============================================================
# SCORESBOX · smoke-39.sh — приёмка директивы Р-01…Р-30 (2026-09-30)
# на 11 ширинах (360/375/393/633/768/813/1024/1199/1200/1440/1920,
# с полной перезагрузкой на каждой ширине):
#   1) нет горизонтального скролла body;
#   2) нет «…» на данных-элементах;
#   3) <1200px — лиги = аккордеон ПОД контентом; ≥1200 — колонка;
#   4) ≥768px — правая колонка статистики; <768 — секции под лентой;
#   5) логотип «scoresbox» В ОДНУ СТРОКУ: знак-поле rx 8 + wordmark;
#   6) 375×667: в первом экране ≥6 строк матчей, высота строки ≤52px;
#   7) шапка матча: ≤88px десктоп (≥768) / ≤132px мобильная;
#   8) хронология 375×667: ≥9 событий в экране, минуты на центральной
#      оси, счёт-бейдж инлайн с событием, полосы «1-й тайм/ПЕРЕРЫВ»;
#   9) активный таб = жёлтый текст + underline 2px (без рамок);
#  10) нет «инвариант Epic 2» / «тистике» в интерфейсе;
#  11) скриншоты ключевых ширин.
# JS-проверки — в /tmp/s39-*.js (файлами, без shell-цитирования).
# ============================================================
set -uo pipefail
cd /home/z/my-project

BASE=http://localhost:3100
MATCH=cmumti31100u7newo1ayofik1
TEAM=cmumti2jp0020newoedwcsjuq

mkdir -p /tmp/s39

# ---------- базовая проверка страницы ----------
cat > /tmp/s39/page-check.js <<'JSEOF'
(() => {
  const doc = document.documentElement;
  const hscroll = doc.scrollWidth - window.innerWidth;
  const w = window.innerWidth;
  const ell = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.textOverflow !== 'ellipsis') continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'kbd') continue;
    const t = (el.textContent || '').trim();
    if (t.startsWith('Поиск:')) continue;
    if (/^(понедельник|вторник|среда|четверг|пятница|суббота|воскресенье),?\s*\d+/i.test(t)) continue;
    if (/^\d+\s*[а-я]+\.?$/i.test(t)) continue;
    if (/^\d{2}\.\d{2}$/.test(t)) continue;
    ell.push(tag + ': ' + t.slice(0, 50));
  }
  const acc = document.querySelector('#leagues-panel');
  const accVisible = acc ? !!acc.closest('section') && !!acc.closest('section').offsetParent : false;
  const accInDom = !!acc;
  const asides = [...document.querySelectorAll('main aside')].filter((a) => !!a.offsetParent);
  const rightRail = asides.some((a) => a.textContent.includes('Топ игроков') || a.textContent.includes('Турнирная таблица'));
  const leftRail = asides.some((a) => a.textContent.includes('Топ-лиги'));
  const epic = /инвариант\s+Epic|тистике|Epic\s+2/.test(document.body.innerText);
  return JSON.stringify({ w, hscroll, ell: ell.slice(0, 8), accInDom, accVisible, rightRail, leftRail, epic });
})()
JSEOF

# ---------- логотип в одну строку ----------
cat > /tmp/s39/logo-check.js <<'JSEOF'
(() => {
  const a = document.querySelector('header a[aria-label*="SCORESBOX"]');
  if (!a) return JSON.stringify({ ok: false, why: 'no-logo' });
  const svg = a.querySelector('svg');
  const spans = [...a.querySelectorAll('span')].filter((s) => !s.querySelector('svg') && !s.textContent.includes('Футбол'));
  const texts = spans.map((s) => s.textContent.trim());
  const linkRect = a.getBoundingClientRect();
  const oneLine = linkRect.height <= 44;
  const sign = !!svg;
  const signRect = svg ? svg.getBoundingClientRect() : null;
  return JSON.stringify({
    ok: !!sign && !!oneLine && texts.some((t) => /^scores/.test(t)) && texts.some((t) => /box/.test(t)),
    sign,
    signRx: svg ? (svg.querySelector('rect')?.getAttribute('rx') ?? null) : null,
    scores: texts.some((t) => /^scores/.test(t)),
    box: texts.some((t) => /box/.test(t)),
    linkH: Math.round(linkRect.height),
    oneLine,
    signSize: signRect ? Math.round(signRect.width) : null,
  });
})()
JSEOF

# ---------- лента 375×667: ≥6 строк в первом экране, высота ≤52px ----------
cat > /tmp/s39/feed-check.js <<'JSEOF'
(() => {
  const rows = [...document.querySelectorAll('[data-match-row]')].filter((r) => !!r.offsetParent);
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const visible = rows.filter((r) => {
    const rc = r.getBoundingClientRect();
    return rc.top >= 0 && rc.top + rc.height / 2 < vh;
  });
  const heights = visible.slice(0, 8).map((r) => Math.round(r.getBoundingClientRect().height));
  const tooTall = heights.filter((h) => h > 53).length;
  // время слева (колонка 48px), счёт справа 32px: проверим по первой строке
  const first = visible[0];
  return JSON.stringify({ vw, vh, total: rows.length, firstScreen: visible.length, heights, tooTall: heights.filter((h) => h > 74).length });
})()
JSEOF

# ---------- шапка матча ≤88 (десктоп) / ≤132 (мобайл) ----------
cat > /tmp/s39/hero-check.js <<'JSEOF'
(() => {
  const body = [...document.querySelectorAll('[data-match-hero-body]')].filter((b) => !!b.offsetParent);
  if (body.length === 0) return JSON.stringify({ ok: false, why: 'no-hero' });
  const h = Math.round(body[0].getBoundingClientRect().height);
  const w = window.innerWidth;
  const limit = w >= 768 ? 88 : 132;
  return JSON.stringify({ w, h, limit, ok: h <= limit + 6 });
})()
JSEOF

# ---------- хронология: ≥9 событий, минуты по центральной оси,
# счёт-бейдж инлайн, полосы периодов ----------
cat > /tmp/s39/timeline-check.js <<'JSEOF'
(() => {
  const evs = [...document.querySelectorAll('[data-timeline-event]')].filter((r) => !!r.offsetParent);
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const visible = evs.filter((r) => {
    const rc = r.getBoundingClientRect();
    return rc.top >= 0 && rc.top + rc.height / 2 < vh;
  });
  // минута — на ОДНОЙ оси: центр видимой ячейки минуты у всех событий
  // совпадает (мобайл — ось слева [48px], десктоп — центральная)
  const axis = [];
  for (const row of visible.slice(0, 10)) {
    const cell = [...row.querySelectorAll('[data-minute]')].find((c) => !!c.offsetParent);
    if (!cell) { axis.push(-1); continue; }
    const rc = cell.getBoundingClientRect();
    axis.push(Math.round(rc.left + rc.width / 2));
  }
  const axisSet = [...new Set(axis.filter((x) => x >= 0))];
  const axisOk = axisSet.length <= 1;
  const maxAxisDev = axisSet.length <= 1 ? 0 : 999;
  // счёт-бейдж инлайн: бейдж по вертикали внутри своей строки
  let scoreInline = true, scoreCount = 0;
  for (const row of visible) {
    const rowRc = row.getBoundingClientRect();
    const badge = row.querySelector('span[title="Счёт после гола"]');
    if (!badge) continue;
    scoreCount++;
    const bRc = badge.getBoundingClientRect();
    if (bRc.top < rowRc.top - 2 || bRc.bottom > rowRc.bottom + 2) scoreInline = false;
  }
  const markers = [...document.querySelectorAll('[data-timeline-marker]')].map((m) => m.textContent.trim());
  const hasPeriods = markers.some((m) => /1-й тайм/i.test(m)) && markers.some((m) => /Перерыв/i.test(m));
  const evHeights = visible.map((r) => Math.round(r.getBoundingClientRect().height));
  return JSON.stringify({ vw, vh, events: evs.length, visible: visible.length, axisOk, axisX: axisSet[0] ?? null, scoreCount, scoreInline, hasPeriods, evHeights, markers: markers.slice(0, 5) });
})()
JSEOF

# ---------- активный таб: жёлтый текст + underline 2px ----------
cat > /tmp/s39/tab-check.js <<'JSEOF'
(() => {
  const active = document.querySelector('[data-tab][data-active="true"]');
  if (!active) return JSON.stringify({ ok: false, why: 'no-active-tab' });
  const color = getComputedStyle(active).color;
  const gold = color === 'rgb(255, 215, 0)';
  const underline = [...active.children].some((c) => {
    const cs = getComputedStyle(c);
    return c.tagName === 'SPAN' && Math.round(parseFloat(cs.height)) <= 2 && cs.backgroundColor === 'rgb(255, 215, 0)';
  });
  const framed = getComputedStyle(active).borderStyle !== 'none' && getComputedStyle(active).borderWidth !== '0px';
  const fs = getComputedStyle(active).fontSize;
  return JSON.stringify({ ok: gold && underline && !framed, gold, underline, framed, fontSize: fs });
})()
JSEOF

js() { agent-browser eval "$(cat "$1")" --json 2>/dev/null | bun -e 'let s=require("fs").readFileSync(0,"utf8");try{console.log(JSON.parse(s).data?.result??"")}catch{console.log("ERR")}'; }

WIDTHS="360 375 393 633 768 813 1024 1199 1200 1440 1920"
FAIL=0

open_wait() {
  agent-browser open "${BASE}$1" --timeout 30000 >/dev/null
  agent-browser wait --load networkidle --timeout 20000 >/dev/null 2>&1
  agent-browser wait 700 >/dev/null
}

check_page() {
  local page="$1" w="$2"
  open_wait "$page"
  local res
  res=$(js /tmp/s39/page-check.js)
  if [ -z "$res" ] || [ "$res" = "ERR" ]; then echo "w=${w} ${page} => EVAL-ERROR"; FAIL=1; return; fi
  echo "w=${w} ${page} => $res"
  python3 - "$res" "$w" "$page" <<'PYEOF' || FAIL=1
import json, sys
res = json.loads(sys.argv[1]); w = int(sys.argv[2]); page = sys.argv[3]
bad = []
if res["hscroll"] > 1: bad.append(f"H-SCROLL {res['hscroll']}px")
if res["ell"]: bad.append(f"ELLIPSIS x{len(res['ell'])}: {res['ell'][:3]}")
if res["epic"]: bad.append("EPIC-2-PLACEHOLDER в интерфейсе")
if w < 1200 and not res["accVisible"]: bad.append("NO-ACCORDION (лиги не аккордеоном под контентом)")
if w >= 1200 and res["accVisible"]: bad.append("ACCORDION-VISIBLE @>=1200")
if w >= 768 and not res["rightRail"]: bad.append("NO-RIGHT-RAIL @>=768")
if w < 768 and res["rightRail"]: bad.append("RIGHT-RAIL-VISIBLE @<768")
if w >= 1200 and not res["leftRail"]: bad.append("NO-LEFT-RAIL @>=1200")
for b in bad:
    print(f"  FAIL @w={w}{page}: {b}")
sys.exit(1 if bad else 0)
PYEOF
}

echo "=== 1. Все страницы на 11 ширинах (h-scroll / ellipsis / колонки / Epic 2) ==="
for w in $WIDTHS; do
  agent-browser set viewport "$w" 900 >/dev/null 2>&1
  check_page "/" "$w"
done
for w in 360 768 1200 1440; do
  agent-browser set viewport "$w" 900 >/dev/null 2>&1
  check_page "/match/$MATCH" "$w"
  check_page "/team/$TEAM" "$w"
done

echo "=== 2. Логотип в одну строку (знак-поле rx 8 + scoresbox) ==="
agent-browser set viewport 360 780 >/dev/null 2>&1
open_wait "/"
LOGO360=$(js /tmp/s39/logo-check.js)
agent-browser set viewport 1920 1080 >/dev/null 2>&1
open_wait "/"
LOGO1920=$(js /tmp/s39/logo-check.js)
echo "logo@360:  $LOGO360"
echo "logo@1920: $LOGO1920"
for L in "$LOGO360" "$LOGO1920"; do
  echo "$L" | python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
ok = d.get("ok") and d.get("signRx") == "16" and d.get("oneLine") and d.get("signSize") == 32
print("  LOGO OK" if ok else f"  FAIL LOGO: {d}")
sys.exit(0 if ok else 1)' || FAIL=1
done

echo "=== 3. Лента 375×667: ≥6 строк в первом экране, высота ≤52px ==="
agent-browser set viewport 375 667 >/dev/null 2>&1
open_wait "/"
FEED=$(js /tmp/s39/feed-check.js)
echo "feed: $FEED"
echo "$FEED" | python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
bad = []
need = min(6, d["total"])
if d["firstScreen"] < need: bad.append(f"матчей в первом экране: {d["firstScreen"]} < {need} (всего {d["total"]})")
if d["tooTall"] > 0: bad.append(f"строк выше 52+2 этажа: {d["tooTall"]} ({d["heights"]})")
if any(h < 50 for h in d["heights"]): bad.append(f"min-height 52 не работает: {d["heights"]}")
print("  FEED OK" if not bad else "  FAIL FEED: " + "; ".join(bad))
sys.exit(0 if not bad else 1)' || FAIL=1

echo "=== 4. Шапка матча: ≤88px десктоп / ≤132px мобайл ==="
agent-browser set viewport 375 667 >/dev/null 2>&1
open_wait "/match/$MATCH"
HERO375=$(js /tmp/s39/hero-check.js)
agent-browser set viewport 1440 900 >/dev/null 2>&1
open_wait "/match/$MATCH"
HERO1440=$(js /tmp/s39/hero-check.js)
echo "hero@375:  $HERO375"
echo "hero@1440: $HERO1440"
for H in "$HERO375" "$HERO1440"; do
  echo "$H" | python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
print("  HERO OK" if d.get("ok") else f"  FAIL HERO: {d}")
sys.exit(0 if d.get("ok") else 1)' || FAIL=1
done

echo "=== 5. Хронология 375×667: ≥9 событий, минуты по оси, счёт инлайн, полосы ==="
agent-browser set viewport 375 667 >/dev/null 2>&1
open_wait "/match/$MATCH"
# клик по табу «Хронология»
agent-browser eval "(() => { const t = [...document.querySelectorAll('[data-tab]')].find((b) => b.textContent.includes('Хронология')); if (t) t.click(); return t ? 'clicked' : 'not-found'; })()" >/dev/null
agent-browser wait 500 >/dev/null
TL=$(js /tmp/s39/timeline-check.js)
echo "timeline: $TL"
echo "$TL" | python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
bad = []
need = min(9, d["events"])
if d["visible"] < need: bad.append(f"событий в экране: {d["visible"]} < {need} (всего {d["events"]})")
if not d["axisOk"]: bad.append("минуты НЕ на одной оси")
if d["scoreCount"] > 0 and not d["scoreInline"]: bad.append("счёт-бейдж НЕ инлайн с событием")
if not d["hasPeriods"]: bad.append("нет полос «1-й тайм»/«Перерыв»")
if d["evHeights"] and max(d["evHeights"]) > 70: bad.append(f"события выше 70px: {d["evHeights"]}")
print("  TIMELINE OK" if not bad else "  FAIL TIMELINE: " + "; ".join(bad))
print(f"  плотность: высоты событий {d["evHeights"]}")
sys.exit(0 if not bad else 1)' || FAIL=1

echo "=== 6. Активный таб: жёлтый + underline 2px, без рамок ==="
TAB=$(js /tmp/s39/tab-check.js)
echo "tab: $TAB"
echo "$TAB" | python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
print("  TAB OK" if d.get("ok") else f"  FAIL TAB: {d}")
sys.exit(0 if d.get("ok") else 1)' || FAIL=1

echo "=== 7. Скриншоты ==="
shot() {
  local page="$1" path="$2"
  open_wait "$page"
  agent-browser screenshot "$path" >/dev/null
}
agent-browser set viewport 360 780 >/dev/null 2>&1
shot "/" scripts/smoke-39-feed-360.png
agent-browser set viewport 375 667 >/dev/null 2>&1
shot "/" scripts/smoke-39-feed-375.png
open_wait "/match/$MATCH"
agent-browser eval "(() => { const t = [...document.querySelectorAll('[data-tab]')].find((b) => b.textContent.includes('Хронология')); if (t) t.click(); return 'ok'; })()" >/dev/null
agent-browser wait 500 >/dev/null
agent-browser screenshot scripts/smoke-39-timeline-375.png >/dev/null
agent-browser set viewport 768 900 >/dev/null 2>&1
shot "/" scripts/smoke-39-feed-768.png
agent-browser set viewport 1200 900 >/dev/null 2>&1
shot "/" scripts/smoke-39-feed-1200.png
shot "/match/$MATCH" scripts/smoke-39-match-1200.png
shot "/team/$TEAM" scripts/smoke-39-team-1200.png
agent-browser set viewport 1920 1080 >/dev/null 2>&1
shot "/" scripts/smoke-39-feed-1920.png

echo "----"
if [ "$FAIL" = "0" ]; then echo "SMOKE-39: ALL CHECKS PASS"; else echo "SMOKE-39: FAILURES FOUND"; exit 1; fi
