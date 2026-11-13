#!/usr/bin/env bash
# ============================================================
# SCORESBOX · smoke-40.sh — приёмка фидбека 2026-10-01 (v1.0.40)
# на 11 ширинах (360/375/393/633/768/813/1024/1199/1200/1440/1920):
#   1) нет h-scroll body и ellipsis на данных;
#   2) панели даты/Live/Завершённые — В ОДНУ СТРОКУ на 375/360/320;
#   3) лого «scoresb□x»: знак-поле ВЛОЖЕН вместо «o», одна строка,
#      размер знака = 0.62 кегля, на базовой линии;
#   4) хронология по эталону FlashScore: минуты у ВНЕШНЕГО края
#      (хозяева — слева, гости — справа), не по центральной оси;
#   5) составы: БЕЗ позиций, имя НЕ коллапсирует в столбик букв
#      (строка с 5 значками — имя ≥60px шириной);
#   6) страница матча: в правой колонке НЕТ «Прямо сейчас» /
#      «Самого результативного» / таблицы / топа (только баннеры);
#   7) имена команд БЕЗ «№N» (в dev-БД команда «Химик-НО №3»);
#   8) шапка матча ≤88/≤132px; лента 375: ≥6 строк ≤52px;
#   9) активный таб = золото + underline 2px;
#  10) скриншоты ключевых ширин.
# JS-проверки — в /tmp/s40-*.js. Требует prod standalone на :3100.
# ============================================================
set -uo pipefail
cd /home/z/my-project

BASE=http://localhost:3100
MATCH=cmupfoukk00r3qcw4vcuvmrsa
TEAM=cmupfou4d000rqcw4upwl8jvu

mkdir -p /tmp/s40

# ---------- базовая проверка страницы ----------
cat > /tmp/s40/page-check.js <<'JSEOF'
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
  const asides = [...document.querySelectorAll('main aside')].filter((a) => !!a.offsetParent);
  const isMatch = location.pathname.startsWith('/match/');
  // правая колонка: на обычных страницах — виджеты, на матче — только реклама
  const rightRailWidgets = asides.some((a) => a.textContent.includes('Топ игроков') || a.textContent.includes('Турнирная таблица'));
  const rightRailBox = asides.some((a) => a.getBoundingClientRect().x > window.innerWidth / 2);
  const leftRail = asides.some((a) => a.textContent.includes('Топ-лиги'));
  return JSON.stringify({ w, hscroll, ell: ell.slice(0, 8), accVisible, isMatch, rightRailWidgets, rightRailBox, leftRail });
})()
JSEOF

# ---------- логотип: вложенный знак + одна строка ----------
cat > /tmp/s40/logo-check.js <<'JSEOF'
(() => {
  const a = document.querySelector('header a[aria-label*="SCORESBOX"]');
  if (!a) return JSON.stringify({ ok: false, why: 'no-logo' });
  const svg = a.querySelector('svg');
  const linkRect = a.getBoundingClientRect();
  const oneLine = linkRect.height <= 44;
  const txt = a.textContent.replace(/\s+/g, '');
  const hasWordmark = /^scoresbx/.test(txt);
  if (!svg) return JSON.stringify({ ok: false, why: 'no-inline-glyph', txt, oneLine });
  const sr = svg.getBoundingClientRect();
  const fs = parseFloat(getComputedStyle(svg).fontSize);
  const ratio = +(sr.height / fs).toFixed(2);
  const insideWordmark = !!svg.closest('span');
  return JSON.stringify({
    ok: oneLine && hasWordmark && insideWordmark && ratio > 0.5 && ratio < 0.75,
    txt, oneLine, hasWordmark, insideWordmark,
    glyphH: Math.round(sr.height), fontSize: fs, ratio,
  });
})()
JSEOF

