# 🏆 SCORESBOX · Гайд по деплою v3 — «footballday.ru сейчас, любой домен потом»

**Каждый шаг: что делаем → зачем → как проверить (команда + точный ожидаемый вывод).**

> 🎓 **Не понятна команда?** Что она делает и зачем — простыми словами,
> с бытовыми примерами — в **TUTORIAL.md** (лежит рядом с этим файлом).
> Секреты, теги, «почему Actions красные», «где какую команду вводить» — всё там.

## Что изменилось в v3

| Было (v2) | Стало (v3) |
|---|---|
| домен вшит в файлы (scoresbox.ru) | домен — **параметр**: `setup-nginx.sh <домен>`, `SITE_URL` в `.env` |
| один сценарий «с нуля» | **два пути**: А — продолжить с того, что уже сделано; Б — начать с нуля |
| один домен навсегда | раздел «Смена домена»: переезд на scoresbox.ru за ~15 минут, без потери данных |

**Текущая ситуация:** доступа к `scoresbox.ru` нет → временно работаем на **`footballday.ru`**
(предполагается, что он у вас есть; если нет — купите у регистратора, ~200–800 ₽/год).
Глубокая аналитика проекта (архитектура, масштабируемость, риски) — в **ANALYTICS.md** рядом с этим файлом.

---

## 🗺 План действий: как выбрать путь

| | **ПУТЬ А** — продолжить | **ПУТЬ Б** — с нуля |
|---|---|---|
| Для кого | сервер уже покупался, что-то ставилось по старым гайдам | свежий VPS / хотите чистую историю |
| Время | ~25–35 минут | ~60–75 минут |
| С чего начинается | диагностика «что уже сделано» (А0) | покупка сервера (Б1) |

**Не знаете, что уже сделано?** Начните с А0 — таблица покажет, что готово,
а что докрутить по шагам Б. Путь А и Б сходятся на шаге запуска деплоя тегом.

---

## 🧠 30 секунд теории: как это работает

```
 ваш компьютер                GitHub                        сервер (VPS)
 ─────────────    ───────────────────────────    ─────────────────────────────
 git tag v1.0.0  →  Actions собирает Docker-образ  →  deploy.sh по SSH:
 git push          и кладёт его в реестр GHCR        1. бэкап БД (pg_dump)
                   перед этим прогоняет тесты        2. миграции (prisma db push)
                                                     3. docker compose up -d
                                                     4. health-check (90 сек)
                                                     5. авто-откат, если упал
```

- **Образ, а не `git pull`**: сервер скачивает «запечатанную» сборку, прошедшую тесты.
- **Деплой запускается тегом** (`git tag v1.0.0 && git push origin v1.0.0`), а не каждым push:
  обычный push гоняет только тесты (CI), поставка — осознанный акт.
- **`./scripts/deploy.sh` руками не запускается** — его вызывает GitHub Actions,
  передавая номер версии. Запуск без аргумента честно останавливается с сообщением
  `Использование: ./scripts/deploy.sh <тег…>` — это защита, не поломка.

## ✅ Что нужно заранее

| Что | Значение | Стоимость |
|---|---|---|
| Код на GitHub | `github.com/artyom-front/studious-tribble` | уже есть |
| Домен | `footballday.ru` (временный) | ваш |
| VPS | Ubuntu 24.04, 2 ГБ RAM, 20 ГБ SSD | ~250 ₽/мес |
| Время | по выбранному пути | 25–75 минут |

---

# 🚀 ПУТЬ А — продолжить с текущего состояния

### А0. Диагностика: что уже сделано (3 минуты)

Подключитесь к серверу (`ssh root@IP`) и прогоните команды. По результатам
таблица подскажет, какие шаги можно пропустить, а какие — докрутить.

```bash
whoami                                    # → root: вы на сервере
docker --version && nginx -v && certbot --version && git --version
ls -d /opt/scoresbox /opt/scores21 2>/dev/null
ls -l /opt/scoresbox/.env /opt/scores21/.env 2>/dev/null
ls /etc/nginx/sites-enabled/ 2>/dev/null
certbot certificates 2>/dev/null || echo "сертификатов нет"
docker ps -a --format '{{.Names}} {{.Status}}' 2>/dev/null
```

