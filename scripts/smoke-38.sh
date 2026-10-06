#!/usr/bin/env bash
# ============================================================
# SCORESBOX · smoke-38.sh — приёмка директивы 2026-09-30
# «цвета scoresbox + метрики FlashScore» на 11 ширинах
# (360/390/414/633/768/813/1024/1199/1200/1440/1920, с reload):
#   1) нет горизонтального скролла body;
#   2) нет «…» на данных-элементах (разрешённые — только навигация:
#      карусель дат в фильтре ленты, поиск-инпут, kbd);
#   3) <1200px — лиги = аккордеон ПОД контентом; ≥1200 — колонка;
#   4) ≥768px — правая колонка статистики; <768 — секции под лентой;
#   5) логотип «b□x» (знак-поле) в шапке;
#   6) скриншоты ключевых ширин.
# JS-проверки — в /tmp/s38-*.js (файлами, без shell-цитирования).
# ============================================================
set -uo pipefail
cd /home/z/my-project

BASE=http://localhost:3100
MATCH=cmumti31100u7newo1ayofik1
TEAM=cmumti2jp0020newoedwcsjuq

mkdir -p /tmp/s38

cat > /tmp/s38/page-check.js <<'JSEOF'
(() => {
  const doc = document.documentElement;
  const hscroll = doc.scrollWidth - window.innerWidth;
  const w = window.innerWidth;
  // «…» на данных: text-overflow ellipsis вне разрешённых мест
  const ell = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.textOverflow !== 'ellipsis') continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'kbd') continue;
    const t = (el.textContent || '').trim();
    // разрешённая навигация: карусель дат («Среда, 16 сентября» / «16 сент.»),
    // поиск-триггер в шапке (UI-контрол, не данные)
    if (t.startsWith('Поиск:')) continue;
    if (/^(понедельник|вторник|среда|четверг|пятница|суббота|воскресенье),?\s*\d+/i.test(t)) continue;
    if (/^\d+\s*[а-я]+\.?$/i.test(t)) continue;
    if (/^\d{2}\.\d{2}$/.test(t)) continue;
    ell.push(tag + ': ' + t.slice(0, 50));
  }
  // аккордеон лиг: есть в DOM и виден ниже 1200, скрыт ≥1200
  const acc = document.querySelector('#leagues-panel');
  const accVisible = acc ? !!acc.closest('section') && !!acc.closest('section').offsetParent : false;
  const accInDom = !!acc;
  // колонки: видимая правая колонка (статистика/таблица), левая (лиги)
  const asides = [...document.querySelectorAll('main aside')].filter((a) => !!a.offsetParent);
  const rightRail = asides.some((a) => a.textContent.includes('Топ игроков') || a.textContent.includes('Турнирная таблица'));
  const leftRail = asides.some((a) => a.textContent.includes('Топ-лиги'));
  return JSON.stringify({ w, hscroll, ell: ell.slice(0, 8), accInDom, accVisible, rightRail, leftRail });
})()
JSEOF

cat > /tmp/s38/logo-check.js <<'JSEOF'
(() => {
  const h = document.querySelector('header');
  const spans = [...h.querySelectorAll('span')].map((x) => x.textContent.trim());
  const glyph = h.querySelectorAll('svg rect[rx="14"]');
  return JSON.stringify({ scores: spans.includes('scores'), glyphCount: glyph.length, title: document.title.slice(0, 40) });
})()
JSEOF

js() { agent-browser eval "$1" --json 2>/dev/null | bun -e 'let s=require("fs").readFileSync(0,"utf8");try{console.log(JSON.parse(s).data?.result??"")}catch{console.log("ERR")}'; }

WIDTHS="360 390 414 633 768 813 1024 1199 1200 1440 1920"
FAIL=0

check_page() {
  local page="$1" w="$2"
  agent-browser open "${BASE}${page}" --timeout 30000 >/dev/null
  agent-browser wait --load networkidle --timeout 20000 >/dev/null 2>&1
  agent-browser wait 700 >/dev/null
  local res
  res=$(agent-browser eval "$(cat /tmp/s38/page-check.js)" --json 2>/dev/null | bun -e 'let s=require("fs").readFileSync(0,"utf8");try{console.log(JSON.parse(s).data?.result??"")}catch{console.log("ERR")}')
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
if w >= 768 and not res["rightRail"]: bad.append("NO-RIGHT-RAIL @>=768")
if w < 768 and res["rightRail"]: bad.append("RIGHT-RAIL-VISIBLE @<768")
if w >= 1200 and not res["leftRail"]: bad.append("NO-LEFT-RAIL @>=1200")
for b in bad:
    print(f"  FAIL @w={w}{page}: {b}")
sys.exit(1 if bad else 0)
PYEOF
}

for w in $WIDTHS; do
  agent-browser set viewport "$w" 900 >/dev/null 2>&1
  check_page "/" "$w"
done

for w in 360 768 1200 1440; do
  agent-browser set viewport "$w" 900 >/dev/null 2>&1
  check_page "/match/$MATCH" "$w"
  check_page "/team/$TEAM" "$w"
done

# скриншоты
shot() {
  local page="$1" path="$2"
  agent-browser open "${BASE}${page}" >/dev/null
  agent-browser wait --load networkidle --timeout 20000 >/dev/null 2>&1
  agent-browser wait 800 >/dev/null
  agent-browser screenshot "$path" >/dev/null
}
agent-browser set viewport 360 780 >/dev/null 2>&1
shot "/" scripts/smoke-38-feed-360.png
shot "/match/$MATCH" scripts/smoke-38-match-360.png
shot "/team/$TEAM" scripts/smoke-38-team-360.png
agent-browser set viewport 768 900 >/dev/null 2>&1
shot "/" scripts/smoke-38-feed-768.png
agent-browser set viewport 1200 900 >/dev/null 2>&1
shot "/" scripts/smoke-38-feed-1200.png
shot "/match/$MATCH" scripts/smoke-38-match-1200.png
shot "/team/$TEAM" scripts/smoke-38-team-1200.png
agent-browser set viewport 1920 1080 >/dev/null 2>&1
shot "/" scripts/smoke-38-feed-1920.png

echo "LOGO header: $(agent-browser eval "$(cat /tmp/s38/logo-check.js)" --json 2>/dev/null | bun -e 'let s=require("fs").readFileSync(0,"utf8");try{console.log(JSON.parse(s).data?.result??"")}catch{console.log("ERR")}')"

echo "----"
if [ "$FAIL" = "0" ]; then echo "SMOKE-38: ALL CHECKS PASS"; else echo "SMOKE-38: FAILURES FOUND"; exit 1; fi
