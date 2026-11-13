/** Публичная конфигурация сайта для UI: какие демо-фичи включены +
 *  брендинг (v1.0.48: логотипы/фавикон из админки — для клиентских
 *  компонентов /admin; v1.0.53: + ogImageUrl и лого — для SEO-
 *  компонентов). SHOW_DEMO_ACCOUNTS=0 скрывает демо-входы на проде
 *  (см. DEPLOY.md). Публичный сайт брендинг получает из SSR
 *  (layout), сюда ходит только админка — поэтому без кэша. */
import { getBranding } from "@/lib/services/branding";

export const dynamic = "force-dynamic";

export async function GET() {
  const branding = await getBranding();
  return Response.json({
    demoAccounts: process.env.SHOW_DEMO_ACCOUNTS !== "0",
    branding,
  });
}
