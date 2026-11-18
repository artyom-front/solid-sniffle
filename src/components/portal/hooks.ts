"use client";

import { useCallback, useEffect, useState } from "react";

/** GET JSON без стейта: чистая функция для эффекта и ручной перезагрузки */
async function fetchJson<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) return { ok: false, error: j?.error || "Ошибка загрузки данных" };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, error: "Ошибка загрузки" };
  }
}

/** Мини-хук загрузки данных с авто-перезагрузкой при смене версии данных.
 *  initial: данные из SSR — отдаются сразу, первый fetch этого же URL
 *  пропускается (гидратация мгновенная, без «мигания» скелетона).
 *  Смена URL или версии (LIVE/действия) — обычная загрузка.
 *
 *  v1.0.57 · РЕАКТОР ПОД react-hooks v6 (eslint-config-next 16.4.6):
 *  стейт ставится только из асинхронных колбэков (then/обработчики),
 *  loading/error — производные от «ключа» (url#version), к которому
 *  относятся data. Побочно устранена гонка старой правки: ответ
 *  отменённого запроса больше не может затереть данные нового URL. */
export function useFetch<T>(url: string | null, version = 0, initial?: T | null) {
  // data всегда привязан к ключу (url#version), для которого получен:
  // dataFor === ключ ⇒ данные актуальны и показываются
  const [data, setData] = useState<T | null>(initial ?? null);
  const [dataFor, setDataFor] = useState<string | null>(
    () => (initial != null && url ? `${url}#${version}` : null)
  );
  // ошибка тоже привязана к ключу: при смене URL старая не показывается
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState<string | null>(null);

  const key = url ? `${url}#${version}` : null;
  const current = key !== null && dataFor === key ? data : null;
  const error = key !== null && dataFor !== key && errorFor === key ? errorMsg : null;
  // loading — производное: данных для этого ключа ещё нет и ошибки нет
  const loading = key !== null && dataFor !== key && error === null;

  // ручная перезагрузка (кнопки/действия): стейт из async-колбэков,
  // не из тела эффекта — react-hooks/set-state-in-effect не применяется
  const load = useCallback(async () => {
    if (!url) return;
    const res = await fetchJson<T>(url);
    const forKey = `${url}#${version}`;
    if (res.ok) {
      setData(res.data);
      setDataFor(forKey);
      setErrorFor(null);
    } else {
      setErrorMsg(res.error);
      setErrorFor(forKey);
    }
  }, [url, version]);

  useEffect(() => {
    // SSR-данные актуальны для этого url+version — не дублируем запрос
    if (!url || dataFor === key) return;
    let cancelled = false;
    const forKey = key as string;
    // стейт ставится в асинхронном колбэке промиса, не в теле эффекта;
    // cancelled гасит ответ запроса, отменённого сменой URL/версии
    fetchJson<T>(url).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setData(res.data);
        setDataFor(forKey);
        setErrorFor(null);
      } else {
        setErrorMsg(res.error);
        setErrorFor(forKey);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [url, key, dataFor, version]);

  return { data: current, loading, error, reload: load };
}

/** POST/PATCH/DELETE JSON-запрос; возвращает { ok, data | error }.
 *
 * v1.0.52 · ТЕЛО ОТВЕТА ПРИ ОШИБКЕ (баг «не получается создать игрока
 * с одинаковыми ФИО»): раньше при !r.ok возвращался ТОЛЬКО текст error —
 * структурированное тело 409 (duplicates у персон, code/dependencies у
 * умного удаления) ВЫБРАСЫВАЛОСЬ. Панель дублей с кнопкой «Это другой
 * человек — создать всё равно» и блок-диалог SmartDelete молча не
 * работали: админ видел голую ошибку без пути решения. Теперь error-тело
 * пробрасывается в data (оно сознательно не бросается в исключение —
 * вызывающий код решает по res.data, ошибка ли это или структура 409). */
export async function apiPost<T = unknown>(url: string, body: unknown, method = "POST"): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, data: (j ?? {}) as T, error: j?.error || `Ошибка ${r.status}` };
    return { ok: true, data: j as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Сетевая ошибка" };
  }
}

const TZ = "Europe/Moscow"; // все турниры — Чувашия (МСК)

export function fmtDate(iso: string, withTime = true): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
  if (!withTime) return date;
  return `${date}, ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: TZ })}`;
}

export function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: TZ });
}
