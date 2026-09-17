# 🏆 SCORESBOX · Ops-гайд: релизы, домен, мониторинг, восстановление

**Состояние: деплой зелёный — v1.0.12 работает в проде.**

- **РАЗДЕЛ I — быстрые задачи**: выпустить релиз, сменить домен, логи,
  мониторинг, откат, бэкапы, забрать обновление из чата. Это всё, что
  нужно в обычной жизни.
- **РАЗДЕЛ II — с нуля**: полная инструкция развёртывания на НОВОМ сервере
  (переезд или пересоздание). В обычной жизни не открывать.

> Что за проект, из чего состоит, как запустить локально — **README.md**
> рядом с этим файлом.

---

# ⚡ РАЗДЕЛ I. Быстрые задачи (сайт уже работает)

## I.1 Выпустить новую версию

Изменения попадают в прод ТОЛЬКО тегом (обычный push гоняет лишь тесты CI):

```bash
git tag v1.0.13
git push origin v1.0.13
```

Дальше GitHub Actions делает всё сам: тесты → сборка образа → GHCR →
деплой на сервер (бэкап БД → миграции → перезапуск → health-check →
авто-откат при провале). Прогон: https://github.com/artyom-front/solid-sniffle/actions
(5–10 минут). Зелёный прогон = сайт обновлён.
Теги не переиспользовать: v1.0.6–v1.0.12 уже заняты.

## I.2 Сменить домен (целевой: scoresbox.ru)

Код при смене домена НЕ меняется — домен живёт в трёх местах: DNS, `.env`, nginx.

| # | Где | Что сделать | Как проверить |
|---|---|---|---|
| 1 | панель регистратора домена | A-записи `@` и `www` → IP сервера | `nslookup scoresbox.ru` показывает IP сервера |
| 2 | `/opt/scoresbox/.env` | `SITE_URL=https://scoresbox.ru` | `grep ^SITE_URL= .env` |
| 3 | сервер | перезапустить приложение с новым env: `docker compose -f deploy/docker-compose.prod.yml up -d app` | `… ps app` → `Up (healthy)` |
| 4 | сервер | `sudo ./scripts/setup-nginx.sh scoresbox.ru` | вывод «nginx готов» |
| 5 | сервер | `sudo certbot --nginx -d scoresbox.ru -d www.scoresbox.ru` | `curl -I https://scoresbox.ru` → `200` |
| 6 | GitHub → Settings → Secrets → Actions | `DEPLOY_PUBLIC_URL=https://scoresbox.ru` | следующий деплой зелёный |

DNS обновляется до 24 часов (обычно 1–3 часа). SSL-сертификат certbot
продлевает сам (задача в cron/systemd — ставится вместе с certbot).

## I.3 Мониторинг: как понять, что сайт жив

Четыре уровня — три уже работают, четвёртый настроить один раз:

1. **Контейнеры (уже работает).** `restart: unless-stopped`: если процесс
   приложения упадёт — Docker поднимет его сам. Healthcheck
   (`/api/health`, БД+версия) отражает состояние в `docker ps`.
2. **Каждый деплой (уже работает).** CD завершается внешним health-check
   (`DEPLOY_PUBLIC_URL`); при провале — авто-откат и красный прогон.
   Включите письма о падениях: на странице репозитория кнопка **Watch →
   Custom → только Actions**.
3. **Внешний пинг (настроить, 10 минут, бесплатно).** UptimeRobot или
   Better Stack Free: проверять `https://scoresbox.ru` и
   `https://scoresbox.ru/api/health` каждые 5 минут, алерты на почту или
   Telegram. Единственный способ узнать о падении, не заходя на сайт.
4. **Регулярный осмотр (1–2 минуты).** Раз в день/неделю на сервере:
   `bash scripts/status.sh` — контейнеры, health, версия, диск, бэкапы.

«Данные не обновляются» — это почти никогда не техчасть: расписание и
события матчей вносятся в админке (/admin → матч → протокол). Если LIVE
не двигается — проверьте, что события реально введены.

## I.4 Логи: где что смотреть

