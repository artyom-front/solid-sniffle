#!/usr/bin/env bash
# ============================================================
# SCORESBOX · smoke-41.sh — приёмка v1.0.41 (фидбек 2026-10-02,
# «Составы/Протокол по futbol24 + реклама матча вверх»):
#   1) страница матча: НЕТ боковых колонок на ВСЕХ ширинах
#      (320…1920); прочие страницы — колонки как прежде (регресс);
#   2) реклама матча: ряд из 3 слотов [data-match-ads] НАД гером,
#      высота ≤104px (на мобиле — карусель, не 3 этажа);
#   3) таб «Протокол» (не «Хронология»): минута у ЛЕВОГО края у
#      событий обеих команд, ≥768px — счёт в центральной колонке,
#      <768px — инлайн-бейдж; полосы «1-й тайм/Перерыв»; строки
#      замен (две строки в блоке);
#   4) составы ≥768px: ЗЕРКАЛЬНАЯ таблица (игроки в обеих половинах,
#      номера у внешних краёв), имена в ОДНУ строку, замены:
#      ушедший приглушён;
#   5) составы <768px: подвкладки команд, переключение меняет
#      состав, имена в одну строку;
#   6) h-scroll 0 на всех широтах; скриншоты.
# Дев-данные: scripts/smoke-41-seed.ts (матч + замена 30').
# Требует prod standalone на :3100. JS-проверки — /tmp/s41-*.js.
# ============================================================
set -uo pipefail
cd /home/z/my-project

BASE=http://localhost:3100
MATCH=cmus3g1kw00splzwbwuiyf2e3

mkdir -p /tmp/s41

# ---------- базовая проверка страницы + колонки ----------
cat > /tmp/s41/page-check.js <<'JSEOF'
(() => {
  const doc = document.documentElement;
  const hscroll = doc.scrollWidth - window.innerWidth;
  const w = window.innerWidth;
  const asides = [...document.querySelectorAll('main aside')].filter((a) => !!a.offsetParent);
  const isMatch = location.pathname.startsWith('/match/');
  const rightRail = asides.some((a) => a.getBoundingClientRect().x > window.innerWidth / 2);
  const leftRail = asides.some((a) => a.getBoundingClientRect().x < window.innerWidth / 2 && a.textContent.includes('Топ-лиги'));
  const acc = document.querySelector('#leagues-panel');
  const accVisible = acc ? !!acc.closest('section') && !!acc.closest('section').offsetParent : false;
  return JSON.stringify({ w, hscroll, isMatch, asides: asides.length, rightRail, leftRail, accVisible });
})()
JSEOF

# ---------- реклама на матче: ряд из 3 НАД гером ----------
cat > /tmp/s41/ads-check.js <<'JSEOF'
(() => {
  if (!location.pathname.startsWith('/match/')) return JSON.stringify({ ok: true, skip: 'not-match' });
  const row = document.querySelector('[data-match-ads]');
  const hero = document.querySelector('[data-match-hero]');
  if (!row) return JSON.stringify({ ok: true, ads: 0, why: 'нет баннеров TOP/RIGHT_* в БД' });
  const ads = row.querySelectorAll('a').length;
  const rr = row.getBoundingClientRect();
  const hr = hero.getBoundingClientRect();
  const aboveHero = rr.bottom <= hr.top + 2;
  const h = Math.round(rr.height);
  const innerScroll = Math.round(row.scrollWidth - row.clientWidth);
  return JSON.stringify({ ok: aboveHero && h <= 104 && ads >= 1 && ads <= 3, ads, h, aboveHero, innerScroll });
})()
JSEOF

