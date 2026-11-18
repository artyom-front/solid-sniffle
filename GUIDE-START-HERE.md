# ГАЙД: добить деплой solid-sniffle — фикс серверных файлов (composefix)

> Читайте сверху вниз, по одному шагу, с проверкой после каждого шага.
> Путь один: скачать бандл → 3 команды → тег v1.0.10. Вручную на сервер
> заходить НЕ нужно — workflow теперь сам приносит на сервер свежие файлы.

---

## Что уже починено, что осталось (коротко)

**Что зелёное по вашему последнему логу:**

- ✅ Docker-сборка (фикс `USER 1001:1001`, exit 127 больше нет).
- ✅ Пуш в GHCR (фикс `permissions: packages:write`, образ 1.0.9 в реестре).
- ✅ `chmod +x` на сервере сделан — скрипт запустился, `Login Succeeded`,
  бэкап БД сделалcя, PostgreSQL на сервере работает.

**Что нашлось в последнем прогоне (две причины):**

1. **На сервере `/opt/scoresbox` лежат УСТАРЕВШИЕ файлы.** Лог выдал баннер
   `==> Деплой SCORES21` — это старый deploy.sh (эпоха scores21). Он же тянет
   `alpine` из Docker Hub и ловит `429 Too Many Requests`. Актуальные скрипты
   обновлялись только в репозитории — на сервер они не попадали никогда.
2. **Ошибка пути в compose-файле:** `env file /opt/scoresbox/deploy/.env not
   found`. Docker Compose ищет `env_file` относительно каталога compose-файла
   (`deploy/`), а не корня проекта. Нужно `../.env` → тогда он найдёт ваш
   `/opt/scoresbox/.env`.

**Что сделано в бандле `composefix`:**

- `deploy/docker-compose.prod.yml`: `env_file: .env` → **`env_file: ../.env`**.
- `cd.yml`: перед деплоем новая джоба-степ **«Синхронизация файлов деплоя на
  сервер»** (scp-action) — при каждом деплое на сервер прилетают актуальные
  `scripts/deploy.sh`, `scripts/rollback.sh`, `deploy/docker-compose.prod.yml`
  из того же коммита. Проблема «на сервере старые файлы» исчезает навсегда.
- Всё прежнее на месте: `bash`-вызов (exit 126), `packages:write` (GHCR),
  `USER 1001:1001` (Docker), actions v7/v4.

---

## ШАГ 1. Скачайте бандл composefix по прямой ссылке

Откройте в браузере (можно кликнуть прямо из чата):

**<https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-07-composefix.git-bundle>**

Это файл **`scoresbox-2026-09-07-composefix.git-bundle`** (примерно 0,5 МБ)
с превью-сервера ЭТОГО чата.

- Панель «All files in task» показывает вложения старых сообщений и не
  обновляется — если там старые файлы, качайте по ссылке выше.
- Если ссылка отдаёт 404 — напишите в чат: я пересоберу и дам новую.
- Признак актуальности — `2026-09-07-composefix` в имени файла. Бандлы с
  `execfix`, `ghcr`, `2026-09-04` — предыдущие версии: в них НЕТ фикса
  `env_file` и автосинка.
- Если при повторном скачивании файл сохранился как
  `scoresbox-2026-09-07-composefix (1).git-bundle` — удалите старый или
  подставьте новое имя в команду ШАГа 2.

## ШАГ 2. Откройте PowerShell в папке клона и примените

```powershell
cd D:\project\scoresbox_bundle
```

Команда 1 — забрать содержимое бандла:

```powershell
git fetch "$HOME\Downloads\scoresbox-2026-09-07-composefix.git-bundle" main
```

**Проверка, что скачан именно НОВЫЙ файл** (главная защита от повтора истории):

```powershell
git log --oneline -1 FETCH_HEAD
```

- ДОЛЖНО показать: `SCORESBOX 2026-09-07 composefix: env_file ../.env ...`
- Если показывает `execfix`, `ghcr`, `2026-09-04` или `v1.0.4` — это старый
  файл: вернитесь к ШАГУ 1.

Команда 2 — заменить локальную версию на новую:

```powershell
git reset --hard FETCH_HEAD
```

Команда 3 — отправить на GitHub:

```powershell
git push --force origin main
```

- Ожидаемо: `+ <хэш>...<хэш> main -> main (forced update)`.
- Если «Everything up-to-date» — файл опять старый: вернитесь к ШАГУ 1.

## ШАГ 3. Проверьте на GitHub, что фикс долетел (2 ссылки)

