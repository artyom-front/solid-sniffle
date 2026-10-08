"use client";

// ============================================================
// Lightbox — полноэкранный просмотр фото «поближе» (v1.0.53,
// feedback53 №3: «добавил фото игроков и картинки команд, но их
// нельзя посмотреть поближе — на маленьких кругляшах сложно
// разглядеть»).
//
// ЗОЛОТОЙ СТАНДАРТ просмотра:
//   • фон — fixed inset-0, чёрный 90%; клик по фону закрывает;
//   • картинка object-contain: max-h-[92dvh] max-w-[94vw];
//   • зум +/−/сброс (scale 1–3, плавный transition-transform),
//     двойной клик — переключение 1↔2, колесо мыши — зум;
//   • Esc — закрыть, ←/→ — листание массива, счётчик «n из m»;
//   • свайп-перелистывание на тач (горизонтальный порог 48px);
//   • кнопки ≥44px (палец с тротуара), role="dialog" + aria-modal,
//     aria-label, sr-only статус, осмысленный alt (имя персоны /
//     название команды — передаёт вызывающий код).
//
// Управляемый компонент: index/onIndexChange/onClose живут у
// родителя — родитель решает, КОГДА открывать (клик по «кругляшу»
// с фото; заглушки-инициалы БЕЗ фото лайтбокс не открывают).
// Смена картинки сбрасывает зум; на открытии — фокус на диалог и
// блок прокрутки фона (body overflow, восстановление при размонте).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/** Одна картинка лайтбокса: url + ОСМЫСЛЕННЫЙ alt (имя игрока,
 *  название команды) + необязательная подпись-«caption» в шапке. */
export interface LightboxImage {
  url: string;
  alt: string;
  /** подпись рядом со счётчиком (например, ФИО персоны) */
  caption?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const SCALE_STEP = 0.5;
/** свайп: горизонтальный порог в px (вертикальное движение — скролл —
 *  игнорируем, чтобы листание не срабатывало от прокрутки) */
const SWIPE_MIN = 48;

/** h-11 w-11 = 44×44px — тапабельная цель «пальцем с тротуара» */
const TAP_BTN =
  "flex h-11 w-11 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white";

export function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  /** массив картинок (навигация ←/→ появляется от 2 штук) */
  images: LightboxImage[];
  /** текущая картинка (0-based) */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const total = images.length;
  const current = images[Math.min(Math.max(index, 0), total - 1)] ?? null;

  const clamp = useCallback((s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s)), []);

  /** листание (циклично); смена картинки сбрасывает зум */
  const go = useCallback(
    (dir: 1 | -1) => {
      if (total < 2) return;
      setScale(MIN_SCALE);
      onIndexChange((index + dir + total) % total);
    },
    [index, total, onIndexChange]
  );

  // Клавиатура: Esc — закрыть, ←/→ — листать
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, go]);

  // Открытие: фокус на диалог (скринридер объявит aria-label) +
  // блок прокрутки фона; размонт — восстановление overflow.
  useEffect(() => {
    rootRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Зум колесом: НАТИВНЫЙ листенер { passive: false } — React-обёртка
  // onWheel пассивна, preventDefault (запрет прокрутки страницы под
  // лайтбоксом) в ней не работает.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((s) => clamp(s + (e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clamp]);

  // Смена картинки сбрасывает зум — это делает go() (setScale(MIN_SCALE));
  // отдельный useEffect для сброса — линт-ошибка set-state-in-effect,
  // а родительские интеграции v1.0.53 индекс извне не меняют.
  if (!current) return null;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Просмотр фото: ${current.alt}`}
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col bg-black/90 outline-none"
      // клик по фону (вне панелей/картинки) закрывает просмотр
      onClick={onClose}
      onTouchStart={(e) => {
        const t = e.touches[0];
        touchStart.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        const st = touchStart.current;
        touchStart.current = null;
        if (!st) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - st.x;
        const dy = t.clientY - st.y;
        // свайп-перелистывание: гориз. путь > порога и больше вертикали
        if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      }}
    >
      {/* верхняя панель: счётчик «n из m» + подпись + закрыть */}
      <div className="flex items-center gap-2 px-3 py-2 text-white/90 sm:px-4" onClick={(e) => e.stopPropagation()}>
        <span className="shrink-0 text-xs font-medium tabular" aria-live="polite">
          {index + 1} из {total}
        </span>
        {current.caption && <span className="min-w-0 truncate text-xs text-white/60">{current.caption}</span>}
        <button type="button" onClick={onClose} aria-label="Закрыть просмотр (Esc)" title="Закрыть (Esc)" className={cn(TAP_BTN, "ml-auto")}>
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* сцена: [←] картинка [→] */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        {total > 1 && (
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Предыдущая картинка"
            title="Предыдущая (←)"
            className={cn(TAP_BTN, "absolute left-2 z-10 bg-black/40 sm:left-4")}
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
        )}
        <img
          src={current.url}
          alt={current.alt}
          draggable={false}
          className="max-h-[92dvh] max-w-[94vw] select-none object-contain transition-transform duration-200 ease-out"
          style={{ transform: `scale(${scale})` }}
          onClick={(e) => e.stopPropagation()}
          // двойной клик — «привычный» тумблер 1↔2 (как в просмотрщиках)
          onDoubleClick={() => setScale((s) => (s > MIN_SCALE ? MIN_SCALE : 2))}
        />
        {total > 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Следующая картинка"
            title="Следующая (→)"
            className={cn(TAP_BTN, "absolute right-2 z-10 bg-black/40 sm:right-4")}
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        )}
      </div>

      {/* нижняя панель: зум +/−/сброс + текущий масштаб */}
      <div className="flex items-center justify-center gap-2 px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setScale((s) => clamp(s - SCALE_STEP))}
          disabled={scale <= MIN_SCALE}
          aria-label="Уменьшить (колесо мыши)"
          title="Уменьшить"
          className={cn(TAP_BTN, "disabled:opacity-40")}
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <span className="min-w-[3rem] text-center text-xs tabular text-white/70" aria-live="polite">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setScale((s) => clamp(s + SCALE_STEP))}
          disabled={scale >= MAX_SCALE}
          aria-label="Увеличить (колесо мыши)"
          title="Увеличить"
          className={cn(TAP_BTN, "disabled:opacity-40")}
        >
          <ZoomIn className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setScale(MIN_SCALE)}
          disabled={scale === MIN_SCALE}
          aria-label="Сбросить масштаб"
          title="Сбросить масштаб"
          className={cn(TAP_BTN, "disabled:opacity-40")}
        >
          <RotateCcw className="h-5 w-5" />
        </button>
      </div>

      {/* живая инструкция для скринридера */}
      <span className="sr-only" role="status">
        {current.alt}. Esc — закрыть, стрелки — листать, двойной клик — приблизить.
      </span>
    </div>
  );
}