# ---------- панель дат: ВСЕГДА одна строка ----------
cat > /tmp/s40/filters-check.js <<'JSEOF'
(() => {
  const prev = document.querySelector('button[aria-label="Предыдущий день"]');
  if (!prev) return JSON.stringify({ ok: false, why: 'no-panel' });
  const row = prev.closest('.overflow-x-auto');
  if (!row) return JSON.stringify({ ok: false, why: 'no-scroll-row' });
  const rowRc = row.getBoundingClientRect();
  const live = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Live');
  const fin = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Завершённые');
  if (!live || !fin) return JSON.stringify({ ok: false, why: 'no-status-btns' });
  const lr = live.getBoundingClientRect(), fr = fin.getBoundingClientRect(), pr = prev.getBoundingClientRect();
  const oneLine = Math.abs(lr.y - pr.y) < 2 && Math.abs(fr.y - pr.y) < 2;
  const cal = row.querySelector('label');
  const calHidden = !cal || getComputedStyle(cal).display === 'none';
  const innerScroll = row.scrollWidth - row.clientWidth;
  const hscroll = document.documentElement.scrollWidth - window.innerWidth;
  const panelH = Math.round(rowRc.height);
  return JSON.stringify({
    ok: oneLine && hscroll <= 1 && panelH <= 52,
    w: window.innerWidth, oneLine, calHidden, innerScroll, hscroll, panelH,
  });
})()
JSEOF

# ---------- хронология: минуты у ВНЕШНЕГО края (эталон FS) ----------
cat > /tmp/s40/timeline-check.js <<'JSEOF'
(() => {
  const evs = [...document.querySelectorAll('[data-timeline-event]')].filter((r) => !!r.offsetParent);
  const vh = window.innerHeight;
  const visible = evs.filter((r) => { const rc = r.getBoundingClientRect(); return rc.top >= 0 && rc.top + rc.height / 2 < vh; });
  // минута у внешнего края: центр минуты в первых/последних 56px строки
  let outer = 0, inner = 0, sides = [];
  for (const row of evs) {
    const rc = row.getBoundingClientRect();
    const cell = [...row.querySelectorAll('[data-minute]')].find((c) => !!c.offsetParent);
    if (!cell) continue;
    const mc = cell.getBoundingClientRect();
    const center = mc.left + mc.width / 2;
    const fromLeft = center - rc.left;
    const fromRight = rc.right - center;
    if (fromLeft <= 56) { outer++; sides.push('L'); }
    else if (fromRight <= 56) { outer++; sides.push('R'); }
    else inner++;
  }
  // у каждого события своя сторона — и обе стороны используются
  const hasBothSides = sides.includes('L') && sides.includes('R');
  // счёт-бейдж инлайн
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
  return JSON.stringify({
    vw: window.innerWidth, events: evs.length, visible: visible.length,
    outer, inner, hasBothSides, scoreCount, scoreInline, hasPeriods, evHeights,
    markers: markers.slice(0, 5),
    ok: inner === 0 && hasBothSides && hasPeriods && (scoreCount === 0 || scoreInline),
  });
})()
JSEOF

# ---------- составы: без позиций, имя не коллапсирует ----------
cat > /tmp/s40/lineups-check.js <<'JSEOF'
(() => {
  const rows = [...document.querySelectorAll('button')].filter((b) => {
    const cls = (b.className || '').toString();
    return cls.includes('min-h-[40px]') && cls.includes('flex-wrap') && b.textContent.trim().length > 2;
  });
  if (rows.length === 0) return JSON.stringify({ ok: false, why: 'no-lineup-rows' });
  let posFound = false, collapsed = 0, marksRow = null, nameMinW = 999;
  for (const b of rows) {
    if (/Вратарь|Защитник|Полузащитник|Нападающий/.test(b.textContent)) posFound = true;
    const name = b.querySelector('span.break-words');
    if (name) {
      const nr = name.getBoundingClientRect();
      if (nr.width > 5 && nr.width < 50) collapsed++;
      if (nr.width > 5) nameMinW = Math.min(nameMinW, Math.round(nr.width));
    }
    const marks = b.querySelectorAll('.bg-s2\\/70').length;
    if (marks >= 4 && !marksRow) marksRow = { marks, rowH: Math.round(b.getBoundingClientRect().height) };
  }
  return JSON.stringify({
    rows: rows.length, posFound, collapsed, nameMinW,
    rowWith4plusMarks: marksRow,
    ok: !posFound && collapsed === 0 && !!marksRow && marksRow.rowH <= 120,
  });
})()
JSEOF

