-- AlterTable
ALTER TABLE "User" ADD COLUMN     "leagueId" TEXT;

-- CreateIndex
CREATE INDEX "User_leagueId_idx" ON "User"("leagueId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;
