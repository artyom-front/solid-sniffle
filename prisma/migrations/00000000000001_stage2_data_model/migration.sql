-- Этап 2 рефакторинга (v1.0.23): модель данных.
-- 1) Заявки: история разрешена — уникальность только для АКТИВНЫХ (endDate IS NULL)
-- 2) Индексы горячих выборок (схема жила без единого индекса, кроме PK/UNIQUE)
-- 3) User.sessionVersion — мгновенная инвалидация сессий при сбросе пароля/2FA
-- Всё аддитивно и обратно совместимо: данные не удаляются, колонки добавляются.

-- DropIndex
-- Строчная уникальность (person+team+season) запрещала игроку ВЕРНУТЬСЯ в
-- команду в том же сезоне после трансфера: create -> P2002 -> голый 500.
DROP INDEX "Registration_personId_teamId_seasonId_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "LineupEntry_personId_idx" ON "LineupEntry"("personId");

-- CreateIndex
CREATE INDEX "Match_stageId_idx" ON "Match"("stageId");

-- CreateIndex
CREATE INDEX "Match_homeTeamId_idx" ON "Match"("homeTeamId");

-- CreateIndex
CREATE INDEX "Match_awayTeamId_idx" ON "Match"("awayTeamId");

-- CreateIndex
CREATE INDEX "Match_refereeId_idx" ON "Match"("refereeId");

-- CreateIndex
CREATE INDEX "Match_kickoff_idx" ON "Match"("kickoff");

-- CreateIndex
CREATE INDEX "MatchEvent_matchId_idx" ON "MatchEvent"("matchId");

-- CreateIndex
CREATE INDEX "MatchEvent_personId_idx" ON "MatchEvent"("personId");

-- CreateIndex
CREATE INDEX "MatchEvent_teamId_idx" ON "MatchEvent"("teamId");

-- CreateIndex
CREATE INDEX "MatchOfficial_personId_idx" ON "MatchOfficial"("personId");

-- CreateIndex
CREATE INDEX "RefereeRating_refereeId_idx" ON "RefereeRating"("refereeId");

-- CreateIndex
CREATE INDEX "Registration_personId_seasonId_idx" ON "Registration"("personId", "seasonId");

-- CreateIndex
CREATE INDEX "Registration_teamId_seasonId_idx" ON "Registration"("teamId", "seasonId");

-- CreateIndex
CREATE INDEX "Registration_seasonId_idx" ON "Registration"("seasonId");

-- CreateIndex
CREATE INDEX "Season_leagueId_idx" ON "Season"("leagueId");

-- CreateIndex
CREATE INDEX "Stage_seasonId_idx" ON "Stage"("seasonId");

-- CreateIndex
CREATE INDEX "Suspension_personId_seasonId_idx" ON "Suspension"("personId", "seasonId");

-- CreateIndex
CREATE INDEX "Suspension_seasonId_idx" ON "Suspension"("seasonId");

-- CreateIndex
CREATE INDEX "User_personId_idx" ON "User"("personId");

-- CreateIndex
CREATE INDEX "User_clubId_idx" ON "User"("clubId");

-- CreateIndex (ручной, поверх диффа)
-- Partial unique: не больше ОДНОЙ активной заявки (person+team+season).
-- История закрытых заявок не ограничивается — трансферы туда-обратно легальны.
-- DSL Prisma частичные индексы не выражает — потому живёт только здесь.
-- Гонка «две одновременные заявки» ловится именно этим индексом (P2002 -> 409).
CREATE UNIQUE INDEX "Registration_active_person_team_season_key"
ON "Registration"("personId", "teamId", "seasonId")
WHERE "endDate" IS NULL;

-- Data migration (ручной)
-- Гигиена статуса: админ-роут исторически закрывал заявку только endDate,
-- не трогая status. Приводим к инварианту: закрытая заявка = ENDED.
UPDATE "Registration" SET "status" = 'ENDED'
WHERE "endDate" IS NOT NULL AND "status" = 'ACTIVE';