| Что смотрим | Команда на сервере |
|---|---|
| приложение | `docker logs scoresbox-app --tail 100` (`-f` — следить вживую) |
| PostgreSQL | `docker logs scoresbox-db --tail 50` |
| nginx | `sudo tail -50 /var/log/nginx/error.log` |
| версия / история деплоев | `cat /opt/scoresbox/.deploy/current` и `cat /opt/scoresbox/.deploy/history` |
| место на диске | `df -h /` (образы Docker чистит каждый деплой сам) |

Логи контейнеров ротируются (json-file, 10 МБ × 3 файла) — диск не забьют.

## I.5 Откат на прошлую версию

```bash
cd /opt/scoresbox
bash scripts/rollback.sh            # на предпоследний рабочий тег
bash scripts/rollback.sh 1.0.11     # или на конкретную версию
```

При провале деплоя откат выполняется автоматически (job Rollback в Actions).

## I.6 Бэкапы

- **Автоматически перед каждым деплоем**: `backups/pg-<дата>.dump`,
  хранение 30 дней, старые чистятся сами. Список: `ls -lh backups/`.
- **Вручную в любой момент**: `bash scripts/backup-db.sh`.
- **Рекомендация на первую неделю**: раз в 5–7 дней скачивать свежий
  `.dump` на компьютер (offsite-копия) — сервер может быть утрачен целиком.

## I.7 Забрать обновление кода из чата (бандл)

Ассистент собирает бандл вида `scoresbox-<дата>-<имя>.git-bundle` и даёт
прямую ссылку. Применение (PowerShell, папка клона):

```powershell
git fetch "$HOME\Downloads\scoresbox-<дата>-<имя>.git-bundle" main
git log --oneline -1 FETCH_HEAD   # дата в сообщении = дата в имени файла
git reset --hard FETCH_HEAD
git push --force origin main
git tag v1.0.13 ; git push origin v1.0.13
```

---

# 🚀 РАЗДЕЛ II. С нуля (полный, ~60–75 минут — только для нового сервера)

| # | Шаг | Считается пройденным, когда… | Время |
|---|---|---|---|
| 1 | Купить сервер | известны IP и root-пароль | 5 мин |
| 2 | Домен → сервер | `nslookup scoresbox.ru` = ваш IP | 5 мин |
| 3 | SSH | приглашение `root@…` | 3 мин |
| 4 | Софт + файрвол | docker/nginx/certbot/git показывают версии; ufw active | 12 мин |
| 5 | Код на сервере | `/opt/scoresbox` заполнен | 3 мин |
| 6 | Секреты `.env` | нет CHANGE_ME, права 600 | 5 мин |
| 7 | nginx + SSL | `https://scoresbox.ru` отвечает 502 (норма) | 10 мин |
| 8 | GitHub Secrets | 4 секрета в настройках репо | 5 мин |
| 9 | Деплой тегом | все job'ы CD зелёные, сайт 200 | 10 мин |
| 10 | Под капотом | (информация) | — |
| 11 | Вход + 2FA | код из приложения спрашивается | 3 мин |
| 12 | Бэкап по cron | в `backups/` есть свежий .dump | 3 мин |
| 13 | Финальная проверка | все URL отвечают 200 | 5 мин |

### Б1. Купить сервер (5 минут)

**timeweb.cloud → Cloud → Создать**: Ubuntu 24.04 LTS · 2 ГБ RAM / 20 ГБ SSD / 1 vCPU
(Москва). Панель покажет **IP** и **root-пароль** — сохраните.

*Зачем 2 ГБ: PostgreSQL + SSR Next.js + сборка образа одновременно; 1 ГБ впритык.*

**✅ Проверка:** `ping ВАШ_IP` — ответы с вашего IP без потерь.

### Б2. Домен → сервер (5 минут)

У регистратора `scoresbox.ru` → DNS-управление:

| Тип | Имя | Значение | TTL |
|---|---|---|---|
| A | `@` | IP сервера | 3600 |
| CNAME | `www` | `scoresbox.ru.` | 3600 |

`@` — «сам домен», запись `www` — «с www то же самое».

**✅ Проверка:** `nslookup scoresbox.ru` → `Адрес: 194.87.XX.XX` (ваш IP).
Единственный шаг, где «не работает» чаще всего значит «не подождали» (до часа).

