/** Публичная конфигурация сайта для UI: какие демо-фичи включены.
 *  SHOW_DEMO_ACCOUNTS=0 скрывает демо-входы на проде (см. DEPLOY.md). */
export async function GET() {
  return Response.json({
    demoAccounts: process.env.SHOW_DEMO_ACCOUNTS !== "0",
  });
}
