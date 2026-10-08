-- v1.0.34 · Судейский корпус: единая роль + капитан в протоколе
--
-- ЧАСТЬ 1 (DDL): LineupEntry.isCaptain — капитан команды в матче.
ALTER TABLE "LineupEntry" ADD COLUMN "isCaptain" BOOLEAN NOT NULL DEFAULT false;

-- ЧАСТЬ 2 (данные): нормализация Person.roles.
-- На карточке персоны судейский корпус теперь ОДНА роль — REFEREE
-- («представитель судейского корпуса»); узкие должности (помощник,
-- резервный, VAR, AVAR, инспектор, делегат) остаются ТОЛЬКО ролями
-- назначения в матче (MatchOfficial.role). Кейс владельца: созданный
-- «помощник судьи» не находился в списке «Главный судья», а
-- «Матренин-инспектор» был виден в списке, но отвергался API
-- («Указанный судья не найден») — фильтры и валидация были завязаны
-- на isReferee, который выставлялся только для кода REFEREE.
--
-- Узкие коды на карточках заменяются на REFEREE (дедупликация),
-- isReferee пересчитывается по принадлежности корпусу.
UPDATE "Person" p
SET "roles" = COALESCE(ARRAY(
    SELECT r FROM (
      SELECT r FROM unnest(p."roles") AS r
      WHERE r NOT IN ('ASSISTANT_REFEREE','FOURTH_OFFICIAL','VAR','AVAR','INSPECTOR','DELEGATE')
      UNION
      SELECT 'REFEREE'
      WHERE p."roles" && ARRAY['ASSISTANT_REFEREE','FOURTH_OFFICIAL','VAR','AVAR','INSPECTOR','DELEGATE']::text[]
    ) AS r
  ), ARRAY[]::text[])
WHERE p."roles" && ARRAY['ASSISTANT_REFEREE','FOURTH_OFFICIAL','VAR','AVAR','INSPECTOR','DELEGATE']::text[];

-- ЛЕГАСИ (сид/демо): isReferee=true, но roles ПУСТ — таким персонам
-- ДОБАВЛЯЕМ роль REFEREE (иначе синхронизация ниже погасила бы флаг
-- и судьи исчезли бы из всех списков).
UPDATE "Person" SET "roles" = "roles" || ARRAY['REFEREE']::text[]
WHERE "isReferee" AND NOT ('REFEREE' = ANY("roles"));

-- Синхронизация флага для ВСЕХ персон: после нормализации корпус = REFEREE.
UPDATE "Person" SET "isReferee" = ('REFEREE' = ANY("roles"));