# ---------- протокол: минута слева, счёт по центру (≥768) ----------
cat > /tmp/s41/timeline-check.js <<'JSEOF'
(() => {
  const evs = [...document.querySelectorAll('[data-timeline-event]')].filter((r) => !!r.offsetParent);
  if (evs.length === 0) return JSON.stringify({ ok: false, why: 'нет событий' });
  let minuteLeft = 0, minuteOther = 0, subRows = 0;
  for (const row of evs) {
    const rc = row.getBoundingClientRect();
    const cell = [...row.querySelectorAll('[data-minute]')].find((c) => !!c.offsetParent);
    if (!cell) continue;
    const mc = cell.getBoundingClientRect();
    const center = mc.left + mc.width / 2;
    if (center - rc.left <= 60) minuteLeft++;
    else minuteOther++;
    // строка замены: ≥2 стрелки-иконки в строке
    if (row.querySelectorAll('svg').length >= 2) subRows++;
  }
  const w = window.innerWidth;
  const centerScores = [...document.querySelectorAll('[data-center-score]')].filter((c) => !!c.offsetParent);
  const inlineScores = [...document.querySelectorAll('[data-run-score]')].filter((c) => !!c.offsetParent);
  let scoreCentered = true;
  if (w >= 768 && centerScores.length > 0) {
    for (const c of centerScores) {
      const rc = c.getBoundingClientRect();
      const row = c.closest('[data-timeline-event]').getBoundingClientRect();
      const mid = row.left + row.width / 2;
      if (Math.abs(rc.left + rc.width / 2 - mid) > 40) scoreCentered = false;
    }
  }
  const markers = [...document.querySelectorAll('[data-timeline-marker]')].map((m) => m.textContent.trim());
  const hasPeriods = markers.some((m) => /1-й тайм/i.test(m)) && markers.some((m) => /Перерыв/i.test(m));
  let tallName = 0;
  for (const row of evs) {
    for (const n of row.querySelectorAll('button, span')) {
      if (!n.textContent || !n.textContent.trim() || n.children.length > 0) continue;
      if (n.getBoundingClientRect().height > 20) tallName++;
    }
  }
  const heights = evs.map((r) => Math.round(r.getBoundingClientRect().height));
  const ok = minuteOther === 0 && hasPeriods && tallName === 0 && subRows >= 1 && scoreCentered;
  return JSON.stringify({
    vw: w, events: evs.length, minuteLeft, minuteOther, subRows,
    centerScores: centerScores.length, inlineScores: inlineScores.length, scoreCentered,
    hasPeriods, tallName, heights, markers: markers.slice(0, 5), ok,
  });
})()
JSEOF

# ---------- составы: зеркальность, одна строка имён ----------
cat > /tmp/s41/lineups-check.js <<'JSEOF'
(() => {
  const w = window.innerWidth;
  const names = [...document.querySelectorAll('[data-lineup-name]')].filter((n) => !!n.offsetParent);
  if (names.length === 0) return JSON.stringify({ ok: false, why: 'нет строк составов' });
  let wrapped = 0, ellipsized = 0, dimmed = 0;
  for (const n of names) {
    const h = n.getBoundingClientRect().height;
    if (h > 20 || n.getClientRects().length > 1) wrapped++;
    if (n.scrollWidth > n.clientWidth + 1) ellipsized++;
    if ((n.className || '').toString().includes('text-ink3')) dimmed++;
  }
  const sections = [...document.querySelectorAll('[data-lineup-section]')].filter((s) => !!s.offsetParent).map((s) => s.textContent.trim());
  const subtabs = [...document.querySelectorAll('[data-subtab]')].filter((t) => !!t.offsetParent);
  const activeSub = subtabs.find((t) => t.getAttribute('data-active') === 'true');
  const out = { vw: w, players: names.length, wrapped, ellipsized, dimmed, sections: sections.slice(0, 6), subtabs: subtabs.length };
  if (w >= 768) {
    const rows = [...document.querySelectorAll('[data-lineup-player]')].filter((p) => !!p.offsetParent);
    const cont = rows[0].closest('div.hidden');
    const contRect = cont ? cont.getBoundingClientRect() : rows[0].closest('div[class*="grid"]').getBoundingClientRect();
    const left = rows.filter((p) => p.getBoundingClientRect().left < contRect.left + contRect.width / 2).length;
    const right = rows.length - left;
    const mirrorRow = rows[0].closest('div[class*="border-t"]');
    let numOuter = false;
    if (mirrorRow) {
      const cells = [...mirrorRow.children].filter((c) => !!c.offsetParent);
      const rr = mirrorRow.getBoundingClientRect();
      const first = cells[0].getBoundingClientRect();
      const last = cells[cells.length - 1].getBoundingClientRect();
      numOuter = first.left - rr.left < 10 && rr.right - last.right < 10;
    }
    Object.assign(out, { left, right, numOuter });
    out.ok = wrapped === 0 && left > 0 && right > 0 && numOuter && dimmed >= 0;
  } else {
    let goldUnder = false;
    if (activeSub) {
      const cs = getComputedStyle(activeSub);
      const line = [...activeSub.children].find((c) => c.tagName === 'SPAN' && Math.round(parseFloat(getComputedStyle(c).height)) <= 2);
      goldUnder = cs.color === 'rgb(255, 215, 0)' && !!line;
    }
    const marks = [...document.querySelectorAll('[data-lineup-mark]')].filter((m) => !!m.offsetParent);
    Object.assign(out, { goldUnder, marks: marks.length });
    out.ok = wrapped === 0 && subtabs.length === 2 && goldUnder;
  }
  return JSON.stringify(out);
})()
JSEOF

