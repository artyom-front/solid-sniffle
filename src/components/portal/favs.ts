"use client";

// ============================================================
// Избранные лиги: крошечный реактивный стор поверх localStorage.
// Общий для ленты (сортировка + звёзды) и сайдбара топ-лиг.
// Читается после монтирования — без рассинхрона SSR.
// ============================================================

import { useEffect, useState } from "react";

const FAV_KEY = "s21-fav-leagues";
const listeners = new Set<() => void>();
let cached: string[] | null = null;

function read(): string[] {
  if (cached) return cached;
  try {
    cached = JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]") as string[];
  } catch {
    cached = [];
  }
  return cached;
}

function write(next: string[]) {
  cached = next;
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

export function toggleFavLeague(leagueId: string) {
  const cur = read();
  write(cur.includes(leagueId) ? cur.filter((x) => x !== leagueId) : [...cur, leagueId]);
}

/** Подписка на избранное; после монтирования возвращает актуальный список */
export function useFavs(): string[] {
  const [favs, setFavs] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setFavs(read());
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return favs;
}