### Б3. Подключиться по SSH (3 минуты)

```bash
ssh root@194.87.XX.XX     # первый раз: yes → пароль (не отображается — норма)
```

**✅ Проверка:** `whoami` → `root`; приглашение сменилось на `root@…`.

### Б4. Установить софт и закрыть порты (12 минут)

```bash
# 1. Свежие патчи безопасности
apt update && apt upgrade -y

# 2. Docker (приложение в «пузыре» со своими зависимостями)
curl -fsSL https://get.docker.com | sh

# 3. Nginx (обратный прокси: HTTPS, gzip, кэш статики)
apt install -y nginx

# 4. Certbot (бесплатный SSL с автопродлением)
apt install -y certbot python3-certbot-nginx

# 5. Git (забрать код проекта)
apt install -y git

# 6. Файрвол: разрешаем ТОЛЬКО SSH/HTTP/HTTPS, остальное — запрет
apt install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

> Почему это безопасно: приложение и БД привязаны к `127.0.0.1` (см. compose-файлы),
> наружу смотрят только nginx (80/443) и SSH. Ufw фиксирует это правило на уровне сети.

**✅ Проверка:**

```bash
docker --version && nginx -v 2>&1 && certbot --version && git --version
# Docker version 27.x / nginx/1.24.0 / certbot 2.9.0 / git 2.43.0 — версии могут отличаться

docker ps
# шапка таблицы и ПУСТО — контейнеров пока нет, это правильно

systemctl is-active nginx && ufw status
# active
# Status: active, с строками 22, 80, 443 ALLOW
```

### Б5. Забрать код (3 минуты)

```bash
git clone https://github.com/artyom-front/solid-sniffle.git /opt/scoresbox
cd /opt/scoresbox
```

*`/opt` — «взрослое» место для сторонних приложений (не /home, не /etc).*

**✅ Проверка:** `ls /opt/scoresbox` → DEPLOY.md, Dockerfile, README.md,
prisma, scripts, src, deploy…; `git log --oneline -1` → свежий коммит.

### Б6. Секреты `.env` (5 минут)

```bash
cp .env.example .env
nano .env          # сохранение: Ctrl+X → Y → Enter
```

Заполнить (шаблон уже содержит scoresbox.ru):

```ini
POSTGRES_PASSWORD=<openssl rand -hex 16>     # 32 hex-символа
AUTH_SECRET=<openssl rand -hex 32>           # 64 hex-символа — генерируйте на сервере!
ADMIN_EMAIL=admin@scoresbox.ru             # логин; домен менять при переезде не обязательно
ADMIN_PASSWORD=<пароль админа, от 8 символов>
SITE_URL=https://scoresbox.ru              # ← главный доменный переключатель
SHOW_DEMO_ACCOUNTS=0
```

`DATABASE_URL` писать не нужно — compose соберёт его сам из POSTGRES_PASSWORD.

```bash
chmod 600 .env
```

**✅ Проверка:**

```bash
grep -c CHANGE_ME .env          # → 0
grep -E '^(POSTGRES_PASSWORD|AUTH_SECRET|ADMIN_EMAIL|ADMIN_PASSWORD|SITE_URL|SHOW_DEMO_ACCOUNTS)=' .env | wc -l
# → 6
ls -l .env                      # → -rw------- 1 root root ...
```

### Б7. nginx + SSL (10 минут)

```bash
cd /opt/scoresbox
./scripts/setup-nginx.sh scoresbox.ru
```

**✅ Промежуточная проверка:** последние строки вывода —
`nginx: ... test is successful` и `==> nginx готов: принимает scoresbox.ru ...`.

Сертификат:

```bash
certbot --nginx -d scoresbox.ru -d www.scoresbox.ru
```

Вопросы certbot: почта → `Y` (соглашение) → `N` (EFF) → `2` (редирект на HTTPS).

**✅ Итоговая проверка** (с компьютера): `curl -I https://scoresbox.ru` →
`HTTP/2 502` — **правильный ответ** (nginx и сертификат работают, приложения ещё нет).
Дополнительно: `certbot certificates` → сертификат `scoresbox.ru`, valid ~89 days.

