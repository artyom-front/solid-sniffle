"use client";

// Глобальный поиск по порталу: лиги, команды, персоны, стадионы.
// Открывается из шапки сайта / тулбара админки или хоткеем «/».
// Связь без пропов: window-событие "s21:search".

import { useEffect, useRef, useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Trophy, Shield, User, MapPin, CornerDownLeft } from "lucide-react";
import { navigate } from "./router";

interface SearchResults {
  leagues: { id: string; label: string; sub: string }[];
  teams: { id: string; label: string; sub: string }[];
  players: { id: string; label: string; sub: string }[];
  stadiums: { id: string; label: string; sub: string }[];
}

const EMPTY: SearchResults = { leagues: [], teams: [], players: [], stadiums: [] };

export function openGlobalSearch() {
  window.dispatchEvent(new CustomEvent("s21:search"));
}

export default function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Открытие из любого места + хоткей «/»
  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (e.key === "/" && !typing && !open) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("s21:search", onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("s21:search", onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Дебаунс-запрос
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/public/search?q=${encodeURIComponent(q.trim())}`);
        const j = (await r.json()) as SearchResults;
        setResults(j);
      } catch {
        setResults(EMPTY);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  const go = (path: string) => {
    setOpen(false);
    setQ("");
    navigate(path);
  };

  const total = results.leagues.length + results.teams.length + results.players.length + results.stadiums.length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[12%] translate-y-0 gap-0 border-sline bg-s1 p-0 text-ink sm:max-w-xl">
        <DialogTitle className="sr-only">Поиск по порталу</DialogTitle>
        <Command shouldFilter={false} className="overflow-hidden rounded-xl">
          <div className="flex items-center gap-2 border-b border-sline px-3">
            <CommandInput
              value={q}
              onValueChange={setQ}
              placeholder="Команда, игрок, судья, лига, стадион…"
              className="flex-1 text-base"
            />
            <kbd className="hidden shrink-0 rounded border border-sline bg-s2 px-1.5 py-0.5 text-xs font-semibold text-ink3 sm:block">Esc</kbd>
          </div>
          <CommandList className="max-h-[55vh] scrollbar-s21">
            {q.trim().length >= 2 && !loading && total === 0 && <CommandEmpty>Ничего не найдено</CommandEmpty>}
            {q.trim().length < 2 && (
              <p className="py-8 text-center text-sm text-ink3">Введите минимум 2 символа — поиск по лигам, командам, игрокам, судьям и стадионам</p>
            )}
            {results.leagues.length > 0 && (
              <CommandGroup heading="Лиги">
                {results.leagues.map((l) => (
                  <CommandItem key={l.id} onSelect={() => go(`/league/${l.id}`)} className="gap-3">
                    <Trophy className="h-4 w-4 text-gold" />
                    <span className="flex-1 truncate font-medium">{l.label}</span>
                    <span className="text-xs text-ink3">{l.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.teams.length > 0 && (
              <CommandGroup heading="Команды">
                {results.teams.map((t) => (
                  <CommandItem key={t.id} onSelect={() => go(`/team/${t.id}`)} className="gap-3">
                    <Shield className="h-4 w-4 text-emerald-400" />
                    <span className="flex-1 truncate font-medium">{t.label}</span>
                    <span className="text-xs text-ink3">{t.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.players.length > 0 && (
              <CommandGroup heading="Персоны">
                {results.players.map((p) => (
                  <CommandItem key={p.id} onSelect={() => go(`/player/${p.id}`)} className="gap-3">
                    <User className="h-4 w-4 text-ink2" />
                    <span className="flex-1 truncate font-medium">{p.label}</span>
                    <span className="text-xs text-ink3">{p.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.stadiums.length > 0 && (
              <CommandGroup heading="Стадионы">
                {results.stadiums.map((s) => (
                  <CommandItem key={s.id} onSelect={() => go(`/stadium/${s.id}`)} className="gap-3">
                    <MapPin className="h-4 w-4 text-ink2" />
                    <span className="flex-1 truncate font-medium">{s.label}</span>
                    <span className="text-xs text-ink3">{s.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {total > 0 && (
              <p className="flex items-center justify-center gap-1 border-t border-sline py-2 text-xs text-ink3">
                <CornerDownLeft className="h-3 w-3" /> выбрать · перейти в профиль
              </p>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
