// ============================================================
// SEO: JSON-LD (schema.org) + канонические URL для SSR-страниц.
// SITE_URL из env (сейчас — https://footballday.ru; смена домена = .env).
// ============================================================

export const SITE_URL = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
/** Хлебные крошки schema.org */
export function breadcrumbJsonLd(items: { name: string; url?: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      ...(it.url ? { item: `${SITE_URL}${it.url}` } : {}),
    })),
  };
}

/** Матч: SportsEvent с командами, стадионом и статусом */
export function matchJsonLd(m: {
  id: string; kickoff: string; status: string;
  homeTeam: { name: string }; awayTeam: { name: string };
  homeScore: number | null; awayScore: number | null;
  stadium: { name: string; city: string | null } | null;
  league: { name: string };
  round: number | null;
}) {
  const score =
    m.status === "COMPLETED" && m.homeScore != null && m.awayScore != null
      ? `${m.homeScore}:${m.awayScore}`
      : null;
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${m.homeTeam.name} — ${m.awayTeam.name} · ${m.league.name}`,
    url: `${SITE_URL}/match/${m.id}`,
    startDate: m.kickoff,
    eventStatus:
      m.status === "POSTPONED"
        ? "https://schema.org/EventPostponed"
        : m.status === "WALKOVER"
          ? "https://schema.org/EventScheduled"
          : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    competitor: [
      { "@type": "SportsTeam", name: m.homeTeam.name },
      { "@type": "SportsTeam", name: m.awayTeam.name },
    ],
    ...(m.stadium
      ? {
          location: {
            "@type": "Place",
            name: m.stadium.name,
            address: m.stadium.city ?? undefined,
          },
        }
      : {}),
    ...(score ? { result: { "@type": "SportsResult", name: score } } : {}),
    superEvent: { "@type": "SportsEvent", name: m.league.name },
  };
}

/** Команда: SportsTeam */
export function teamJsonLd(t: {
  id: string; name: string; city: string | null;
  club: { id: string; name: string; description: string | null } | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: t.name,
    url: `${SITE_URL}/team/${t.id}`,
    sport: "Football",
    ...(t.city ? { location: { "@type": "Place", address: t.city } } : {}),
    ...(t.club
      ? {
          parentOrganization: {
            "@type": "SportsTeam",
            name: t.club.name,
            url: `${SITE_URL}/team/${t.id}`,
            ...(t.club.description ? { description: t.club.description } : {}),
          },
        }
      : {}),
  };
}

/** Персона (игрок/судья/тренер): Person */
export function personJsonLd(p: {
  id: string; name: string; birthDate: string | null; position: string | null; isReferee: boolean;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: p.name,
    url: `${SITE_URL}/player/${p.id}`,
    ...(p.birthDate ? { birthDate: p.birthDate.slice(0, 10) } : {}),
    jobTitle: p.isReferee ? "Судья по футболу" : p.position === "GK" ? "Футболист, вратарь" : "Футболист",
  };
}

/** Стадион: Place (+ спортивная арена) */
export function stadiumJsonLd(s: {
  id: string; name: string; city: string | null; address: string | null; capacity: number | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "StadiumOrArena",
    name: s.name,
    url: `${SITE_URL}/stadium/${s.id}`,
    ...(s.city || s.address ? { address: [s.city, s.address].filter(Boolean).join(", ") } : {}),
    ...(s.capacity ? { maximumAttendeeCapacity: s.capacity } : {}),
  };
}

/** <script type="application/ld+json"> — рендерится на сервере в исходный HTML */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

// ============================================================
// Заголовки generateMetadata
// ============================================================

const MSK = "Europe/Moscow";

export function mskDateTitle(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric", month: "long", year: "numeric", timeZone: MSK,
  });
}

export function mskTimeTitle(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit", minute: "2-digit", timeZone: MSK,
  });
}