### Б8. GitHub Secrets (5 минут)

**На сервере** — отдельный ключ деплоя (ваш личный ключ не светим):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N ""
cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/deploy_key        # скопировать ПОЛНОСТЬЮ: -----BEGIN… -----END…
```

**✅ Проверка ключа:** `ssh -i ~/.ssh/deploy_key root@localhost whoami` → `root`
(без запроса пароля — ключ работает).

**На GitHub** → Settings → Secrets and variables → Actions → New repository secret
(четыре раза):

| Секрет | Значение |
|---|---|
| `DEPLOY_HOST` | IP сервера |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | приватный ключ целиком |
| `DEPLOY_PUBLIC_URL` | `https://scoresbox.ru` |

> ⚠️ **Значения — БЕЗ кавычек.** GitHub сохранит ровно то, что вставили:
> кавычка станет частью пароля, и дверь не откроется (`Permission denied`).
> IP → `194.87.15.42`, URL → `https://scoresbox.ru`, ключ → от
> `-----BEGIN…` до `-----END…` включительно.

**✅ Проверка:** в списке Repository secrets видны ровно 4 имени. Настоящая
проверка случится в Б9: неверный ключ → job Deploy упадёт с `Permission denied (publickey)`.

### Б9. Запустить деплой (10 минут)

> `./scripts/deploy.sh` руками НЕ запускается — его вызывает GitHub Actions
> с номером версии. Если запустили без аргумента и увидели
> `Использование: ./scripts/deploy.sh <тег…>` — это не ошибка, всё в порядке.

**На своём компьютере:**

```bash
git tag v1.0.0        # занят? → v1.0.1 (список: git tag)
git push origin v1.0.0
```

**GitHub → Actions → CD**: три job'а (Build & push → Deploy → VPS → health-check).
В логе Deploy видно работу deploy.sh построчно:

```
==> Деплой SCORESBOX ghcr.io/artyom-front/solid-sniffle:1.0.0
==> Первый запуск: старт PostgreSQL
==> Ждём готовности PostgreSQL
==> Бэкап БД (pg_dump)   (при первом деплое: бэкап пропущен — БД пустая)
==> Миграции (prisma db push)
==> docker compose up -d
==> health-check
    прод здоров ✓
==> Бутстрап админа
==> Деплой 1.0.0 завершён успешно
```

**✅ Проверка** (на сервере): `docker compose -f deploy/docker-compose.prod.yml ps` →
оба контейнера `Up … (healthy)`; `curl -s http://localhost:3000/api/health` →
`{"ok":true,"db":"up",…}`. С компьютера: `curl -I https://scoresbox.ru` → `HTTP/2 200`.

### Б10. Что деплой делает сам (информация)

| # | Шаг | Зачем |
|---|---|---|
| 1 | `pg_dump` → `backups/` | снимок БД до изменений — восстановление за минуту |
| 2 | `prisma db push` | актуализация таблиц без потери данных |
| 3 | `docker compose up -d` | новая версия поднимается, старая заменяется |
| 4 | health-check 90 сек | приложение обязано доказать, что живо и БД отвечает |
| 5 | `prisma/bootstrap.ts` | один раз создаёт админа из `.env` (дальше пропускается) |
| 6 | запись в `.deploy/history` | по ней работает откат |

Health-check провален → авто-откат на предыдущую рабочую версию: прод не «лежит».

### Б11. Первый вход и 2FA (3 минуты)

`https://scoresbox.ru/admin` → вход (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) →
панель → **Система → Безопасность**: сменить пароль + включить 2FA
(Google Authenticator / Яндекс.Ключ; **сохранить 8 резервных кодов** — выдаются один раз).

**✅ Проверка:** после выхода повторный вход требует 6-значный код из приложения.

### Б12. Ежедневный бэкап (3 минуты)

```bash
crontab -e
# добавить строку:
15 3 * * * /opt/scoresbox/scripts/backup-db.sh >> /var/log/scoresbox-backup.log 2>&1
```

**✅ Проверка 1:** `crontab -l` → строка на месте.
**✅ Проверка 2** (руками, ждать ночи не надо):