1. <https://github.com/artyom-front/solid-sniffle/blob/main/deploy/docker-compose.prod.yml> —
   у сервиса `app` должно быть:
   ```yaml
   env_file: ../.env
   ```
2. <https://github.com/artyom-front/solid-sniffle/blob/main/.github/workflows/cd.yml> —
   в джобе «Deploy → VPS» перед SSH-шагом должен быть степ
   «Синхронизация файлов деплоя на сервер» (`appleboy/scp-action`).

## ШАГ 4. (Опционально, 1 минута) Проверьте .env на сервере

Новый deploy.sh требует в `/opt/scoresbox/.env` минимум `POSTGRES_PASSWORD`,
а для полноценного входа в админку — `AUTH_SECRET`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`. Проверка (значения НЕ показывать в чате):

```bash
ssh root@<IP-сервера>
cd /opt/scoresbox
grep -c '^POSTGRES_PASSWORD=' .env   # 1 = есть
grep -c '^AUTH_SECRET=' .env         # 1 = есть
exit
```

(у вас .env почти наверняка готов — старый скрипт уже поднимал с ним БД;
строка `POSTGRES_PASSWORD` обязательна, без неё деплой упадёт с понятной
ошибкой `POSTGRES_PASSWORD должен быть задан в .env`).

## ШАГ 5. Тег v1.0.10

```powershell
git tag v1.0.10
git push origin v1.0.10
```

(v1.0.6–v1.0.9 уже заняты — номера не переиспользовать.)

## ШАГ 6. Наблюдайте за прогоном — что вы должны увидеть

Смотреть: <https://github.com/artyom-front/solid-sniffle/actions> (5–10 минут).

1. **Build & push (GHCR)** — зелёный (кэш ускорит сборку).
2. **Deploy → VPS → «Синхронизация файлов деплоя на сервер»** — зелёный:
   в логе список из трёх файлов (deploy.sh, rollback.sh, compose).
3. **Deploy → VPS → «Деплой через SSH»** — зелёный, в логе по порядку:
   - `Login Succeeded` (логин в GHCR);
   - `==> Деплой SCORESBOX ghcr.io/artyom-front/solid-sniffle:1.0.10` —
     **именно SCORESBOX, без «SCORES21»** = работает свежий скрипт;
   - `==> Миграции (prisma db push)` — проходит БЕЗ «env file not found»;
   - `==> docker compose up -d`, health-check, `прод здоров ✓`;
   - `==> Деплой 1.0.10 завершён успешно`.
4. **Пост-деплой: внешний health-check** — зелёный, если настроен домен
   (секрет `DEPLOY_PUBLIC_URL` + nginx). Если красный, а Deploy зелёный —
   сайт уже работает: на сервере `curl http://127.0.0.1:3000/api/health`
   должно вернуть `{"ok":true}`; домен настраивается по DEPLOY.md (nginx).

Зелёный прогон v1.0.10 = сайт обновлён на сервере. Деплой полностью
автоматический, включая синхронизацию серверных файлов.

---

## Если что-то пошло не так

| Что видите | Что делать |
|---|---|
| `git log` показывает сообщение без слова `composefix` | скачан старый бандл — ШАГ 1, качать по ссылке из гайда |
| push: «Everything up-to-date» | то же самое — файл старый |
| Опять `env file ... deploy/.env not found` | на сервер не долетел compose — проверьте ШАГ 3 (ссылка 2), наличие степа «Синхронизация» |
| Степ «Синхронизация файлов деплоя» красный | пришлите его лог в чат — обычно это сети/секреты, разберу |
| Опять `429 Too Many Requests` про alpine | не должен повториться (новый скрипт не тянет alpine); если повторился — значит работает старый файл, проверьте ШАГ 3 |
| Баннер `Деплой SCORES21` | на сервере старый скрипт — синк не отработал, ШАГ 3 |
| `POSTGRES_PASSWORD должен быть задан в .env` | ШАГ 4 — создать/пополнить `/opt/scoresbox/.env` |
| `Permission denied` (126) при `./scripts/...` | не должен повториться (вызов через `bash`); если вручную запускаете — `chmod +x scripts/*.sh` |
| Deploy зелёный, внешний health-check красный | домен/nginx не настроены — DEPLOY.md; сам сайт работает (`curl 127.0.0.1:3000/api/health`) |
| Rollback красный: «История деплоев пуста» | не страшно на первом успешном деплое — откатывать нечего |
| `Repository lacks these prerequisite commits` | взят не тот бандл; нужен файл с `2026-09-07-composefix` в имени |
| push просит пароль / Authenticate failed | нужен Personal Access Token — напишите в чат, покажу за 2 минуты |
