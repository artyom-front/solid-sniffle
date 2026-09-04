"use client";

// Общие UI-примитивы SCORESBOX на семантических токенах (bg-s1/text-ink/…):
// автоматически выглядят корректно и в тёмной теме сайта, и в светлой админке.

import { cn } from "@/lib/utils";
import { Flame, Loader2, SearchX, Snowflake } from "lucide-react";
import { STREAK_LABELS, STREAK_MIN } from "@/lib/labels";

/** Отображаемый счёт матча с учётом регламентного WO-счёта (COALESCE-логика PRD Epic 2) */
export function matchScore(m: {
  status: string;
  walkoverType: string | null;
  homeScore: number | null;
  awayScore: number | null;
  regulationScore: number;
}): { home: number; away: number } | null {
  if (m.status === "COMPLETED") return { home: m.homeScore ?? 0, away: m.awayScore ?? 0 };
  if (m.status === "LIVE" && m.homeScore !== null) return { home: m.homeScore, away: m.awayScore ?? 0 };
  if (m.status === "WALKOVER" && m.walkoverType) {
    if (m.walkoverType === "HOME") return { home: 0, away: m.regulationScore };
    if (m.walkoverType === "AWAY") return { home: m.regulationScore, away: 0 };
    return { home: 0, away: 0 };
  }
  return null;
}

/** Чип статуса матча: LIVE пульсирует красным, завершённый — зелёным */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; dot?: string }> = {
    SCHEDULED: { label: "Запланирован", cls: "bg-s2 text-ink2" },
    LIVE: { label: "Идёт сейчас", cls: "bg-live/15 text-live", dot: "bg-live" },
    COMPLETED: { label: "Завершён", cls: "bg-ok/15 text-ok" },
    WALKOVER: { label: "Тех. поражение", cls: "bg-warn/15 text-warn" },
    POSTPONED: { label: "Перенесён", cls: "bg-s2 text-ink3" },
  };
  const v = map[status] ?? { label: status, cls: "bg-s2 text-ink2" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", v.cls)}>
      {v.dot && <span className={cn("h-1.5 w-1.5 rounded-full", v.dot, "live-dot")} />}
      {v.label}
    </span>
  );
}

/** Форма команды за последние матчи: В/Н/П/Т(тех.)/тВ */
export function FormBadges({ form }: { form: string[] }) {
  const map: Record<string, { label: string; cls: string; title: string }> = {
    W: { label: "В", cls: "bg-ok text-white", title: "Победа" },
    D: { label: "Н", cls: "bg-ink3 text-s0", title: "Ничья" },
    L: { label: "П", cls: "bg-live text-white", title: "Поражение" },
    T: { label: "Т", cls: "bg-warn text-white", title: "Техническое поражение" },
    w: { label: "тВ", cls: "bg-warn/30 text-warn", title: "Техническая победа" },
  };
  if (form.length === 0) return <span className="text-ink3">—</span>;
  return (
    <div className="flex items-center gap-1">
      {form.map((f, i) => {
        const v = map[f] ?? { label: f, cls: "bg-s2 text-ink2", title: f };
        return (
          <span key={i} title={v.title} className={cn("inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-bold", v.cls)}>
            {v.label}
          </span>
        );
      })}
    </div>
  );
}

/** Серия команды: огонь — победы, снежинка — поражения.
 *  Порог STREAK_MIN (5+): настоящая серия, а не случайность. */
export function StreakMark({ streak, compact, className }: { streak: { code: string; count: number } | null | undefined; compact?: boolean; className?: string }) {
  if (!streak) return null;
  const hot = (streak.code === "W" || streak.code === "w") && streak.count >= STREAK_MIN;
  const cold = (streak.code === "L" || streak.code === "T") && streak.count >= STREAK_MIN;
  if (!hot && !cold) return null;
  const word = STREAK_LABELS[streak.code] ?? "матчей";
  const title = hot ? `Команда на огне: ${streak.count} ${word} подряд` : `Команда в кризисе: ${streak.count} ${word} подряд`;
  return (
    <span
      title={title}
      className={cn("inline-flex items-center gap-1 text-xs font-bold", hot ? "streak-hot" : "streak-cold", className)}
    >
      {hot ? <Flame className="h-3.5 w-3.5 streak-hot-glow" /> : <Snowflake className="h-3.5 w-3.5" />}
      {!compact && <span>{streak.count}</span>}
    </span>
  );
}

/** Позиция игрока сокращением */
export function PositionBadge({ position }: { position: string | null }) {
  const map: Record<string, string> = { GK: "ВРТ", DF: "ЗАЩ", MF: "ПЗ", FW: "НАП" };
  if (!position || !map[position]) return null;
  return <span className="text-xs font-medium text-ink3">{map[position]}</span>;
}

/** Счёт в строке/карточке */
export function ScoreBox({ score, status }: { score: { home: number; away: number } | null; status?: string }) {
  if (!score) return <span className="font-mono text-ink3">— : —</span>;
  return (
    <span className={cn("font-mono font-bold tabular", status === "WALKOVER" ? "text-warn" : "text-ink")}>
      {score.home} : {score.away}
    </span>
  );
}

export function LoadingBlock({ label = "Загрузка..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-sline py-16 text-ink3">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-live/30 bg-live/10 p-6 text-center text-live">
      <p className="font-medium">Ошибка загрузки</p>
      <p className="mt-1 text-sm">{message}</p>
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-sline py-12 text-ink3">
      {icon ?? <SearchX className="h-6 w-6 opacity-60" />}
      <p className="font-medium text-ink2">{title}</p>
      {hint && <p className="max-w-sm text-center text-sm">{hint}</p>}
    </div>
  );
}