```bash
/opt/scoresbox/scripts/backup-db.sh
ls -lh /opt/scoresbox/backups/
# -rw-r--r-- 1 root root 236K ... pg-ГГГГММДД-ЧЧММСС.dump
```

### Б13. Финальная проверка (5 минут)

```bash
curl -I https://scoresbox.ru                                   # HTTP/2 200
curl -s https://scoresbox.ru/api/public/overview | head -c 200  # {"leagues":[…]}
curl -s https://scoresbox.ru/sitemap.xml | head -c 200         # <?xml… <urlset
curl -s https://scoresbox.ru/robots.txt                        # Disallow: /admin
```

| URL в браузере | Что увидеть |
|---|---|
| `https://scoresbox.ru` | livescore, турнирная таблица, замок 🔒 |
| `https://scoresbox.ru/admin` | форма входа → email + код 2FA |
| `https://scoresbox.ru/sitemap.xml` | карта сайта |

Дальше — укрепление: offsite-бэкап и мониторинг (разделы I.3 и I.6 выше) — 15 минут,
которые превращают «работает» в «не страшно потерять».

---

# 🔁 СМЕНА ДОМЕНА (например, scoresbox.ru → scoresbox.ru)

Все места, где живёт домен, параметризованы. Порядок (без потери данных, ~15 минут):

| # | Что | Как | Время |
|---|---|---|---|
| 1 | DNS нового домена | у регистратора: A `@` → IP, CNAME `www` | 5 мин (+ожидание) |
| 2 | nginx | на сервере: `./scripts/setup-nginx.sh scoresbox.ru` | 1 мин |
| 3 | SSL | `certbot --nginx -d scoresbox.ru -d www.scoresbox.ru` | 2 мин |
| 4 | `.env` | `sed -i 's|^SITE_URL=.*|SITE_URL=https://scoresbox.ru|' .env` + `docker compose -f deploy/docker-compose.prod.yml up -d` (перезапуск подхватит) | 2 мин |
| 5 | GitHub Secret | `DEPLOY_PUBLIC_URL` → `https://scoresbox.ru` | 1 мин |
| 6 | Подвал сайта | в git: `src/components/portal/brand.ts` → `DOMAIN = "scoresbox.ru"` → коммит → `git tag v1.0.2 && git push origin v1.0.2` (деплой сам подъедет) | 5 мин |
| 7 | Старый домен | оставить A-запись + 301-редирект у регистратора, если поддерживает (SEO-плавность) | опц. |

**✅ Проверка:** `curl -I https://scoresbox.ru` → 200; в sitemap.xml URL начинаются
с нового домена; robots.txt указывает на новый sitemap.

> Что НЕ требует изменений при переезде: БД, секреты `.env` (кроме SITE_URL),
> аккаунт админа, ключи деплоя, GitHub-репозиторий.

---

## 📦 Как выпускать обновления

```bash
git checkout -b feature/live-protocol
# ...правки...
git add . && git commit -m "Протокол: кнопка завершения матча"
# Pull Request → CI гоняет тесты → merge в main
git tag v1.0.1
git push origin main --tags      # деплой поедет сам
```

Семантика версий: `v1.0.1` — правка, `v1.1.0` — фича, `v2.0.0` — ломающие изменения.

**Экстренный откат** (версия плохая, CI не поймал):

```bash
cd /opt/scoresbox && ./scripts/rollback.sh
```

## 💾 Восстановление из бэкапа

```bash
cd /opt/scoresbox
docker compose -f deploy/docker-compose.prod.yml stop app   # никто не пишет в базу
ls -lh backups/                                              # выбрать дамп
docker compose -f deploy/docker-compose.prod.yml exec -T db \
  pg_restore -U scoresbox -d scoresbox --clean --if-exists < backups/pg-ДАТА.dump
docker compose -f deploy/docker-compose.prod.yml up -d
```

`--clean --if-exists` — снести текущие таблицы перед восстановлением: база станет
ровно такой, как на момент дампа.

## 🩺 Если что-то сломалось