| Если увидели… | Статус | Что делать |
|---|---|---|
| `docker: command not found` | софт не ставился | шаги Б4–Б5 |
| папки `/opt/...` нет | код не скачивался | А1 → шаги Б5–Б6 |
| `.env` существует | секреты созданы | А1, затем А5 (проверить SITE_URL) |
| `sites-enabled/scores21` или `scoresbox` | nginx настраивался | А3 (скрипт перепишет всё сам) |
| `certbot certificates` пусто | SSL не получен | А4 |
| контейнеры есть/были | деплой пробовали | нормально: А7 всё пересоберёт |
| `ls scripts/setup-nginx.sh` → «No such file» | на сервере старая версия кода | А1 (скрипт появился в v3) |

### А1. Обновить код до v3 (5 минут)

**На своём компьютере** (в папке клона проекта) — применить свежий бандл.
Ваш GitHub-репозиторий может «разъехаться» с эталоном (свои коммиты-черновики) —
поэтому не merge, а выравнивание по эталону:

```bash
cd studious-tribble                      # ваш клон (если нет — см. download/README.md)
git fetch /путь/к/scoresbox-update.git-bundle main
git reset --hard FETCH_HEAD              # заменить локальную историю на эталонную v3
git push --force origin main             # то же — в облако (черновые коммиты заменяются)
```

Ожидаемый вывод push:
`To https://github.com/artyom-front/studious-tribble.git`
`+ хеш...хеш main -> main (forced update)`.

> Почему это безопасно: `reset --hard` затирает только локальные черновики
> (в вашем случае — правки DEPLOY.md); эталон v3 включает всё то же и целиком.
> Что делает каждая команда — TUTORIAL.md, разделы 2 и 10.

**На сервере** — переименовать старую папку (если она scores21) и выровняться
по облаку:

```bash
[ -d /opt/scores21 ] && mv /opt/scores21 /opt/scoresbox   # .env переедет вместе
cd /opt/scoresbox
git fetch origin
git reset --hard origin/main             # гарантированно та же версия, что в облаке
```

Если папки `/opt/scoresbox` нет вовсе — код на сервер не копировали: шаг Б5.

**✅ Проверка:**

```bash
ls /opt/scoresbox/scripts/setup-nginx.sh   # → файл существует (появился в v3)
git -C /opt/scoresbox log --oneline -1
# → хеш последнего коммита с сообщением про v3/footballday
```

### А2. Направить footballday.ru на сервер (5 минут)

В панели регистратора `footballday.ru` → **DNS-управление** добавьте/измените записи:

| Тип | Имя | Значение | TTL |
|---|---|---|---|
| A | `@` | IP-адрес вашего сервера | 3600 |
| CNAME | `www` | `footballday.ru.` | 3600 |

**✅ Проверка** (DNS обновляется от минуты до часа):

```bash
nslookup footballday.ru
```

Ожидаемый вывод:

```
Неавторитетный ответ:
Имя:     footballday.ru
Адрес:   194.87.XX.XX      ← IP вашего сервера
```

Показывает другой IP / «не найдено» — подождите 10–60 минут и повторите.

### А3. Перенастроить nginx под footballday.ru (3 минуты)

Скрипт v3 сам перепишет конфиг под новый домен и удалит старые конфиги проекта:

```bash
cd /opt/scoresbox
./scripts/setup-nginx.sh footballday.ru
```

Ожидаемый вывод:

```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
==> nginx готов: принимает footballday.ru и www.footballday.ru (HTTP).
    Следующий шаг: certbot --nginx -d footballday.ru -d www.footballday.ru
```

**✅ Проверка:** `curl -I http://footballday.ru` → `HTTP/1.1 502` — это норма
(приложение ещё не запущено; главное — nginx отвечает на новый домен).
Старые сертификаты от прежних доменов можно удалить: `certbot delete --cert-name <старое-имя>`
(сначала посмотрите имена: `certbot certificates`).

### А4. Получить SSL-сертификат (3 минуты)

```bash
certbot --nginx -d footballday.ru -d www.footballday.ru
```

| Вопрос certbot | Ответ |
|---|---|
| Enter email address | ваша настоящая почта |
| Terms of Service | `Y` |
| Share email with EFF | `N` |
| Redirect HTTP → HTTPS? | `2` |