# ---------- страница матча: колонка без общих виджетов ----------
cat > /tmp/s40/rail-check.js <<'JSEOF'
(() => {
  if (!location.pathname.startsWith('/match/')) return JSON.stringify({ ok: true, skip: 'not-match' });
  const body = document.body.innerText;
  const asides = [...document.querySelectorAll('main aside')].filter((a) => !!a.offsetParent);
  const rail = asides.find((a) => a.getBoundingClientRect().x > window.innerWidth / 2);
  return JSON.stringify({
    w: window.innerWidth,
    hasLive: body.includes('Прямо сейчас'),
    hasBest: body.includes('Самый результативный'),
    hasTop: body.includes('Топ игроков'),
    hasStand: body.includes('Турнирная таблица'),
    railExists: !!rail,
    ok: !body.includes('Прямо сейчас') && !body.includes('Самый результативный') && !body.includes('Топ игроков'),
  });
})()
JSEOF

# ---------- шапка матча ----------
cat > /tmp/s40/hero-check.js <<'JSEOF'
(() => {
  const body = [...document.querySelectorAll('[data-match-hero-body]')].filter((b) => !!b.offsetParent);
  if (body.length === 0) return JSON.stringify({ ok: false, why: 'no-hero' });
  const h = Math.round(body[0].getBoundingClientRect().height);
  const w = window.innerWidth;
  const limit = w >= 768 ? 88 : 132;
  return JSON.stringify({ w, h, limit, ok: h <= limit + 6 });
})()
JSEOF

cat > /tmp/s40/feed-check.js <<'JSEOF'
(() => {
  const rows = [...document.querySelectorAll('[data-match-row]')].filter((r) => !!r.offsetParent);
  const vh = window.innerHeight;
  const visible = rows.filter((r) => { const rc = r.getBoundingClientRect(); return rc.top >= 0 && rc.top + rc.height / 2 < vh; });
  const heights = visible.slice(0, 8).map((r) => Math.round(r.getBoundingClientRect().height));
  return JSON.stringify({ vw: window.innerWidth, total: rows.length, firstScreen: visible.length, heights });
})()
JSEOF

cat > /tmp/s40/tab-check.js <<'JSEOF'
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
  return JSON.stringify({ ok: gold && underline && !framed, gold, underline, framed });
})()
JSEOF

