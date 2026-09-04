import type { Metadata } from "next";
import MatchDayView from "@/components/portal/MatchDayView";
import { getOverview, getMatchesDay } from "@/lib/services/public";

// Главная — livescore: SSR ленты «сегодня» (SEO + мгновенная гидратация),
// фильтры даты/статуса и LIVE-обновления — на клиенте.
export const dynamic = "force-dynamic";

const FORMAT_IDS = ["F11", "F8", "F6", "FUTSAL"];

const FORMAT_TITLES: Record<string, string> = {
  F11: "футбол 11×11",
  F8: "футбол 8×8",
  F6: "футбол 6×6",
  FUTSAL: "мини-футбол (футзал)",
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ format?: string }>;
}): Promise<Metadata> {
  const { format } = await searchParams;
  const valid = format && FORMAT_IDS.includes(format) ? format : null;
  const title = valid
    ? `Матчи сегодня — ${FORMAT_TITLES[valid]}`
    : "Футбол Чувашии — результаты матчей сегодня, live-счёт и таблицы";
  return {
    title,
    description: valid
      ? `Livescore ${FORMAT_TITLES[valid]} в Чувашии: сегодняшние матчи, live-счёт, турнирные таблицы, бомбардиры и календарь на SCORESBOX.`
      : "Все матчи Чувашии сегодня: live-счёт, серии команд, дисквалификации, турнирные таблицы по футболу 11×11, 8×8, 6×6 и мини-футболу.",
    alternates: { canonical: valid ? `/?format=${valid}` : "/" },
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string }>;
}) {
  const { format } = await searchParams;
  const validFormat = format && FORMAT_IDS.includes(format) ? format : "all";

  // SSR: лента «сегодня» в выбранном формате — в HTML сразу (SEO и скорость)
  const [day, overview] = await Promise.all([
    getMatchesDay("today", validFormat),
    getOverview(),
  ]);

  return (
    <MatchDayView
      key={validFormat}
      format={validFormat}
      overview={overview}
      version={0}
      initialDay={day}
    />
  );
}
