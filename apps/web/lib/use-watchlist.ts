"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "pulse.watchlist";
const DEFAULT: string[] = ["BTC", "ETH"];

function read(): string[] {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) return parsed;
    return DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function write(list: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    // Notify other components in the same tab
    window.dispatchEvent(new CustomEvent("pulse:watchlist", { detail: list }));
  } catch {
    /* localStorage unavailable */
  }
}

export function useWatchlist() {
  const [list, setList] = useState<string[]>(DEFAULT);

  useEffect(() => {
    setList(read());
    const onChange = (ev: Event) => {
      const detail = (ev as CustomEvent<string[]>).detail;
      if (Array.isArray(detail)) setList(detail);
    };
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === KEY) setList(read());
    };
    window.addEventListener("pulse:watchlist", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("pulse:watchlist", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggle = useCallback((symbol: string) => {
    const current = read();
    const upper = symbol.toUpperCase();
    const next = current.includes(upper)
      ? current.filter((s) => s !== upper)
      : [...current, upper];
    write(next);
    setList(next);
  }, []);

  const has = useCallback((symbol: string) => list.includes(symbol.toUpperCase()), [list]);

  const clear = useCallback(() => {
    write([]);
    setList([]);
  }, []);

  const set = useCallback((next: string[]) => {
    const cleaned = Array.from(new Set(next.map((s) => s.toUpperCase()))).filter(Boolean);
    write(cleaned);
    setList(cleaned);
  }, []);

  return { list, has, toggle, clear, set };
}