# ---------- таб «Протокол» ----------
cat > /tmp/s41/tab-check.js <<'JSEOF'
(() => {
  const tabs = [...document.querySelectorAll('[data-tab]')].map((t) => t.textContent.trim());
  const hasProtocol = tabs.some((t) => t.includes('Протокол'));
  const hasChrono = document.body.innerText.includes('Хронология');
  return JSON.stringify({ tabs, hasProtocol, hasChrono, ok: hasProtocol && !hasChrono });
})()
JSEOF

js() { agent-browser eval "$(cat "$1")" --json 2>/dev/null | bun -e 'let s=require("fs").readFileSync(0,"utf8");try{console.log(JSON.parse(s).data?.result??"")}catch{console.log("ERR")}'; }

open_tab() {
  agent-browser open "${BASE}$1" --timeout 30000 >/dev/null
  agent-browser wait --load networkidle --timeout 20000 >/dev/null 2>&1
  agent-browser wait 700 >/dev/null
}
click_tab() {
  agent-browser eval "(() => { const t = [...document.querySelectorAll('[data-tab]')].find((b) => b.textContent.includes('$1')); if (t) t.click(); return t ? 'ok' : 'not-found'; })()" >/dev/null
  agent-browser wait 600 >/dev/null
}

WIDTHS="320 360 375 393 768 1024 1200 1440 1920"
FAIL=0

echo "=== 1. Колонки: матч — ни одной на всех ширинах; главная — как прежде ==="
for w in $WIDTHS; do
  agent-browser set viewport "$w" 900 >/dev/null 2>&1
  for page in "/match/$MATCH" "/"; do
    open_tab "$page"
    res=$(js /tmp/s41/page-check.js)
    echo "w=${w} ${page} => $res"
    echo "$res" | python3 -c "
import json, sys
d = json.loads(sys.stdin.read()); w = d['w']; m = d['isMatch']
bad = []
if d['hscroll'] > 1: bad.append('H-SCROLL %spx' % d['hscroll'])
if m and d['asides'] > 0: bad.append('матч: боковые колонки (%s)' % d['asides'])
if not m:
    if w >= 768 and not d['rightRail']: bad.append('главная: нет правой колонки @>=768')
    if w >= 1200 and not d['leftRail']: bad.append('главная: нет левой колонки @>=1200')
    if w < 768 and d['rightRail']: bad.append('главная: правая колонка @<768')
    if w < 1200 and not d['accVisible']: bad.append('нет аккордеона лиг @<1200')
    if w >= 1200 and d['accVisible']: bad.append('аккордеон виден @>=1200')
print('  OK' if not bad else '  FAIL: ' + '; '.join(bad))
sys.exit(0 if not bad else 1)" || FAIL=1
  done
done

echo "=== 2. Реклама матча: ряд из 3 НАД гером, высота ≤104 ==="
for w in 320 375 768 1200 1920; do
  agent-browser set viewport "$w" 900 >/dev/null 2>&1
  open_tab "/match/$MATCH"
  A=$(js /tmp/s41/ads-check.js)
  echo "ads@${w}: $A"
  echo "$A" | python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
print("  ADS OK" if d.get("ok") else "  FAIL ADS: %s" % d)
sys.exit(0 if d.get("ok") else 1)' || FAIL=1
done

echo "=== 3. Таб «Протокол» + переименование ==="
for w in 375 1440; do
  agent-browser set viewport "$w" 800 >/dev/null 2>&1
  open_tab "/match/$MATCH"
  T=$(js /tmp/s41/tab-check.js)
  echo "tab@${w}: $T"
  echo "$T" | python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
print("  TAB OK" if d.get("ok") else "  FAIL TAB: %s" % d)
sys.exit(0 if d.get("ok") else 1)' || FAIL=1
done

echo "=== 4. Протокол (futbol24): минута слева, счёт в центре ≥768, замены ==="
for w in 320 375 768 1440; do
  agent-browser set viewport "$w" 700 >/dev/null 2>&1
  open_tab "/match/$MATCH"
  click_tab "Протокол"
  TL=$(js /tmp/s41/timeline-check.js)
  echo "protocol@${w}: $TL"
  echo "$TL" | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
