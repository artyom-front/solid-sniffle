# ГАЙД: обновить репозиторий solid-sniffle и получить зелёный деплой

> Читайте сверху вниз, по одному шагу, с проверкой после каждого шага.
> Весь путь — примерно 10 минут. Каждый шаг говорит, что вы должны увидеть.

---

## Что уже починено, что осталось (коротко)

**Docker-сборка — зелёная.** Ошибка exit 127 (addgroup/adduser) побеждена:
прогон v1.0.8 прошёл все стадии сборки и упал только на отправке образа.

**Осталось одно — права на GHCR.** Ошибка
`denied: installation not allowed to Create organization package`
означает: джоба входит в реестр под служебным токеном `GITHUB_TOKEN`,
но у токета по умолчанию нет права СОЗДАВАТЬ пакеты (`packages: write`).
В workflow не хватало блока `permissions:` — в бандле из ЭТОГО чата он добавлен.

**Имя файла теперь содержит дату** — `2026-09-07`. Если в скачанном файле
нет этой даты — он старый. Дата также стоит ПЕРВОЙ в сообщении коммита
внутри бандла — её вы увидите при проверке в ШАГе 3.

---

## ШАГ 1. Скачайте файл по прямой ссылке

Откройте в браузере (можно кликнуть прямо из чата):

**<https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-07-ghcr.git-bundle>**

Это файл **`scoresbox-2026-09-07-ghcr.git-bundle`** (примерно 0,5 МБ)
с превью-сервера ЭТОГО чата.

- Панель «All files in task» показывает вложения старых сообщений и не
  обновляется — если там старые файлы, качайте по ссылке выше.
- Если ссылка отдаёт 404 — напишите в чат: я пересоберу и дам новую.
- Дата `2026-09-07` в имени файла — признак актуальности. Бандл с датой
  `2026-09-04` фиксировал только Docker; прав для GHCR в нём ЕЩЁ нет.
- Файл попадёт в «Загрузки» (`C:\Users\<имя>\Downloads`).
- Если при повторном скачивании файл сохранился как
  `scoresbox-2026-09-07-ghcr (1).git-bundle` — удалите старый или
  подставьте новое имя в команду ШАГа 3.

## ШАГ 2. Откройте PowerShell в папке клона

```powershell
cd D:\project\scoresbox_bundle
```

(папка клона у вас уже есть — вы делали из неё push; путь другой — подставьте свой)

## ШАГ 3. Три команды + одна проверка

Команда 1 — забрать содержимое бандла:

```powershell
git fetch "$HOME\Downloads\scoresbox-2026-09-07-ghcr.git-bundle" main
```

**Проверка, что скачан именно НОВЫЙ файл** (главная защита от повтора истории):

```powershell
git log --oneline -1 FETCH_HEAD
```

- ДОЛЖНО показать: `SCORESBOX 2026-09-07: GITHUB_TOKEN получает packages:write ...`
  (дата в начале сообщения — «отпечаток» актуальной версии).
- Если показывает дату 2026-09-04 или v1.0.4 — это старый файл:
  вернитесь к ШАГУ 1 и скачайте заново из текущего чата.

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

## ШАГ 4. Проверьте на GitHub, что фикс долетел (2 ссылки)

1. <https://github.com/artyom-front/solid-sniffle/blob/main/.github/workflows/cd.yml> —
   в джобе «Build & push (GHCR)» должен быть блок:
   ```yaml
   permissions:
     contents: read
     packages: write
   ```
2. <https://github.com/artyom-front/solid-sniffle/commits/main> — сверху
   коммит со словами «SCORESBOX 2026-09-07».

## ШАГ 5. Дождитесь зелёного CI — он соберёт Docker ещё ДО тега

Обычный push в main запускает workflow **CI**:
quality (lint + tsc + unit) → integration (PostgreSQL + сборка) →
**Docker build** (сборка образа, без публикации).

Job «Docker build» зелёный = ошибка 127 побеждена, ещё до всякого тега.
Смотреть: <https://github.com/artyom-front/solid-sniffle/actions>
(5–10 минут, обновляйте страницу).

## ШАГ 6. Секреты и сервер (если ещё не сделано)

Деплой запускается ТОЛЬКО тегом. Чтобы он прошёл, нужны (один раз):

- 4 секрета: Settings → Secrets and variables → Actions → New repository secret:
  `DEPLOY_HOST` (IP сервера), `DEPLOY_USER` (root),
  `DEPLOY_SSH_KEY` (приватный ключ целиком), `DEPLOY_PUBLIC_URL` (https://домен).
  Значения БЕЗ кавычек. Как сделать ключ — DEPLOY.md, раздел Б8.
- сервер по DEPLOY.md, шаги Б1–Б4.

Без них job «Deploy → VPS» будет красным — это НЕ сбой сборки.

## ШАГ 7. Тег v1.0.9

```powershell
git tag v1.0.9
git push origin v1.0.9
```

(v1.0.6–v1.0.8 указывают на старые коммиты — номера не переиспользовать.)

В Actions появится прогон «CD / v1.0.9»:
Build & push (GHCR) → Deploy → VPS → внешний health-check.
Зелёный прогон = образ опубликован на `ghcr.io/artyom-front/solid-sniffle`
и сайт обновлён на сервере.

---

## Если что-то пошло не так

| Что видите | Что делать |
|---|---|
| `git log` показывает дату не 2026-09-07 | скачан старый бандл — ШАГ 1, качать по ссылке из гайда |
| push: «Everything up-to-date» | то же самое — файл старый |
| Опять `denied: installation not allowed to Create organization package` | блок permissions не долетел — пройдите ШАГ 4 (ссылка 1) |
| `Resource not accessible by integration` | то же самое — permissions не долетели, ШАГ 4 |
| CI опять падает с exit 127 на addgroup | невероятно — Docker-фикс уже в main; проверьте ШАГ 4 |
| `Repository lacks these prerequisite commits` | взят не тот бандл; нужен именно файл с датой в имени |
| Build зелёный, Deploy красный | секреты/сервер — ШАГ 6; к сборке отношения не имеет |
| push просит пароль / Authenticate failed | нужен Personal Access Token — напишите в чат, покажу за 2 минуты |
| Нужно понять, на каком шаге упала сборка | скачайте `.dockerbuild` из summary прогона → Docker Desktop → Builds → Import — увидите дерево шагов |
