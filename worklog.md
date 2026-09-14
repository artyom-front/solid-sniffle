# WORKLOG — SCORESBOX (единый журнал агентов)

> Пересоздан 08.09.2026: песочница сброшена платформой за ночь (07→08.09),
> прежний worklog был в .gitignore и не пережил сброс. С этого дня файл
> в git (правка .gitignore) и переживает сбросы. Краткая история утраченных
> Tasks 11–14 сохранена по контексту разговора.

## Краткая история (Tasks 1–14, восстановлено)

- Tasks 1–10 (до 07.09, утеряны): перенос проекта в solid-sniffle, Docker-фикс
  exit 127 (USER 1001:1001), бандлы поставки, public/download в git.
- Task 11 (07.09): 404 на /download/** — сброс песочницы стёр gitignored-файлы;
  фикс — поставка в public/download/ (в git).
- Task 12 (07.09): GHCR «denied: installation not allowed to Create
  organization package» — фикс permissions: packages:write в cd.yml;
  бандл 2026-09-07-ghcr.
- Task 13 (07.09): exit 126 «Permission denied» на ./scripts/deploy.sh —
  фикс: вызовы через bash; бандл 2026-09-07-execfix.
- Task 14 (07.09): «env file deploy/.env not found» + на VPS старые файлы
  эпохи scores21 — фикс: env_file ../.env + автосинк scripts/compose на
  сервер (scp-action в deploy-джобе); бандл 2026-09-07-composefix.
- (между 14 и 15, в обрезанном контексте): deploy упал на «Cannot find
  package 'effect'» при prisma db push — юзер сам применил фикс на GitHub
  (Dockerfile: COPY node_modules целиком + .next/static) и релизом v1.0.12.
  **Результат: деплой полностью зелёный, сайт работает.**

---
Task ID: 15
Agent: Super Z (main)
Task: Сайт в проде (v1.0.12). Просьбы юзера: что дальше; смена домена
scoresbox.ru; чистка .md без дублей; лучшие практики мониторинга/логов.

Work Log:
- Синхронизировал Dockerfile с рабочей версией v1.0.12 юзера (node_modules
  целиком — фикс effect; .next/static; USER 1001:1001).
- Чистка доков (scripts/doc-cleanup.py): DEPLOY.md переписан — новый
  заголовок + РАЗДЕЛ I «Быстрые задачи» (I.1 релиз, I.2 смена домена,
  I.3 мониторинг, I.4 логи, I.5 откат, I.6 бэкапы, I.7 бандл из чата)
  вместо устаревшего ПУТЯ А; ПУТЬ Б → РАЗДЕЛ II «С нуля», footballday.ru →
  scoresbox.ru. README.md (корень) создан. Удалены: TUTORIAL, ANALYTICS,
  RECOVERY, SETTINGS, GUIDE-START-HERE + все public/*.md (прод их раздавал).
- Мониторинг: ротация логов в compose (json-file 10m×3, оба сервиса);
  scripts/status.sh (экспресс-диагностика) + добавлен в scp-автосинк cd.yml.
- Безопасность: .dockerignore + public/download — прод-образ больше НЕ
  раздаёт исходники по /download/... (текущий v1.0.12 раздаёт — исправится
  релизом v1.0.13).
- .env.example: footballday.ru → scoresbox.ru. .gitignore: worklog.md в git.
- Ошибки процесса (обе пойманы и исправлены): (1) make-archives.aborted на
  cp download/README.md после сброса (chicken-egg) — README теперь
  генерируется до копирования; (2) бандл был собран ДО коммита чистки —
  пересобран из c5cfeb1, устаревшая копия перезаписана.
- Верификация бандла: см. ниже. Коммиты: c5cfeb1 (cleanup) + delivery.

Stage Summary:
- Бандл: scoresbox-2026-09-08-cleanup.git-bundle — применить + тег v1.0.13.
- Домен scoresbox.ru: DNS A → IP; .env SITE_URL; setup-nginx.sh; certbot;
  секрет DEPLOY_PUBLIC_URL (полная таблица — DEPLOY.md §I.2).
- Мониторинг: 4 уровня (restart+healthcheck / health-check в CD / внешний
  пинг UptimeRobot / status.sh) — DEPLOY.md §I.3.

---
Task ID: 16
Agent: Super Z (main)
Task: Пользователь обновил прод и заполняет данные; 8 новых задач:
массовое добавление, персоны-роли-фото, протокол-файл, товарищеские
матчи, обновление списков без F5/идемпотентность, UX цепочки
чемпионат→сезон, доступы+TOTP-сброс, плюс вопросы (что такое «клуб»,
когда появляется протокол) и просьба о превентивных рекомендациях.

Work Log:
- Исследование: схема, hooks (причина «нет обновления без F5» — version
  не пробрасывался в useFetch CRUD-панелей), ProtocolEditor, публичные
  сервисы. Параллельный Explore-агент дал полную карту админки.
- Схема: Person +roles[]/gender/photoUrl; CustomRole; Media (bytea);
  Match +isFriendly, stageId→nullable, +protocolUrl/protocolFileName;
  User +isActive. prisma generate ok.
- lib/roles.ts: 18 системных ролей (игрок/тренера/судейский корпус/
  медицина/руководство) + кастомные «c:<id>»; isReferee синхронизируется.
- API: /api/admin/import (CSV, dry-run через rollback-транзакцию,
  идемпотентность по ФИО+ДР/названиям); /api/admin/media (sharp → WebP
  1200px, до 6/10 МБ) + /api/media/[id] (immutable-кэш, отдельное
  правило CSP-заголовков); persons (роли/антидубли 409+duplicates);
  customroles; users (SUPER_ADMIN: создать/сброс пароля/блокировка/
  сброс 2FA); matches (isFriendly, GET ?seasonId=friendly, action
  protocol); login (isActive=403); stadiums/clubs/teams (фото+дубли).
- Движки: lifecycle/discipline — товарищеские без дисциплины и проверок
  заявки; getEligiblePlayers для friendly — активные заявки любого
  сезона; номера в составе из заявки (не i+1).
- UI: MediaUpload (drag&drop), ImportPanel (5 сущностей, шаблоны,
  отчёт по строкам), UsersPanel; PeoplePanel переписан (роли-чипы,
  кастомные роли, фото, антидубли с «создать всё равно»); Tournaments
  (визард 4 шага, ссылки на заявки/расписание, авто-раскрытие);
  MatchesCrud (вкладка «Товарищеские»); ProtocolEditor (вкладка «Файл
  протокола» + подсказка «3 шага»); Registrations (роль в заявке);
  AdminShell (version всем панелям, разделы «Импорт» и «Пользователи»).
- Публичный сайт: icon.svg (BOX-квадрат по бренду); футер очищен;
  MatchDayView — только Live/Завершённые (взаимоисключающие,
  Завершённые=сегодня) и даты ‹/Сегодня/› ±10 дней; баннеры с
  картинкой, TOP выровнен с центральной колонкой (фикс ширины),
  пустые слоты не рендерятся; Crest/Avatar с logoUrl/photoUrl; фото на
  страницах команды/игрока/стадиона; товарищеские в ленте дня и
  бейдж/ссылка протокола на странице матча; guards null-stage во всех
  сервисах.
- Верификация: tsc чисто, eslint 0 ошибок, 54/54 unit, next build —
  зелёный (/icon.svg в статике).

Stage Summary:
- Бандл: scoresbox-2026-09-08-admin2.git-bundle → тег v1.0.14.
- prisma db push пройдёт деплоем автоматически (изменения аддитивные).
- Ответы пользователю: «клуб» = бренд/юрлицо (команд может быть
  несколько); протокол появляется в списке для всех матчей сезона;
  генератор календаря уже был в разделе «Расписание».
- Рекомендации выданы в ответе (архив протоколов → OCR-парсинг,
  массовые фото zip, печать бланка протокола, soft-delete и др.).

---
Task ID: 17
Agent: Super Z (main)
Task: Домен сменён (ок). Три задачи: (1) отдельный playbook-файл деплоя
для другого проекта со всеми пройденными граблями; (2) скачиваемые
CSV-шаблоны к массовому импорту с пояснением колонок/обязательности;
(3) жёсткое разделение «судья ≠ игрок» (персона не может быть одновременно
судьёй и игроком; в одном чемпионате+сезоне запрет, в разных лигах — можно)
и раздельная статистика игрока/судьи/тренера — «проверить по всем моментам
в коде».

Work Log:
- DEPLOY-PLAYBOOK.md (корень, ~600 строк): архитектура поставки, секреты,
  Dockerfile/compose/deploy.sh/rollback.sh/cd.yml готовыми к копированию,
  VPS/nginx/certbot, мониторинг 4 уровней, ТАБЛИЦА 14 ГРАБЛЕЙ
  (симптом→причина→фикс: exit 126, env_file, устаревшие файлы на VPS,
  effect, GHCR packages:write, public/download, exit 127 adduser, логи,
  health, 0.0.0.0, concurrency, SITE_URL, accept-data-loss, docker login),
  чек-лист и «сайт упал — порядок действий». Копия в public/download/
  для скачивания без git. make-archives.sh: копирует в download/.
- Инвариант «судья ≠ игрок», ДВА уровня:
  • lib/roles.ts (чистый, без БД): REFEREE_CONFLICT_CODES (officials:
    REFEREE/ASSISTANT_REFEREE/FOURTH_OFFICIAL/VAR/AVAR/INSPECTOR),
    cardRoleConflict, assertNoCardRoleConflict (422, единый текст
    CARD_ROLE_CONFLICT_HINT), roleName.
  • lib/engine/conflicts.ts (БД): assertPlayerRegistrationAllowed
    (заявка игрока ↔ судейство в этом же сезоне, 409) и
    assertRefereeAssignmentAllowed (назначение судьи ↔ активная заявка
    PLAYER сезона; + конфликт интересов: ЛЮБАЯ заявка в командах-участницах
    — не судит свою команду даже как тренер; товарищеские без сезона
    не проверяются).
  • Точки подключения: persons POST/PATCH (карточка), registrations POST
    (role=PLAYER), matches POST + PATCH + action referee (передаются
    seasonId и [home,away]); import: конфликт в строке/мердже ролей +
    сезонная проверка заявки; при импорте заявки роль PLAYER не пишется
    на карточку судьи (кросс-лиговый сценарий: судит B, играет A).
- Раздельная статистика: getPlayerProfile + блок coach (сезоны с ролью
  COACH: матчи/В-Н-П/мяки/очки за период заявки, totals, % побед);
  PlayerPage — секция «Тренерская карьера» отдельным блоком (рядом с
  судейской и игровой; бейджи ролей уже были). Схема БД не менялась.
- CSV-шаблоны: lib/importTemplates.ts — IMPORT_SPECS (5 сущностей:
  колонки required/format/example + exampleRows + summary) и
  buildTemplateCsv («;», CRLF); API GET /api/admin/import/template?type=
  (BOM, Content-Disposition attachment); ImportPanel: кнопка «Скачать
  шаблон CSV» (asChild+download), «Пример в поле», сводка под полем,
  диалог «Как подготовить файл» — таблица колонок + IMPORT_RULES
  (в т.ч. правило судья≠игрок, ФИО в трёх колонках, роли в одной ячейке).
- UI-поддержка: PeoplePanel — красный блок-предупреждение + disabled
  save при конфликте ролей, подсказка в блоке специализаций;
  RegistrationsPanel — «· судья» у персон в списке и предупреждение при
  заявке игрока-судьи.
- Верификация: tsc 0, eslint 0, юнит 67/67 (13 новых: конфликт-группы,
  шаблоны, «шаблоны не учат плохому»), next build зелёный (standalone OK).
  Интеграционные тесты затронутые эндпоинты не трогают.

Stage Summary:
- Бандл: scoresbox-2026-09-08-roles.git-bundle → тег v1.0.15 (миграций
  нет: prisma db push ничего не меняет — правки логические).
- DEPLOY-PLAYBOOK.md скачать напрямую: /download/DEPLOY-PLAYBOOK.md
  или из репо другого проекта (файл самодостаточен).
- Ответы пользователю: кросс-лиговый сценарий «играет A, судит B» =
  карточка судьи + заявка PLAYER в сезоне A (роль заявки ≠ роль карточки);
  статистика всегда по-role: игрок (события/составы), судья (назначенные
  матчи), тренер (заявки COACH).

---
Task ID: 17-d
Agent: Super Z (main)
Task: Пользователь заметил: в прошлом сообщении была ссылка только на
DEPLOY-PLAYBOOK.md, без ссылки на бандл. Доставить ссылку на бандл.

Work Log:
- git bundle verify: «records a complete history» — бандл самодостаточен.
- Проверка содержимого через git fetch <бандл> main (как в README юзера):
  HEAD = cb99c97 «SCORESBOX 2026-09-08 roles: …» (onefile-squash, cb99c97
  живёт только внутри бандла — в основном репо его нет, это норма).
- Файлы в бандле: DEPLOY-PLAYBOOK.md (600 строк), src/lib/roles.ts,
  src/lib/engine/conflicts.ts (assertPlayerRegistrationAllowed/
  assertRefereeAssignmentAllowed), src/lib/importTemplates.ts,
  src/app/api/admin/import/template/route.ts,
  src/components/portal/ImportPanel.tsx, prisma/schema.prisma — все на месте.
- public/download внутрь бандла не вложен (рекурсии нет).
- Ссылка выдана пользователю в ответе.

Stage Summary:
- Бандл актуален и проверен, отдельная ссылка доставлена:
  /download/scoresbox-2026-09-08-roles.git-bundle → тег v1.0.15 после push.

---
Task ID: 18
Agent: Super Z (main)
Task: Массовый импорт игроков падает: в поле/отчёте «кракозябры»
(U+FFFD вместо ФИО). Пользователь приложил файл — 7 колонок
(Фамилия;Имя;Отчество;ДатаРождения;Позиция;Номер;Роль), ~40 строк.

Work Log:
- Диагноз: файл сохранён Excel'ем в windows-1251 («CSV (разделители —
  точка с запятой)» — дефолт русской локали), а ImportPanel читал его
  f.text() = всегда UTF-8 без детекции → кириллица → U+FFFD.
  Структура файла у юзера была ПРАВИЛЬНАЯ (заголовки/алиасы/даты/роли
  парсер понимает) — проблема только в кодировке.
- Новый src/lib/csvEncoding.ts: decodeCsvBytes — BOM UTF-16LE/BE
  (Excel «Текст в Юникоде»), строгая валидация UTF-8 (без TextDecoder
  fatal — работает везде), windows-1251 и koi8-r по зашитым таблицам
  (сгенерированы scripts/gen-encoding-tables.py из кодеков Python —
  точность по стандарту; выбор cp1251/koi8 — частотный скоринг русского
  текста). Таблицы зашиты, т.к. TextDecoder("windows-1251") не
  гарантирован (Safari/JSC; bun тоже не поддерживает — проверено).
- ImportPanel.onFile → readFileTextSmart + тост «кириллица
  восстановлена (windows-1251…)» / предупреждение при unknown.
- Серверный предохранитель в import/route.ts: csv.includes("\uFFFD")
  → 422 с понятной подсказкой (Ctrl+C из Excel → Ctrl+V / CSV UTF-8).
  Грабля процесса: литерал U+FFFD через редактор превращается в U+0000
  (поймал проверкой кодпоинтов) — в коде только escape "\uFFFD".
- IMPORT_RULES: новое правило про кодировки в диалоге «Как подготовить
  файл». Образцовый CSV юзера (5 строк, UTF-8+BOM+«;»+CRLF):
  public/download/players-example-utf8.csv (scripts/make-sample-import.py).
- Тесты tests/unit/csvEncoding.test.ts — 11 штук: utf-8/BOM/cp1251
  (реальные байты строки Артемьева)/koi8-r/UTF-16LE/BE/ASCII/мусор
  «unknown»/обрезанный UTF-8. Грабли тестов: TextDecoder сам срезает
  BOM; байт-массив koi8 перенесён с опечаткой (D2↔D4 — нашёл diff-ом
  по эталону Python).
- Верификация: eslint 0, tsc 0, unit 78/78 (+11), next build зелёный.

Stage Summary:
- Бандл: scoresbox-2026-09-09-encoding.git-bundle → тег v1.0.16
  (миграций нет — правки клиентские/логические).
- Юзеру выданы обходные пути без деплоя: (1) Ctrl+C из Excel → Ctrl+V
  в поле; (2) «Сохранить как → CSV UTF-8»; (3) PowerShell-перекодировка.
  + проверка/чистка мусорных персон, если первый запуск что-то записал.

---
Task ID: 19
Agent: Super Z (main)
Task: Пользователь не смог удалить команду (0 матчей, 5 заявок) и профиль
(0 событий, 1 заявка) — «не ясен алгоритм действий, админка непонятная».
Запрос: проваливание в команду (редактирование состава, массовое
добавление, фото) и в профиль игрока; превентивно применить мировые
практики UI/UX, безопасности и эффективности.

Work Log:
- Диагноз: заявки (Registration) можно было СОЗДАТЬ, но инструмента
  удалить/отредактировать не существовало вовсе (API /api/admin/
  registrations/[id] отсутствовал) — удаление команды с заявками было
  физически невозможно, «алгоритм» упирался в стену. Решение —
  entity-менеджмент уровня GitHub/Stripe: drill-down карточки,
  каскадное удаление с подтверждением, структурированные 409.
- http.ts: HttpError.extra — машиночитаемая нагрузка ошибок
  ({code, dependencies, cascadeAllowed}) рядом с error; errorResponse
  пробрасывает её в JSON.
- API команды: GET /api/admin/teams/[id] (карточка: поля+клуб, заявки
  по сезонам с персонами/фото/№/ролями/датами, последние 30 матчей,
  deleteBlockers+canDelete); DELETE с телом {cascade:true} — команда
  без матчей удаляется атомарно вместе с заявками (транзакция+аудит
  CASCADE); при матчах — 409 TEAM_HAS_MATCHES со счётчиками;
  PATCH — новый guard: CLUB_ADMIN только свой клуб.
- API персоны: GET /api/admin/persons/[id] (профиль, все заявки с
  командами/сезонами/лигами, статистика groupBy событий: голы/ЖК/КК,
  счётчики истории, deleteBlockers); DELETE {cascade:true} — без
  истории (события/составы/судейство/дискв.) удаляется с заявками и
  отвязкой учёток; с историей — 409 PERSON_HAS_HISTORY с подсказкой
  про Merge (не голый текст, а структура).
- API заявок: GET /api/admin/registrations?seasonId= (список с
  персонами и командами); НОВЫЙ [id]: PATCH (номер/роль/endDate/
  status — отзаявка и возврат) и DELETE (запрещён при выходах в
  составах сезона — 409 REGISTRATION_HAS_LINEUPS, подсказка
  «отзаявить»); POST усилена: проверка существования команды и
  персоны (понятная 404 вместо FK-500), scope CLUB_ADMIN по клубу
  без второго запроса.
- UI SmartDelete.tsx: кнопка удаления из списков — двухшаговое
  подтверждение, структурированный 409 разбирается и превращается в
  диалог с путём решения: «Удалить вместе с N заявками» (каскад,
  красная кнопка) или «Открыть карточку»; склонение числительных.
- UI TeamDetailPanel.tsx (новый, ~700 строк): шапка-профиль (эмблема
  через MediaUpload с моментальным PATCH, счётчики, «На сайт»,
  SmartDelete), вкладки Состав/Матчи/Основное; состав по сезонам
  (селектор: сезоны команды + текущие из обзора; фильтр
  отзаявленных; строки с фото/№/позицией/ролью/датами и действиями
  правка-№/отзаявить/вернуть/удалить); «Добавить игрока» — поиск
  существующих (подсветка судей с предупреждением) или создание
  нового (+антидубль 409 с «это другой человек»); «Массово из CSV» —
  вставка/файл с авто-кодировкой (readFileTextSmart), dry-run
  «Проверить», отчёт по строкам; Матчи — последние 30 с переходом в
  протокол; Основное — name/club/city с паттерном edits-поверх-данных
  (без setState-в-эффекте, eslint react-hooks чист).
- UI PersonDetailPanel.tsx (новый): шапка (фото, роли-чипы, «На
  сайт», SmartDelete), мини-статистика (голы/пасы/матчи/судейство/
  дискв./аккаунты), полный редактор профиля (ФИО/ДР/пол/позиция/
  специализации-чипы с конфликтом «судья≠игрок»), история заявок с
  действиями и переходом в команду.
- UI навигация: AdminShell — состояния focusTeamId/focusPersonId,
  рендер карточек поверх секций, хлебные крошки внутри панелей,
  сброс при смене раздела; ClubsTeamsPanel/PeoplePanel — клик по
  имени открывает карточку, карандаш = quick-edit (для команды — с
  подсказкой «полная карточка по клику»), SmartDelete только для
  LEAGUE_ADMIN+; RegistrationsPanel — новый блок «Составы сезона по
  командам» (клик по команде/игроку → карточки, действия
  отзаявить/вернуть/удалить).
- Верификация: eslint 0 (попутно устранены setState-в-эффекты),
  tsc 0, unit 78/78, next build зелёный; НОВЫЙ дымовой тест
  scripts/smoke-entities.ts — 24/24 на живом dev-сервере (вход,
  полное ЖВ: создание лиги/сезона/команды/персон/заявок, правка №,
  отзаявка/возврат, карточки, структурированные 409, каскадные
  удаления команды и персоны, чистка данных, 404 в удалённую
  команду). Грабли: конфликт top-level имён скриптов в tsconfig —
  символы smoke-скрипта переименованы (SBASE/sapi/scheck).

Stage Summary:
- Бандл: scoresbox-2026-09-14-entities.git-bundle → тег v1.0.17
  (миграций нет — изменения логические/клиентские).
- Сценарий юзера решён: команда «0 матчей, 5 заявок» — корзина →
  «Точно» → диалог «Удалить вместе с 5 заявками» → готово; профиль
  с 1 заявкой — аналогично каскадом; «непонятная админка» →
  клик по сущности открывает её полноценную карточку.
- Дальше (кандидаты): карта игрока на публичном сайте с фото из
  карточки; bulk-фото zip; soft-delete/архив для персон с историей.
