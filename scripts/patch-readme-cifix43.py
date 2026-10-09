#!/usr/bin/env python3
"""cifix43: подмена README поставки в make-archives.sh (sec42 -> cifix43).

Правило из Task 47: python-heredoc внутри bash-heredoc коррумпирует
скрипт — поэтому патч оформлен отдельным файлом, после патча обязателен
`bash -n scripts/make-archives.sh`.
"""
from pathlib import Path

SH = Path("/home/z/my-project/scripts/make-archives.sh")
src = SH.read_text(encoding="utf-8")

START = "cat > download/README.md <<'EOF'\n"
END = "\nEOF"  # файл sec42 заканчивался EOF без завершающего \n

i = src.find(START)
assert i != -1, "start-маркер не найден"
j = src.find(END, i + len(START))
assert j != -1, "end-маркер не найден"

new_readme = """cat > download/README.md <<'EOF'
# Поставка SCORESBOX — v1.0.43 «cifix: зелёный CI» (05.10.2026)

**Что это:** минимальный фикс упавшего GitHub Actions (джоба quality,
шаг «Аудит deps» — check-deps.py, exit 1) после пуша v1.0.42. Код
приложения не менялся ни на символ — только CI-гигиена: песочные
скрипты, нечестная проверка зависимостей и секция типов.

## 1. Что чинил

| # | Проблема в CI | Фикс |
|---|---|---|
| 1 | check-deps: MISSING `z-ai-web-dev-sdk` (3 файла) | удалены 4 песочных VLM-скрипта (`scripts/vlm-37.js`, `vlm-39.js`, `vlm-39-run.mjs`, `vlm-check-36.mjs`) — одноразовые скриншот-проверки поставок 36/37/39; SDK приватный (в npm его нет), на CI скрипты бесполезны |
| 2 | check-deps: DEAD `@types/qrcode` | в check-deps.py лежал нерабочий литерал `@types/*` (матчился только сам с собой) — заменён честным префикс-матчем `@types/*`; сам `@types/qrcode` перенесён из dependencies в devDependencies (типы, не рантайм) |
| 3 | check-deps: DEAD `react-dom` | react-dom добавлен в implicit-резолв: Next.js App Router сам резолвит его при гидрации «use client» — прямой импорт из кода не нужен, пакет НЕ мёртвый, из package.json не удалялся |
| 4 | `bun install --frozen-lockfile` | bun.lock синхронизирован под новый package.json (перенос @types/qrcode между секциями) |

**qrcode не тронут:** сам пакет жив — им портируется
`src/app/api/admin/totp` (QR-коды для 2FA).

## 2. Проверено (ровно как в quality-джобе CI)

- `python3 scripts/check-deps.py` → exit 0, MISSING 0, DEAD 0;
- tsc 0; eslint 0; **unit 111/111** (`bun test tests/unit`);
- код приложения не менялся → build и миграции не затронуты.

## 3. Применить и задеплоить (PowerShell, папка вашего клона)

```bash
git fetch "$HOME\\Downloads\\scoresbox-2026-10-05-cifix43.git-bundle" main
git log --oneline -1 FETCH_HEAD   # «SCORESBOX 2026-10-05 cifix43: …»
git reset --hard FETCH_HEAD && git push --force origin main
git tag v1.0.43 && git push origin v1.0.43
```

После: Actions должны пройти целиком (quality → integration → deploy),
`curl -s https://scoresbox.ru/api/health` → "version":"1.0.43".
**Миграций нет.**

**Важно:** бандл содержит ветку `main` — при клоне с нуля делайте
`git clone -b main <bundle>` (без `-b` чекаут будет пустым).

## 4. Архив поставок (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.43** (текущая) | `scoresbox-2026-10-05-cifix43.git-bundle` | фикс CI: VLM-скрипты снесены, check-deps честный (@types/*, react-dom), @types/qrcode в devDeps |
| v1.0.42 | `scoresbox-2026-10-05-sec42.git-bundle` | security: анти-BOLA скоупы, контент strictly SUPER_ADMIN, дашборд по ролям, media DELETE, Next 16.3.8 |
| v1.0.41 | `scoresbox-2026-10-05-fs41.git-bundle` | Протокол/Составы по futbol24, матч без колонок + ряд из 3 реклам |
| v1.0.40 | `scoresbox-2026-10-01-fs40.git-bundle` | хронология FlashScore, имена без «№N», лого scoresb□x |
| v1.0.39 | `scoresbox-2026-09-30-fs39.git-bundle` | лента 52px/кнопка даты, аккордеон лиг, AD-INFEED |
| v1.0.38 | `scoresbox-2026-09-30-fs38.git-bundle` | страница матча по FlashScore (герой/таймлайн/табы) |
| v1.0.37 | `scoresbox-2026-09-29-minute37.git-bundle` | минута у счёта, Onest, лента по скетчу |
| v1.0.35–36 | `…-mobile35 / -brand36` | мобильный адаптив, фирстиль |
| v1.0.32–34 | `…-logic32 / -invite33 / -logic34` | скоуп лиги, приглашения, судейский корпус |
| v1.0.21–31 | `…-security … -lineup28 …` | RBAC, XSS/BOLA-фиксы, деплой-фиксы (см. старые README) |

**Прямые ссылки (панель /download/):**

- v1.0.43: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-cifix43.git-bundle
- v1.0.42: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-sec42.git-bundle
- v1.0.41: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-fs41.git-bundle
- v1.0.40: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-01-fs40.git-bundle
- v1.0.39: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-30-fs39.git-bundle
- v1.0.38: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-30-fs38.git-bundle

## Грабли agent-browser (задокументированы)

`agent-browser eval` держит ПЕРСИСТЕНТНЫЙ JS-контекст: top-level `const`
живёт между вызовами, повторное объявление = SyntaxError. Все
multi-statement eval — в IIFE. `find label fill` не триггерит
React-состояние (controlled input остаётся пустым, submit блокируется
нативной валидацией): в смооках логиниться демо-кнопками по email.
Тонкость SMTP-мока: nodemailer кодирует письма (text — base64, html —
quoted-printable, тема — RFC 2047) — токен ссылки ищется только после
декодирования (см. parseMail в test-invites.ts).
EOF
"""

new_src = src[: i] + new_readme + "\n"  # README-блок — хвост скрипта; \n в конце файла (POSIX)

# Обе стороны heredoc-маркера должны встречаться ровно по одному разу;
# README-блок — хвост скрипта, закрывается EOF в конце файла
assert new_src.count("<<'EOF'") == 1, "heredoc-маркер задублирован"
assert new_src.rstrip().endswith("EOF"), "файл должен заканчиваться маркером EOF"
assert "cifix43" in new_src, "cifix43 не попал в скрипт"
# sec42 остаётся ТОЛЬКО в архивной таблице README (строка v1.0.42 + URL);
# в рабочих строках сборки (ONEFILE, cp, commit) его быть не должно
assert 'ONEFILE=download/scoresbox-2026-10-05-cifix43.git-bundle' in new_src
assert 'public/scoresbox-2026-10-05-cifix43.git-bundle' in new_src
for forbidden in ('ONEFILE=download/scoresbox-2026-10-05-sec42',
                  'public/scoresbox-2026-10-05-sec42.git-bundle\n',
                  'SCORESBOX 2026-10-05 sec42:'):
    assert forbidden not in new_src, f"рабочая строка sec42 не заменена: {forbidden!r}"

SH.write_text(new_src, encoding="utf-8")
print("OK: README в make-archives.sh заменён на cifix43")