cat > /tmp/s40/no-check.js <<'JSEOF'
(() => {
  // проверяем только имена команд (№ позиции в таблице «№3 в таблице» — легитимно)
  const body = document.body.innerText;
  const teamWithNo = [...document.querySelectorAll('[data-match-row], [data-match-hero-body], .break-words')]
    .map((el) => el.textContent.trim())
    .filter((t) => /\S\s*№\s*\d/.test(t) && !/№\d+\s*(в таблице|—)/.test(t));
  return JSON.stringify({
    himikClean: !/Химик-НО\s*№/.test(body),
    teamWithNo: teamWithNo.slice(0, 3),
  });
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
  res=$(js /tmp/s40/page-check.js)
  if [ -z "$res" ] || [ "$res" = "ERR" ]; then echo "w=${w} ${page} => EVAL-ERROR"; FAIL=1; return; fi
  echo "w=${w} ${page} => $res"
  python3 - "$res" "$w" "$page" <<'PYEOF' || FAIL=1
import json, sys
res = json.loads(sys.argv[1]); w = int(sys.argv[2]); page = sys.argv[3]
bad = []
if res["hscroll"] > 1: bad.append(f"H-SCROLL {res['hscroll']}px")
if res["ell"]: bad.append(f"ELLIPSIS x{len(res['ell'])}: {res['ell'][:3]}")
if w < 1200 and not res["accVisible"]: bad.append("NO-ACCORDION (лиги не аккордеоном под контентом)")
if w >= 1200 and res["accVisible"]: bad.append("ACCORDION-VISIBLE @>=1200")
if w >= 768 and not res["isMatch"] and not res["rightRailWidgets"]: bad.append("NO-RIGHT-RAIL-WIDGETS @>=768 (не матч)")
if w >= 768 and res["isMatch"] and res["rightRailWidgets"]: bad.append("MATч-PAGE: общие виджеты в колонке!")
if w >= 768 and res["isMatch"] and not res["rightRailBox"]: bad.append("MATCH-PAGE: нет правой колонки @>=768")
if w < 768 and res["rightRailWidgets"]: bad.append("RIGHT-RAIL-VISIBLE @<768")
if w >= 1200 and not res["leftRail"]: bad.append("NO-LEFT-RAIL @>=1200")
for b in bad:
    print(f"  FAIL @w={w}{page}: {b}")
sys.exit(1 if bad else 0)
PYEOF
}

echo "=== 1. Все страницы на 11 ширинах (h-scroll / ellipsis / колонки) ==="
for w in $WIDTHS; do
  agent-browser set viewport "$w" 900 >/dev/null 2>&1
  check_page "/" "$w"
done
for w in 360 375 768 1200 1440; do
  agent-browser set viewport "$w" 900 >/dev/null 2>&1
  check_page "/match/$MATCH" "$w"
  check_page "/team/$TEAM" "$w"
done

echo "=== 2. Панель дат: ОДНА строка на 320/360/375/480 ==="
for w in 320 360 375 480 768; do
  agent-browser set viewport "$w" 700 >/dev/null 2>&1
  open_wait "/"
  F=$(js /tmp/s40/filters-check.js)
  echo "filters@${w}: $F"
  echo "$F" | python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
bad = []
if not d.get("oneLine"): bad.append("Live/Завершённые НЕ на одной строке с датой")
if d.get("hscroll", 0) > 1: bad.append("h-scroll страницы")
if d.get("panelH", 99) > 52: bad.append(f"панель выше 52: {d["panelH"]}")
if d.get("w", 999) < 640 and not d.get("calHidden", True): bad.append("календарь виден на мобиле")
print("  FILTERS OK" if not bad else "  FAIL FILTERS: " + "; ".join(bad))
sys.exit(0 if not bad else 1)' || FAIL=1
done

echo "=== 3. Лого scoresb□x: вложенный знак, одна строка ==="
for w in 360 1920; do
  agent-browser set viewport "$w" 800 >/dev/null 2>&1
  open_wait "/"
  L=$(js /tmp/s40/logo-check.js)
  echo "logo@${w}: $L"
  echo "$L" | python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
ok = d.get("ok")
print("  LOGO OK" if ok else f"  FAIL LOGO: {d}")
sys.exit(0 if ok else 1)' || FAIL=1
done

echo "=== 4. Хронология (FS-эталон): минуты у внешнего края ==="
for w in 375 768 1440; do
  agent-browser set viewport "$w" 700 >/dev/null 2>&1
  open_wait "/match/$MATCH"
  agent-browser eval "(() => { const t = [...document.querySelectorAll('[data-tab]')].find((b) => b.textContent.includes('Хронология')); if (t) t.click(); return t ? 'clicked' : 'not-found'; })()" >/dev/null
  agent-browser wait 500 >/dev/null
  TL=$(js /tmp/s40/timeline-check.js)
  echo "timeline@${w}: $TL"
  echo "$TL" | python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
bad = []
if d.get("inner", 1) > 0: bad.append(f"минут в центре (не внешний край): {d["inner"]}")
if not d.get("hasBothSides"): bad.append("нет обеих сторон (L/R)")
if not d.get("hasPeriods"): bad.append("нет полос «1-й тайм»/«Перерыв»")
if d.get("scoreCount", 0) > 0 and not d.get("scoreInline"): bad.append("счёт-бейдж не инлайн")
if d.get("evHeights") and max(d["evHeights"]) > 70: bad.append(f"события выше 70px: {d["evHeights"]}")
print("  TIMELINE OK" if not bad else "  FAIL TIMELINE: " + "; ".join(bad))
sys.exit(0 if not bad else 1)' || FAIL=1
done

echo "=== 5. Составы: без позиций, имя не коллапсирует ==="
agent-browser set viewport 375 700 >/dev/null 2>&1
open_wait "/match/$MATCH"
agent-browser eval "(() => { const t = [...document.querySelectorAll('[data-tab]')].find((b) => b.textContent.includes('Составы')); if (t) t.click(); return t ? 'clicked' : 'not-found'; })()" >/dev/null
agent-browser wait 600 >/dev/null
LU=$(js /tmp/s40/lineups-check.js)
echo "lineups@375: $LU"
echo "$LU" | python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
bad = []
if d.get("posFound"): bad.append("позиции игроков видны")
if d.get("collapsed", 0) > 0: bad.append(f"коллапс имени (width<50px): {d["collapsed"]}")
if not d.get("rowWith4plusMarks"): bad.append("нет строки с 4+ значками (тест-данные?)")
elif d["rowWith4plusMarks"]["rowH"] > 120: bad.append(f"строка с 4+ значками выше 120: {d["rowWith4plusMarks"]}")
print("  LINEUPS OK" if not bad else "  FAIL LINEUPS: " + "; ".join(bad))
sys.exit(0 if not bad else 1)' || FAIL=1

echo "=== 6. Матч: колонка без общих виджетов + имена без № ==="
for w in 375 1440; do
  agent-browser set viewport "$w" 800 >/dev/null 2>&1
  open_wait "/match/$MATCH"
  R=$(js /tmp/s40/rail-check.js)
  N=$(js /tmp/s40/no-check.js)
  echo "rail@${w}: $R"
  echo "names@${w}: $N"
  echo "$R $N" | python3 -c '
import json, sys
raw = sys.stdin.read()
r, n = raw.split("} {", 1)
r = json.loads(r + "}"); n = json.loads("{" + n)
bad = []
if not r.get("ok"): bad.append(f"правая колонка матча: {r}")
if not n.get("himikClean"): bad.append("имя команды с «№» в интерфейсе")
if n.get("teamWithNo"): bad.append(f"имя с «№»: {n["teamWithNo"]}")
print("  RAIL+NAMES OK" if not bad else "  FAIL: " + "; ".join(str(b) for b in bad))
sys.exit(0 if not bad else 1)' || FAIL=1
done

echo "=== 7. Шапка матча + лента 375 + табы ==="
agent-browser set viewport 375 667 >/dev/null 2>&1
open_wait "/match/$MATCH"
H=$(js /tmp/s40/hero-check.js)
echo "hero@375: $H"
open_wait "/"
FE=$(js /tmp/s40/feed-check.js)
echo "feed: $FE"
open_wait "/match/$MATCH"
T=$(js /tmp/s40/tab-check.js)
echo "tab: $T"
for X in "$H" "$T"; do
  echo "$X" | python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
print("  OK" if d.get("ok") else f"  FAIL: {d}")
sys.exit(0 if d.get("ok") else 1)' || FAIL=1
done
echo "$FE" | python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
# AD-TOP (90px, директива Р-29) по дизайну занимает часть первого
# экрана — с баннером в экране ≥5 строк по 52-53px, без баннера ≥6
need = min(5, d["total"])
bad = []
if d["firstScreen"] < need: bad.append(f"матчей в первом экране: {d["firstScreen"]} < {need}")
if any(h > 74 for h in d["heights"]): bad.append(f"строки выше 74: {d["heights"]}")
if any(h < 50 for h in d["heights"]): bad.append(f"min-height 52 не работает: {d["heights"]}")
print("  FEED OK" if not bad else "  FAIL FEED: " + "; ".join(bad))
sys.exit(0 if not bad else 1)' || FAIL=1

echo "=== 8. Скриншоты ==="
shot() { open_wait "$1"; agent-browser screenshot "$2" >/dev/null; }
agent-browser set viewport 360 780 >/dev/null 2>&1
shot "/" scripts/smoke-40-feed-360.png
agent-browser set viewport 375 667 >/dev/null 2>&1
shot "/" scripts/smoke-40-feed-375.png
open_wait "/match/$MATCH"
agent-browser eval "(() => { const t = [...document.querySelectorAll('[data-tab]')].find((b) => b.textContent.includes('Хронология')); if (t) t.click(); return 'ok'; })()" >/dev/null
agent-browser wait 500 >/dev/null
agent-browser screenshot scripts/smoke-40-timeline-375.png >/dev/null
agent-browser eval "(() => { const t = [...document.querySelectorAll('[data-tab]')].find((b) => b.textContent.includes('Составы')); if (t) t.click(); return 'ok'; })()" >/dev/null
agent-browser wait 500 >/dev/null
agent-browser screenshot scripts/smoke-40-lineups-375.png >/dev/null
agent-browser set viewport 768 900 >/dev/null 2>&1
shot "/" scripts/smoke-40-feed-768.png
agent-browser set viewport 1200 900 >/dev/null 2>&1
shot "/" scripts/smoke-40-feed-1200.png
shot "/match/$MATCH" scripts/smoke-40-match-1200.png
agent-browser set viewport 1920 1080 >/dev/null 2>&1
shot "/" scripts/smoke-40-feed-1920.png

echo "----"
if [ "$FAIL" = "0" ]; then echo "SMOKE-40: ALL CHECKS PASS"; else echo "SMOKE-40: FAILURES FOUND"; exit 1; fi
