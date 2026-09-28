import type { Metadata } from "next";
import MatchDayView from "@/components/portal/MatchDayView";
import { getOverview, getMatchesDay, getFormatLinks } from "@/lib/services/public";

// Главная — livescore: SSR ленты «сегодня» (SEO + мгновенная гидратация),
// фильтры даты/статуса и LIVE-обновления — на клиенте.
// Виды футбола (?format=) валидируются по списку из админки (FormatLink) —
// админ включает/выключает/добавляет форматы, страница подхватывает.
export const dynamic = "force-dynamic";

/** SEO-описания базовых форматов; кастомным из админки — их подпись */
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
  const { formats } = await getFormatLinks();
  const link = format ? formats.find((f) => f.code === format) : null;
  const title = link ? `Матчи сегодня — ${FORMAT_TITLES[link.code] ?? link.label}` : "Футбол Чувашии — результаты матчей сегодня, live-счёт и таблицы";
  return {
    title,
    description: link
      ? `Livescore ${FORMAT_TITLES[link.code] ?? link.label} в Чувашии: сегодняшние матчи, live-счёт, турнирные таблицы, бомбардиры и календарь на SCORESBOX.`
      : "Все матчи Чувашии сегодня: live-счёт, серии команд, дисквалификации, турнирные таблицы по футболу 11×11, 8×8, 6×6 и мини-футболу.",
    alternates: { canonical: link ? `/?format=${link.code}` : "/" },
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string }>;
}) {
  const { format } = await searchParams;

  // валидный формат = код из списка видов футбола (админка); иначе — все
  const { formats } = await getFormatLinks();
  const validFormat = format && formats.some((f) => f.code === format) ? format : "all";

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