Ожидаемый вывод в конце:

```
Successfully deployed certificate for footballday.ru to /etc/nginx/sites-enabled/scoresbox
Successfully deployed certificate for www.footballday.ru to /etc/nginx/sites-enabled/scoresbox
```

**✅ Проверка** (с вашего компьютера): `curl -I https://footballday.ru` → `HTTP/2 502`
— норма: HTTPS и сертификат работают, приложение запустим в А7.

### А5. Проверить `.env` (2 минуты)

В `.env` на сервере должен быть `SITE_URL=https://footballday.ru` (и не должно
остаться заглушек):

```bash
cd /opt/scoresbox
grep -c 'CHANGE_ME' .env          # → 0
grep '^SITE_URL=' .env            # → SITE_URL=https://footballday.ru
```

Если SITE_URL старый — поправить одной командой:

```bash
sed -i 's|^SITE_URL=.*|SITE_URL=https://footballday.ru|' .env
```

Если `.env` вообще нет — шаг Б6.

### А6. Обновить секрет GitHub (2 минуты)

**GitHub → репозиторий → Settings → Secrets and variables → Actions → DEPLOY_PUBLIC_URL**
→ Update → значение `https://footballday.ru`.

Остальные три секрета (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`) не зависят
от домена; если их ещё нет — шаг Б8.

### А7. Запустить деплой (2 минуты + ~7 минут сборки)

**На своём компьютере**:

```bash
git tag v1.0.0        # если тег уже есть (git tag покажет) — берите v1.0.1
git push origin v1.0.0
```

Ожидаемый вывод:

```
To https://github.com/artyom-front/studious-tribble.git
 * [new tag]           v1.0.0 -> v1.0.0
```

**GitHub → Actions → CD → строка «CD / v1.0.0»** — три job'а по очереди:
Build & push (2–5 мин) → Deploy → VPS (1–2 мин) → внешний health-check
(`✅ прод живой (HTTP 200)`).

**✅ Финальная проверка** — на сервере:

```bash
cd /opt/scoresbox
docker compose -f deploy/docker-compose.prod.yml ps
# NAME           IMAGE                                        STATUS
# scoresbox-app  ghcr.io/artyom-front/studious-tribble:1.0.0  Up 2 minutes (healthy)
# scoresbox-db   postgres:16-alpine                            Up 2 minutes (healthy)

curl -s http://localhost:3000/api/health
# {"ok":true,"db":"up","version":"1.0.0","uptime":127,"time":"..."}
```

И с компьютера: `curl -I https://footballday.ru` → **`HTTP/2 200`** — сайт в эфире. 🎉

Дальше: вход и 2FA (Б11), ежедневный бэкап (Б12), финальная проверка (Б13).

---

# 🚀 ПУТЬ Б — начать с нуля (полный, ~60–75 минут)

| # | Шаг | Считается пройденным, когда… | Время |
|---|---|---|---|
| 1 | Купить сервер | известны IP и root-пароль | 5 мин |
| 2 | Домен → сервер | `nslookup footballday.ru` = ваш IP | 5 мин |
| 3 | SSH | приглашение `root@…` | 3 мин |
| 4 | Софт + файрвол | docker/nginx/certbot/git показывают версии; ufw active | 12 мин |
| 5 | Код на сервере | `/opt/scoresbox` заполнен | 3 мин |
| 6 | Секреты `.env` | нет CHANGE_ME, права 600 | 5 мин |
| 7 | nginx + SSL | `https://footballday.ru` отвечает 502 (норма) | 10 мин |
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

У регистратора `footballday.ru` → DNS-управление:

| Тип | Имя | Значение | TTL |
|---|---|---|---|
| A | `@` | IP сервера | 3600 |
| CNAME | `www` | `footballday.ru.` | 3600 |

`@` — «сам домен», запись `www` — «с www то же самое».

**✅ Проверка:** `nslookup footballday.ru` → `Адрес: 194.87.XX.XX` (ваш IP).
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
git clone https://github.com/artyom-front/studious-tribble.git /opt/scoresbox
cd /opt/scoresbox
```

*`/opt` — «взрослое» место для сторонних приложений (не /home, не /etc).*

**✅ Проверка:** `ls /opt/scoresbox` → DEPLOY.md, ANALYTICS.md, Dockerfile,
prisma, scripts, src, deploy…; `git log --oneline -1` → свежий коммит.

### Б6. Секреты `.env` (5 минут)

```bash
cp .env.example .env
nano .env          # сохранение: Ctrl+X → Y → Enter
```

Заполнить (шаблон уже содержит footballday.ru):

```ini
POSTGRES_PASSWORD=<openssl rand -hex 16>     # 32 hex-символа
AUTH_SECRET=<openssl rand -hex 32>           # 64 hex-символа — генерируйте на сервере!
ADMIN_EMAIL=admin@footballday.ru             # логин; домен менять при переезде не обязательно
ADMIN_PASSWORD=<пароль админа, от 8 символов>
SITE_URL=https://footballday.ru              # ← главный доменный переключатель
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
./scripts/setup-nginx.sh footballday.ru
```

**✅ Промежуточная проверка:** последние строки вывода —
`nginx: ... test is successful` и `==> nginx готов: принимает footballday.ru ...`.

Сертификат:

```bash
certbot --nginx -d footballday.ru -d www.footballday.ru
```

Вопросы certbot: почта → `Y` (соглашение) → `N` (EFF) → `2` (редирект на HTTPS).

**✅ Итоговая проверка** (с компьютера): `curl -I https://footballday.ru` →
`HTTP/2 502` — **правильный ответ** (nginx и сертификат работают, приложения ещё нет).
Дополнительно: `certbot certificates` → сертификат `footballday.ru`, valid ~89 days.

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
| `DEPLOY_PUBLIC_URL` | `https://footballday.ru` |

> ⚠️ **Значения — БЕЗ кавычек.** GitHub сохранит ровно то, что вставили:
> кавычка станет частью пароля, и дверь не откроется (`Permission denied`).
> IP → `194.87.15.42`, URL → `https://footballday.ru`, ключ → от
> `-----BEGIN…` до `-----END…` включительно. Подробнее — TUTORIAL.md, раздел 5.

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
==> Деплой SCORESBOX ghcr.io/artyom-front/studious-tribble:1.0.0
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
`{"ok":true,"db":"up",…}`. С компьютера: `curl -I https://footballday.ru` → `HTTP/2 200`.

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

`https://footballday.ru/admin` → вход (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) →
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
curl -I https://footballday.ru                                   # HTTP/2 200
curl -s https://footballday.ru/api/public/overview | head -c 200  # {"leagues":[…]}
curl -s https://footballday.ru/sitemap.xml | head -c 200         # <?xml… <urlset
curl -s https://footballday.ru/robots.txt                        # Disallow: /admin
```

| URL в браузере | Что увидеть |
|---|---|
| `https://footballday.ru` | livescore, турнирная таблица, замок 🔒 |
| `https://footballday.ru/admin` | форма входа → email + код 2FA |
| `https://footballday.ru/sitemap.xml` | карта сайта |

Дальше — укрепление из ANALYTICS.md (P0: offsite-бэкап, мониторинг) — 15 минут,
которые превращают «работает» в «не страшно потерять».

---

# 🔁 СМЕНА ДОМЕНА (например, footballday.ru → scoresbox.ru)

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
- [ ] Offsite-бэкапы и мониторинг → ANALYTICS.md, P0 (сделать в первую неделю)

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
git clone https://github.com/artyom-front/studious-tribble.git && cd studious-tribble
docker compose up -d db                       # PostgreSQL на 127.0.0.1:5432
cp .env.example .env                          # DATABASE_URL для локалки — внутри
bunx prisma db push && bun prisma/seed.ts     # таблицы + демо-данные
bun install && bun run dev                    # http://localhost:3000
```

Демо-аккаунты (только дев): `admin@ff21.ru`, `liga@ff21.ru`, `sudya@ff21.ru`,
`club@ff21.ru` — пароли в `prisma/seed.ts`.

Карта кода: `src/lib/engine/*` — бизнес-движки · `src/app/api/**` — REST ·
`src/app/(site)/**` — SSR-страницы · `prisma/schema.prisma` — модель данных.
Глубокий разбор — **ANALYTICS.md**.

