#!/usr/bin/env python3
"""dbfix45: подмена ONEFILE-имени, сообщения коммита сквоша и README
поставки в make-archives.sh (fs44 -> dbfix45). Отдельный файл — по
правилу из Task 47 (никаких python-heredoc внутри bash-heredoc),
после патча обязателен bash -n.
"""
from pathlib import Path

SH = Path("/home/z/my-project/scripts/make-archives.sh")
src = SH.read_text(encoding="utf-8")

# ---------- 0. ONEFILE-имя и публичная копия ----------
OLD_ONEFILE = "ONEFILE=download/scoresbox-2026-10-05-fs44.git-bundle"
NEW_ONEFILE = "ONEFILE=download/scoresbox-2026-10-06-dbfix45.git-bundle"
assert src.count(OLD_ONEFILE) == 1, "ONEFILE-строка fs44 не найдена/не одна"
src = src.replace(OLD_ONEFILE, NEW_ONEFILE)

OLD_CP = 'cp "$ONEFILE" public/scoresbox-2026-10-05-fs44.git-bundle'
NEW_CP = 'cp "$ONEFILE" public/scoresbox-2026-10-06-dbfix45.git-bundle'
assert src.count(OLD_CP) == 1, "cp-строка fs44 не найдена/не одна"
src = src.replace(OLD_CP, NEW_CP)

# ---------- 1. сообщение коммита сквоша ----------
COMMIT_START = 'git commit -q -m "SCORESBOX 2026-10-05 fs44:'
COMMIT_END = '" \\\n'
i = src.find(COMMIT_START)
assert i != -1, "commit start не найден"
j = src.find(COMMIT_END, i)
assert j != -1, "commit end не найден"

new_commit = 'git commit -q -m "SCORESBOX 2026-10-06 dbfix45: v1.0.45 — фикс упавшего 2026-10-05 деплоя v1.0.44 (останавливался на проверке бэкапа БД: «Бэкап не прошёл проверку — деплой ОСТАНОВЛЕН», exit 1). ПРИЧИНА: pg_dump выполняется ВНУТРИ контейнера db и работал, а проверка pg_restore --list — на ХОСТЕ VPS, где postgres-клиентов нет (весь PostgreSQL в docker, postgres:16-alpine): «command not found» (127) останавливал деплой при рабочем дампе; stderr проверки уходил в /dev/null, поэтому backups/pg-20261005-173830.err остался пустым. Прод не пострадал — миграции без бэкапа не стартовали (усиление аудита №17 из v1.0.44 сработало как задумано). ФИКСЫ: (1) deploy.sh — дамп И проверка pg_restore --list одной цепочкой ВНУТРИ контейнера db: pg_dump -f /tmp/scoresbox-verify.dump -> pg_restore --list (по файлу, не stdin) -> cat наружу в .part на хосте; cat ПОСЛЕ проверки — .part появляется только у проверенного дампа, провал любого звена = пустой вывод + ненулевой код = СТОП; при провале причина (хвост stderr шага бэкапа, docker compose ps db, df) печатается прямо в лог CI. (2) Жёсткий стоп, если PostgreSQL не готов за 60с (раньше цикл молча исчерпывался). (3) rollback.sh без аргумента откатывает на .deploy/current — последнюю РАБОЧУЮ версию (деплой 2026-10-05 упал ДО docker compose up, тега в history не было, CD-джоб rollback по «предпоследней строке» мог зря откатить здоровую 1.0.43 на 1.0.42); фолбэк history оставлен для установок без current. (4) Ротация бэкапов (30 дней) чистит и pg-*.err. Верификация: bash -n; scripts/test-dbfix45.sh — 3/3 PASS на заглушках (успех / падение pg_dump / падение проверки — кривой дамп не покидает «контейнер»); check-deps 0/0; unit 114/114; код приложения не менялся (tsc/eslint/build на CI без изменений с v1.0.44). МИГРАЦИЙ НЕТ — деплой пересоберёт контейнер, health -> 1.0.45." \\\n'

src = src[: i] + new_commit + src[j + len(COMMIT_END):]

# ---------- 2. README поставки ----------
START = "cat > download/README.md <<'EOF'\n"
END = "\nEOF"  # блок — хвост скрипта
i = src.find(START)
assert i != -1, "README start не найден"
j = src.find(END, i + len(START))
assert j != -1, "README end не найден"

