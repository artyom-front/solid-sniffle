"use client";

// Информативные иконки событий протокола: мяч — гол, карточка — ЖК/КК,
// VAR-монитор с решением, круговые стрелки — замена. Акцент на «прочитывается
// за полсекунды без текста», но текстовая подпись всегда рядом.

import { cn } from "@/lib/utils";
import { Check, RefreshCw, Video, X } from "lucide-react";

/** Футбольный мяч: круг + центральный пятиугольник + швы к краям */
export function BallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("h-4 w-4", className)}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8.2 15.61 10.83 14.23 15.07 9.77 15.07 8.39 10.83Z" fill="currentColor" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round" />
      <path
        d="M12 8.2V3.4M15.61 10.83 20.56 9.23M14.23 15.07 17.28 19.27M9.77 15.07 6.72 19.27M8.39 10.83 3.44 9.23"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Карточка: жёлтая или красная, с окантовкой — читается на любом фоне */
export function CardIcon({ kind, className }: { kind: "yellow" | "red"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-[18px] w-[13px] rounded-[2.5px] ring-1 ring-inset ring-black/25", className)}
      style={{ background: kind === "yellow" ? "#fbbf24" : "#ef4444" }}
    />
  );
}

/** VAR: монитор + решение (✓ подтверждён / ✕ отменён / «П» пенальти) */
export function VarIcon({ decision, className }: { decision: "confirm" | "cancel" | "penalty"; className?: string }) {
  const tone = decision === "confirm" ? "text-ok" : decision === "cancel" ? "text-live" : "text-gold";
  return (
    <span className={cn("relative inline-flex items-center", className)} aria-hidden>
      <Video className={cn("h-[18px] w-[18px]", tone)} />
      <span className="absolute -bottom-[5px] -right-[7px] flex h-[11px] w-[11px] items-center justify-center rounded-full border border-sline bg-s1 leading-none">
        {decision === "confirm" && <Check className="h-[8px] w-[8px] text-ok" strokeWidth={4} />}
        {decision === "cancel" && <X className="h-[8px] w-[8px] text-live" strokeWidth={4} />}
        {decision === "penalty" && <span className="text-[7px] font-black text-gold">П</span>}
      </span>
    </span>
  );
}

/** Замена: круговые стрелки */
export function SubIcon({ className }: { className?: string }) {
  return <RefreshCw className={cn("h-4 w-4 text-ink2", className)} aria-hidden />;
}

/** Универсальная иконка события по типу (диспетчер) */
export function EventIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case "GOAL":
      return <BallIcon className={cn("text-gold", className)} />;
    case "PENALTY":
      return <BallIcon className={cn("text-gold", className)} />;
    case "OWN_GOAL":
      return <BallIcon className={cn("text-live", className)} />;
    case "YELLOW_CARD":
      return <CardIcon kind="yellow" className={className} />;
    case "RED_CARD":
      return <CardIcon kind="red" className={className} />;
    case "VAR_GOAL_CONFIRM":
      return <VarIcon decision="confirm" className={className} />;
    case "VAR_GOAL_CANCEL":
      return <VarIcon decision="cancel" className={className} />;
    case "VAR_PENALTY":
      return <VarIcon decision="penalty" className={className} />;
    case "SUB_OUT":
    case "SUB_IN":
      return <SubIcon className={className} />;
    default:
      return <SubIcon className={className} />;
  }
}
