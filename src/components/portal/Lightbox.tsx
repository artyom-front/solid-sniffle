"use client";

// ============================================================
// Lightbox — полноэкранный просмотр фото «поближе» (v1.0.53,
// feedback53 №3; UX-переработка v1.0.54 по feedback54 №6:
// «не понятно и не удобно закрывать — сделай по современным
// стандартам»).
//
// ЗОЛОТОЙ СТАНДАРТ ПРОСМОТРА (v1.0.54):
//   • ЗАКРЫТИЕ — четыре знакомых всем способа:
//     1) заметная кнопка ✕ (правый верх, с подложкой);
//     2) клик/тап по фону ВНЕ фото;
//     3) Esc;
//     4) свайп ВНИЗ по фото (как в Instagram/Telegram) —
//        работает, когда зум сброшен (scale = 1);
//   • ЗУМ: колесо мыши, пинч двумя пальцами, двойной клик/
//     двойной тап (1↔2 с приближением к точке тапа),
//     кнопки +/−/сброс в нижней панели;
//   • ПАНОРАМА: при зуме > 1 фото перетаскивается мышью
//     и пальцем (cursor: grab / grabbing);
//   • ЛИСТАНИЕ: ←/→, свайп по горизонтали (только при scale=1),
//     счётчик «n из m»;
//   • зум «в точку»: точка под курсором/пальцем остаётся
//     на месте (как в нативных просмотрщиках);
//   • кнопки ≥44px (палец с тротуара), role="dialog" +
//     aria-modal, sr-only-статус, осмысленный alt;
//   • подсказка «Esc или клик по фону — закрыть» в нижней
//     панели — закрываемость очевидна с первой секунды.
//
// Управляемый компонент: index/onIndexChange/onClose живут у
// родителя — родитель решает, КОГДА открывать (клик по «кругляшу»
// с фото; заглушки-инициалы БЕЗ фото лайтбокс не открывают).
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
const MAX_SCALE = 4;
const SCALE_STEP = 0.5;
/** свайп-жесты: минимальный путь в px */
const SWIPE_MIN = 48;
/** «это тап, а не жест» — движение меньше этого значения */
const TAP_MAX = 10;
/** окно двойного тапа, мс */
const DBL_TAP_MS = 300;

/** h-11 w-11 = 44×44px — тапабельная цель «пальцем с тротуара» */
const TAP_BTN =
  "flex h-11 w-11 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 hover:text-white active:bg-white/20";

