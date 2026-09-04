"use client";

import { useEffect } from "react";
import Link from "next/link";

/** Глобальный error boundary: серверная ошибка рендера страницы сайта */
export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[site-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-live/10 font-mono text-2xl font-black text-live">
        500
      </span>
      <div>
        <h1 className="text-2xl font-black tracking-tight text-ink">Что-то пошло не так</h1>
        <p className="mt-2 max-w-md text-sm text-ink2">
          Внутренняя ошибка при загрузке страницы. Мы уже знаем об этом — попробуйте обновить страницу.
          {error.digest && <span className="mt-1 block font-mono text-xs text-ink3">digest: {error.digest}</span>}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-goldink transition-colors hover:bg-gold/85"
        >
          Повторить
        </button>
        <Link
          href="/"
          className="rounded-xl border border-sline bg-s1 px-5 py-2.5 text-sm font-semibold text-ink2 transition-colors hover:text-ink"
        >
          На главную
        </Link>
      </div>
    </div>
  );
}