new_readme = """cat > download/README.md <<'EOF'
# Поставка SCORESBOX — v1.0.45 «dbfix45: фикс деплоя бэкапа» (06.10.2026)

**Что это:** точечный фикс упавшего 2026-10-05 деплоя v1.0.44 —
деплой останавливался на шаге проверки бэкапа БД. Код приложения
не менялся; **миграций БД нет**; вся поставка — серверные скрипты
`scripts/deploy.sh` и `scripts/rollback.sh` (+ тест логики).

## 1. Что случилось с деплоем v1.0.44

Шаг «Бэкап БД (pg_dump)» завершался «Бэкап не прошёл проверку —
деплой ОСТАНОВЛЕН», хотя дамп был рабочий: `pg_dump` выполняется
ВНУТРИ контейнера `db`, а проверка `pg_restore --list` — на ХОСТЕ
VPS, где postgres-клиентов нет (весь PostgreSQL живёт в docker).
«command not found» (127) останавливал деплой, а stderr проверки
уходил в /dev/null — файл `pg-*.err` оставался пустым. Прод не
пострадал: миграции без бэкапа не стартовали (сработала защита
аудита №17 из v1.0.44).

## 2. Фиксы

| # | Проблема | Фикс |
|---|---|---|
| 1 | Проверка бэкапа требовала pg_restore на хосте | дамп И проверка `pg_restore --list` — одной цепочкой ВНУТРИ контейнера `db`; наружу стримится только проверенный дамп (`.part`) |
| 2 | Причина провала была невидима | при провале в лог CI печатается stderr шага бэкапа + `docker compose ps db` + `df` |
| 3 | Неготовность PostgreSQL молча пропускалась | жёсткий стоп, если PG не готов за 60с |
| 4 | Откат после провала мог даунгрейдить здоровый прод | `rollback.sh` без аргумента берёт `.deploy/current` (последнюю РАБОЧУЮ версию), а не «предпоследнюю строку history» |
| 5 | `pg-*.err` копились вечно | ротация 30 дней чистит и их |

## 3. Проверено

- `bash -n` deploy.sh / rollback.sh;
- **test-dbfix45** (`scripts/test-dbfix45.sh`) — 3/3 PASS: успех
  (полный дамп наружу) / падение pg_dump / падение проверки
  (кривой дамп не покидает «контейнер»);
- check-deps 0/0; unit **114/114**; код приложения не менялся —
  tsc/eslint/build на CI без изменений с v1.0.44.

## 4. Применить и задеплоить (PowerShell, папка вашего клона)

```bash
git fetch "$HOME\\Downloads\\scoresbox-2026-10-06-dbfix45.git-bundle" main
git log --oneline -1 FETCH_HEAD   # «SCORESBOX 2026-10-06 dbfix45: …»
git reset --hard FETCH_HEAD && git push --force origin main
git tag v1.0.45 && git push origin v1.0.45
```

После: health → "version":"1.0.45". **Миграций нет.** В логе деплоя
шаг будет называться «Бэкап БД (pg_dump + проверка, внутри
контейнера db)» — это ожидаемо. Если бэкап снова не пройдёт (уже
по другой причине) — лог покажет причину текстом, пришлите его.

**Важно:** бандл содержит ветку `main` — при клоне с нуля делайте
`git clone -b main <bundle>` (без `-b` чекаут будет пустым).

## 5. Архив поставок (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.45** (текущая) | `scoresbox-2026-10-06-dbfix45.git-bundle` | фикс деплоя: бэкап и проверка внутри контейнера db, диагностика провала в логе CI, rollback на current |
| v1.0.44 | `scoresbox-2026-10-05-fs44.git-bundle` | UI-фидбек (фильтр дат, протокол «И. Иванов», профили, колонки матча) + аудит №10–19 |
| v1.0.43 | `scoresbox-2026-10-05-cifix43.git-bundle` | фикс CI: VLM-скрипты снесены, check-deps честный, @types/qrcode в devDeps |
| v1.0.42 | `scoresbox-2026-10-05-sec42.git-bundle` | security: анти-BOLA скоупы, контент strictly SUPER_ADMIN, дашборд по ролям, media DELETE, Next 16.3.8 |
| v1.0.41 | `scoresbox-2026-10-05-fs41.git-bundle` | Протокол/Составы по futbol24 (колонки матча вернулись в v1.0.44) |
| v1.0.40 | `scoresbox-2026-10-01-fs40.git-bundle` | хронология FlashScore, имена без «№N», лого scoresb□x |
| v1.0.39 | `scoresbox-2026-09-30-fs39.git-bundle` | лента 52px/кнопка даты, аккордеон лиг, AD-INFEED |
| v1.0.38 | `scoresbox-2026-09-30-fs38.git-bundle` | страница матча по FlashScore (герой/таймлайн/табы) |
| v1.0.37 | `scoresbox-2026-09-29-minute37.git-bundle` | минута у счёта, Onest, лента по скетчу |
| v1.0.35–36 | `…-mobile35 / -brand36` | мобильный адаптив, фирстиль |
| v1.0.32–34 | `…-logic32 / -invite33 / -logic34` | скоуп лиги, приглашения, судейский корпус |
| v1.0.21–31 | `…-security … -lineup28 …` | RBAC, XSS/BOLA-фиксы, деплой-фиксы (см. старые README) |

**Прямые ссылки (панель /download/):**

- v1.0.45: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-06-dbfix45.git-bundle
- v1.0.44: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-fs44.git-bundle
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
`find text` кликает только первый точный матч — для табов с бейджем
счётчика («Протокол · 12») клик через eval по textContent.startsWith.
Тонкость SMTP-мока: nodemailer кодирует письма (text — base64, html —
quoted-printable, тема — RFC 2047) — токен ссылки ищется только после
декодирования (см. parseMail в test-invites.ts).
EOF
"""

src = src[: i] + new_readme + "\n"

assert src.count("<<'EOF'") == 1
assert "dbfix45" in src and 'ONEFILE=download/scoresbox-2026-10-06-dbfix45.git-bundle' in src
assert 'public/scoresbox-2026-10-06-dbfix45.git-bundle' in src
assert 'SCORESBOX 2026-10-05 fs44:' not in src, "старый коммит не заменён"
# fs44 легитимно остаётся в архивной таблице README поставки; запрещён
# только в РАБОЧИХ строках (ONEFILE=, cp, сообщение коммита) — грабля
# слишком строгого ассерта из Task 49 повторяем сознательно обойдённой
assert 'ONEFILE=download/scoresbox-2026-10-05-fs44.git-bundle' not in src
assert 'cp "$ONEFILE" public/scoresbox-2026-10-05-fs44.git-bundle' not in src
assert src.rstrip().endswith("EOF")

SH.write_text(src, encoding="utf-8")
print("OK: make-archives.sh -> dbfix45 (ONEFILE + cp + commit + README)")