| Симптом | Причина | Что делать |
|---|---|---|
| `deploy.sh` пишет «Использование: …» | не ошибка — скрипту нужен тег версии | ничего; запускайте деплой тегом (Б9) |
| `502 Bad Gateway` | приложение не поднялось | `docker logs scoresbox-app --tail 50` |
| `502` + в логах про БД | PostgreSQL не готов / пароль | `docker logs scoresbox-db --tail 30`, `POSTGRES_PASSWORD` в `.env` |
| Сайт не открывается по домену | DNS не обновился | `nslookup <домен>`, ждать до часа |
| «Сертификат недействителен» | certbot не продлился | `certbot certificates`, `certbot renew --dry-run` |
| Красный job Deploy | секреты/IP изменились | Settings → Secrets (Б8); `ssh root@IP` руками |
| `Permission denied (publickey)` | ключ в секрете неверен | перепроверить `DEPLOY_SSH_KEY`, тест из Б8 |
| `git clone` просит пароль | репозиторий приватный | сделать public или клонировать с PAT |
| Деплой прошёл, «данные пропали» | смотрели не ту БД | `docker compose -f deploy/docker-compose.prod.yml exec db psql -U scoresbox -d scoresbox -c 'SELECT count(*) FROM "Match";'` |
| `curl` извне падает по таймауту | ufw закрыл порт | `ufw status`, разрешить 80/443 (Б4) |

Универсальный порядок «что смотреть сначала»:

```bash
cd /opt/scoresbox
docker compose -f deploy/docker-compose.prod.yml ps   # кто жив
docker logs scoresbox-app --tail 100                  # что говорит приложение
docker logs scoresbox-db --tail 30                    # что говорит база
cat .deploy/history                                   # какие версии ставились
```

Перезапуск «с нуля» (данные сохраняются):

```bash
cd /opt/scoresbox
docker compose -f deploy/docker-compose.prod.yml down
./scripts/deploy.sh $(cat .deploy/current)
```

## 🔄 CI/CD: что происходит без вас

**push в main** → CI: quality (ESLint+tsc+54 unit) · integration (чистый PostgreSQL +
16 тестов, 36 инвариантов PRD) · docker (сборка образа) · audit (CVE зависимостей).
Красный CI = код не попадёт в main.

**тег `v*`** → CD: сборка и публикация образа в GHCR → деплой на сервер → внешний health-check.

## 🔒 Безопасность (чек-лист)

- [x] HTTPS + автопродление (certbot)
- [x] ufw: только 22/80/443 (Б4)
- [x] Пароли не в git: `.env` на сервере, `chmod 600`
- [x] 2FA на админке (TOTP + 8 резервных кодов)
- [x] RBAC: супер-админ / админ лиги / админ клуба / судья
- [x] Rate-limit на login/OTP (429)
- [x] Cookie httpOnly + HMAC-подпись
- [x] robots.txt закрывает /admin и /api
- [x] Отдельный SSH-ключ для деплоя
- [x] Ежедневные бэкапы + ротация 30 дней
- [x] Авто-откат при провале health-check
- [ ] Offsite-бэкапы и мониторинг — разделы I.3 и I.6 (сделать в первую неделю)

## 💰 Стоимость владения

| Статья | ₽/мес |
|---|---|
| VPS 2 ГБ | ~250 |
| Домен | ~20 |
| SSL | 0 |
| GitHub Actions | 0 (public-репо) |
| **Итого** | **~270** |

## 💻 Локальная разработка (для будущей команды)

```bash
git clone https://github.com/artyom-front/solid-sniffle.git && cd solid-sniffle
docker compose up -d db                       # PostgreSQL на 127.0.0.1:5432
cp .env.example .env                          # DATABASE_URL для локалки — внутри
bunx prisma db push && bun prisma/seed.ts     # таблицы + демо-данные
bun install && bun run dev                    # http://localhost:3000
```

Демо-аккаунты (только дев): `admin@ff21.ru`, `liga@ff21.ru`, `sudya@ff21.ru`,
`club@ff21.ru` — пароли в `prisma/seed.ts`.

Карта кода: `src/lib/engine/*` — бизнес-движки · `src/app/api/**` — REST ·
`src/app/(site)/**` — SSR-страницы · `prisma/schema.prisma` — модель данных.
Как устроен проект — **README.md**.

