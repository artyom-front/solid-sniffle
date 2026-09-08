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
