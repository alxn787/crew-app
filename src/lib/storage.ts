"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// In-memory copy so the app still works when localStorage is blocked (private mode etc.).
const memory = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();

function read(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    // fall through to memory
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // quota / blocked — memory copy still works for this session
  }
  listeners.get(key)?.forEach((l) => l());
}

function subscribe(key: string, cb: () => void) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(cb);
  const onStorage = (e: StorageEvent) => e.key === key && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.get(key)!.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * State persisted to localStorage. `initial` must be a stable reference.
 * `loaded` is false during server render / before hydration.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const raw = useSyncExternalStore(
    useCallback((cb) => subscribe(key, cb), [key]),
    () => read(key),
    () => undefined,
  );

  const value = useMemo<T>(() => {
    if (raw == null) return initial;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  }, [raw, initial]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      const r = read(key);
      let prev = initial;
      try {
        if (r !== null) prev = JSON.parse(r);
      } catch {
        // keep initial
      }
      const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      write(key, JSON.stringify(v));
    },
    [key, initial],
  );

  return [value, update, raw !== undefined] as const;
}