/** состояние картинки на «сцене» */
interface SceneState {
  scale: number;
  offset: { x: number; y: number };
}

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
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  const total = images.length;
  const current = images[Math.min(Math.max(index, 0), total - 1)] ?? null;

  const clamp = useCallback((s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s)), []);

  /** граница панорамы: фото не улетает за экран (±40% вьюпорта × зум) */
  const clampOffset = useCallback((o: { x: number; y: number }, s: number) => {
    if (typeof window === "undefined") return { x: 0, y: 0 };
    const mx = window.innerWidth * 0.4 * Math.max(1, s - 0.5);
    const my = window.innerHeight * 0.4 * Math.max(1, s - 0.5);
    return { x: Math.max(-mx, Math.min(mx, o.x)), y: Math.max(-my, Math.min(my, o.y)) };
  }, []);

  const resetZoom = useCallback(() => {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
  }, []);

  /** Зум «в точку»: экранная точка (cx, cy) относительно центра сцены
   *  остаётся на месте (нативный behavior просмотрщиков). */
  const zoomTo = useCallback(
    (nextScale: number, cx?: number, cy?: number) => {
      const s = clamp(nextScale);
      let next = { x: 0, y: 0 };
      if (cx !== undefined && cy !== undefined) {
        const k = s / scale;
        next = { x: cx - (cx - offset.x) * k, y: cy - (cy - offset.y) * k };
      }
      setScale(s);
      setOffset(s === MIN_SCALE ? { x: 0, y: 0 } : clampOffset(next, s));
    },
    [scale, offset, clamp, clampOffset]
  );

  /** листание (циклично); смена картинки сбрасывает зум и панораму */
  const go = useCallback(
    (dir: 1 | -1) => {
      if (total < 2) return;
      resetZoom();
      onIndexChange((index + dir + total) % total);
    },
    [index, total, onIndexChange, resetZoom]
  );

  // ---------- Клавиатура: Esc — закрыть, ←/→ — листать ----------
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

  // Зум колесом: НАТИВНЫЙ листенер { passive: false } (React-обёртка
  // onWheel пассивна — preventDefault в ней не работает). Зум «в курсор».
  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomTo(scale + (e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP), e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scale, zoomTo]);

  // ---------- Жесты: пинч / панорама / свайпы / двойной тап ----------
  // Один refs-объект на всё «сырое» состояние жеста — рендеров не порождает.
  const gesture = useRef<{
    start: { x: number; y: number };
    last: { x: number; y: number };
    moved: boolean;
    /** пинч: стартовые дистанция/масштаб/середина/смещение */
    pinch: { dist: number; scale: number; mid: { x: number; y: number }; offset: { x: number; y: number } } | null;
    /** двойной тап: время и точка предыдущего тапа */
    lastTap: { t: number; x: number; y: number } | null;
    /** пан была ( suppressing последующий клик по фону) */
    dragged: boolean;
  }>({ start: { x: 0, y: 0 }, last: { x: 0, y: 0 }, moved: false, pinch: null, lastTap: null, dragged: false });

  /** центр сцены в экранных координатах — для математики «зум в точку» */
  const sceneCenter = () => {
    const rect = sceneRef.current?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 };
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t0 = e.touches[0];
    gesture.current.start = { x: t0.clientX, y: t0.clientY };
    gesture.current.last = { x: t0.clientX, y: t0.clientY };
    gesture.current.moved = false;
    gesture.current.dragged = false;
    if (e.touches.length === 2) {
      const t1 = e.touches[1];
      const c = sceneCenter();
      gesture.current.pinch = {
        dist: Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY) || 1,
        scale,
        mid: { x: (t0.clientX + t1.clientX) / 2 - c.x, y: (t0.clientY + t1.clientY) / 2 - c.y },
        offset,
      };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    const t0 = e.touches[0];

    // ---- пинч: масштаб + сдвиг серединой пальцев ----
    if (e.touches.length === 2 && g.pinch) {
      const t1 = e.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY) || 1;
      const c = sceneCenter();
      const s = clamp(g.pinch.scale * (dist / g.pinch.dist));
      // точка между пальцами остаётся на месте
      const mid = { x: (t0.clientX + t1.clientX) / 2 - c.x, y: (t0.clientY + t1.clientY) / 2 - c.y };
      const k = s / g.pinch.scale;
      const next = { x: mid.x - (g.pinch.mid.x - g.pinch.offset.x) * k, y: mid.y - (g.pinch.mid.y - g.pinch.offset.y) * k };
      setScale(s);
      setOffset(s === MIN_SCALE ? { x: 0, y: 0 } : clampOffset(next, s));
      g.moved = true;
      g.dragged = true;
      return;
    }

    const dx = t0.clientX - g.last.x;
    const dy = t0.clientY - g.last.y;
    g.last = { x: t0.clientX, y: t0.clientY };
    if (Math.hypot(t0.clientX - g.start.x, t0.clientY - g.start.y) > TAP_MAX) g.moved = true;

    // ---- панорама (зум > 1): двигаем фото пальцем ----
    if (scale > MIN_SCALE) {
      e.preventDefault(); // не скроллим страницу (на всякий случай)
      setOffset((o) => clampOffset({ x: o.x + dx, y: o.y + dy }, scale));
      if (g.moved) g.dragged = true;
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const g = gesture.current;
    g.pinch = null; // палец убрали — пинч закончен

    const t = e.changedTouches[0];
    const dx = t.clientX - g.start.x;
    const dy = t.clientY - g.start.y;

    // ---- двойной тап: 1↔2 с зумом «в точку» ----
    if (!g.moved) {
      const now = Date.now();
      if (g.lastTap && now - g.lastTap.t < DBL_TAP_MS && Math.hypot(t.clientX - g.lastTap.x, t.clientY - g.lastTap.y) < TAP_MAX * 2) {
        const c = sceneCenter();
        zoomTo(scale > MIN_SCALE ? MIN_SCALE : 2, t.clientX - c.x, t.clientY - c.y);
        g.lastTap = null;
        return;
      }
      g.lastTap = { t: now, x: t.clientX, y: t.clientY };
      return;
    }

    if (scale > MIN_SCALE) return; // панорама — не жесты листания/закрытия

    // ---- свайп ВНИЗ — закрыть (инстаграм-паттерн) ----
    if (dy > SWIPE_MIN && dy > Math.abs(dx) * 1.2) {
      onClose();
      return;
    }
    // ---- горизонтальный свайп — листание ----
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  };

  // ---------- Панорама мышью (drag при зуме > 1) ----------
  const mouseDrag = useRef<{ x: number; y: number } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    if (scale <= MIN_SCALE || e.button !== 0) return;
    mouseDrag.current = { x: e.clientX, y: e.clientY };
    gesture.current.dragged = true;
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = mouseDrag.current;
      if (!d) return;
      setOffset((o) => clampOffset({ x: o.x + e.clientX - d.x, y: o.y + e.clientY - d.y }, scale));
      mouseDrag.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => (mouseDrag.current = null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [scale, clampOffset]);

  // после панорамы/пинча подавляем клик по фону (иначе «отпустил фото —
  // лайтбокс закрылся»): клик-«призрак» приходит сразу после touchend
  const onClickCapture = (e: React.MouseEvent) => {
    if (gesture.current.dragged) {
      e.stopPropagation();
      e.preventDefault();
      gesture.current.dragged = false;
    }
  };

  if (!current) return null;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Просмотр фото: ${current.alt}`}
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col bg-black/90 outline-none backdrop-blur-sm"
      // клик по фону (вне панелей/картинки) закрывает просмотр
      onClick={onClose}
      onClickCapture={onClickCapture}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* верхняя панель: счётчик «n из m» + подпись + ЗАМЕТНАЯ кнопка закрытия */}
      <div className="flex items-center gap-2 px-3 py-2 text-white/90 sm:px-4" onClick={(e) => e.stopPropagation()}>
        <span className="shrink-0 text-xs font-medium tabular" aria-live="polite">
          {index + 1} из {total}
        </span>
        {current.caption && <span className="min-w-0 truncate text-xs text-white/60">{current.caption}</span>}
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть просмотр"
          title="Закрыть (Esc или клик по фону)"
          className={cn(TAP_BTN, "ml-auto bg-white/10 backdrop-blur-sm")}
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* сцена: [←] картинка [→] */}
      <div ref={sceneRef} className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        {total > 1 && (
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Предыдущая картинка"
            title="Предыдущая (←)"
            className={cn(TAP_BTN, "absolute left-2 z-10 bg-black/40 backdrop-blur-sm sm:left-4")}
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
        )}
        <img
          src={current.url}
          alt={current.alt}
          draggable={false}
          className={cn(
            "max-h-[92dvh] max-w-[94vw] select-none object-contain transition-transform duration-200 ease-out",
            scale > MIN_SCALE ? "cursor-grab" : "cursor-zoom-in"
          )}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={onMouseDown}
          // двойной клик мышью — тумблер 1↔2 «в точку клика»
          onDoubleClick={(e) => {
            const rect = sceneRef.current?.getBoundingClientRect();
            if (!rect) return;
            zoomTo(scale > MIN_SCALE ? MIN_SCALE : 2, e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);
          }}
        />
        {total > 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Следующая картинка"
            title="Следующая (→)"
            className={cn(TAP_BTN, "absolute right-2 z-10 bg-black/40 backdrop-blur-sm sm:right-4")}
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        )}
      </div>

      {/* нижняя панель: зум +/−/сброс, масштаб и ПОДСКАЗКА о закрытии —
          закрываемость видна с первой секунды, учить не надо */}
      <div className="flex flex-col items-center gap-1 px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => zoomTo(scale - SCALE_STEP)}
            disabled={scale <= MIN_SCALE}
            aria-label="Уменьшить (колесо мыши или пинч)"
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
            onClick={() => zoomTo(scale + SCALE_STEP)}
            disabled={scale >= MAX_SCALE}
            aria-label="Увеличить (колесо мыши или пинч)"
            title="Увеличить"
            className={cn(TAP_BTN, "disabled:opacity-40")}
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={resetZoom}
            disabled={scale === MIN_SCALE}
            aria-label="Сбросить масштаб"
            title="Сбросить масштаб"
            className={cn(TAP_BTN, "disabled:opacity-40")}
          >
            <RotateCcw className="h-5 w-5" />
          </button>
        </div>
        <p className="text-[10px] text-white/40" aria-hidden>
          {total > 1 ? "Esc, клик по фону или свайп вниз — закрыть · ←/→ и свайп вбок — листать" : "Esc или клик по фону — закрыть"}
          {scale > MIN_SCALE ? " · фото можно двигать" : ""}
        </p>
      </div>

      {/* живая инструкция для скринридера */}
      <span className="sr-only" role="status">
        {current.alt}. Esc — закрыть, стрелки — листать, двойной клик или пинч — приблизить.
      </span>
    </div>
  );
}
