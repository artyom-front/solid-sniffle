import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

const SITE_URL = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** Карта сайта: главная + лиги (вкладки) + матчи + команды + персоны + стадионы.
 *  ISR-страницы отдают свежий HTML, sitemap обновляется раз в час. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [leagues, matches, teams, persons, stadiums] = await Promise.all([
    db.league.findMany({ select: { id: true, createdAt: true } }),
    db.match.findMany({ select: { id: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 2000 }),
    db.team.findMany({ select: { id: true } }),
    db.person.findMany({ select: { id: true, updatedAt: true }, take: 2000 }),
    db.stadium.findMany({ select: { id: true } }),
  ]);

  const now = new Date();

  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    ...leagues.map((l) => ({
      url: `${SITE_URL}/league/${l.id}`,
      lastModified: l.createdAt,
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
    ...leagues.flatMap((l) => [
      { url: `${SITE_URL}/league/${l.id}/table`, lastModified: l.createdAt, changeFrequency: "daily" as const, priority: 0.8 },
      { url: `${SITE_URL}/league/${l.id}/scorers`, lastModified: l.createdAt, changeFrequency: "weekly" as const, priority: 0.6 },
    ]),
    ...matches.map((m) => ({
      url: `${SITE_URL}/match/${m.id}`,
      lastModified: m.updatedAt,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    ...teams.map((t) => ({
      url: `${SITE_URL}/team/${t.id}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...persons.map((p) => ({
      url: `${SITE_URL}/player/${p.id}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...stadiums.map((s) => ({
      url: `${SITE_URL}/stadium/${s.id}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ];
}