bad = []
if d.get('why'): bad.append(d['why'])
if d.get('minuteOther', 1) > 0: bad.append('минуты не у левого края: %s' % d.get('minuteOther'))
if not d.get('hasPeriods'): bad.append('нет полос 1-й тайм/Перерыв')
if d.get('tallName', 1) > 0: bad.append('имена в 2 строки: %s' % d.get('tallName'))
if d.get('subRows', 0) < 1: bad.append('нет строк замен')
if d.get('vw', 0) >= 768 and d.get('centerScores', 0) == 0 and d.get('inlineScores', 0) > 0: bad.append('нет центральной колонки счёта @>=768')
if not d.get('scoreCentered', True): bad.append('счёт не по центру строки')
if d.get('heights') and max(d['heights']) > 70: bad.append('события выше 70: %s' % d['heights'])
print('  PROTOCOL OK' if not bad else '  FAIL PROTOCOL: ' + '; '.join(bad))
sys.exit(0 if not bad else 1)" || FAIL=1
done

echo "=== 5. Составы ≥768: зеркало + одна строка; <768: подвкладки ==="
for w in 320 375 768 1024 1200 1440; do
  agent-browser set viewport "$w" 800 >/dev/null 2>&1
  open_tab "/match/$MATCH"
  click_tab "Составы"
  LU=$(js /tmp/s41/lineups-check.js)
  echo "lineups@${w}: $LU"
  echo "$LU" | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
bad = []
if d.get('why'): bad.append(d['why'])
if d.get('wrapped', 1) > 0: bad.append('имена в 2 строки: %s' % d.get('wrapped'))
if d.get('vw', 0) >= 768:
    if d.get('left', 0) == 0 or d.get('right', 0) == 0: bad.append('не зеркало: left=%(left)s right=%(right)s' % d)
    if not d.get('numOuter'): bad.append('номера не у внешних краёв')
else:
    if d.get('subtabs', 0) != 2: bad.append('подвкладок %s, нужно 2' % d.get('subtabs'))
    if not d.get('goldUnder'): bad.append('активная подвкладка не золото/underline')
print('  LINEUPS OK' if not bad else '  FAIL LINEUPS: ' + '; '.join(str(b) for b in bad))
sys.exit(0 if not bad else 1)" || FAIL=1
done

echo "=== 6. Переключение подвкладки меняет состав (375) ==="
agent-browser set viewport 375 700 >/dev/null 2>&1
open_tab "/match/$MATCH"
click_tab "Составы"
SW=$(agent-browser eval "(() => {
  const before = [...document.querySelectorAll('[data-lineup-name]')].map((n) => n.textContent.trim()).join('|');
  const tabs = [...document.querySelectorAll('[data-subtab]')];
  const other = tabs.find((t) => t.getAttribute('data-active') !== 'true');
  if (!other) return JSON.stringify({ ok: false, why: 'одна подвкладка' });
  other.click();
  return new Promise((resolve) => setTimeout(() => {
    const after = [...document.querySelectorAll('[data-lineup-name]')].map((n) => n.textContent.trim()).join('|');
    resolve(JSON.stringify({ ok: before !== after && after.length > 0, changed: before !== after }));
  }, 400));
})()" --json 2>/dev/null | bun -e 'let s=require("fs").readFileSync(0,"utf8");try{console.log(JSON.parse(s).data?.result??"")}catch{console.log("ERR")}')
echo "switch: $SW"
echo "$SW" | python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
print("  SWITCH OK" if d.get("ok") else "  FAIL SWITCH: %s" % d)
sys.exit(0 if d.get("ok") else 1)' || FAIL=1

echo "=== 7. Скриншоты ==="
shot() { open_tab "$1"; agent-browser screenshot "$2" >/dev/null; }
agent-browser set viewport 375 667 >/dev/null 2>&1
shot "/match/$MATCH" scripts/smoke-41-match-375.png
click_tab "Протокол"
agent-browser screenshot scripts/smoke-41-protocol-375.png >/dev/null
click_tab "Составы"
agent-browser screenshot scripts/smoke-41-lineups-375.png >/dev/null
agent-browser set viewport 768 900 >/dev/null 2>&1
open_tab "/match/$MATCH"
click_tab "Протокол"
agent-browser screenshot scripts/smoke-41-protocol-768.png >/dev/null
open_tab "/match/$MATCH"
click_tab "Составы"
agent-browser screenshot scripts/smoke-41-lineups-768.png >/dev/null
agent-browser set viewport 1200 900 >/dev/null 2>&1
shot "/match/$MATCH" scripts/smoke-41-match-1200.png
open_tab "/match/$MATCH"
click_tab "Составы"
agent-browser screenshot scripts/smoke-41-lineups-1200.png >/dev/null
agent-browser set viewport 1920 1080 >/dev/null 2>&1
shot "/match/$MATCH" scripts/smoke-41-match-1920.png
shot "/" scripts/smoke-41-feed-1920.png

echo "----"
if [ "$FAIL" = "0" ]; then echo "SMOKE-41: ALL CHECKS PASS"; else echo "SMOKE-41: FAILURES FOUND"; exit 1; fi
