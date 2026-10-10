"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DutyInput } from "@/lib/fdtl/types";
import type { RollingTotals } from "@/lib/cae/transform";
import { usePersistentState } from "@/lib/storage";
import { Sheet, btn, inputCls } from "./ui";

export interface SyncPayload {
  duties: DutyInput[];
  totals: RollingTotals[];
  range: { from: string; to: string };
  fetchedAt: string;
}

interface Creds {
  username: string;
  password: string;
}

const AUTO_SYNC_MS = 5 * 60 * 1000;
const CREDS_KEY = "fdtl.caeCreds.v1";

export interface CrewSession {
  creds: Creds | null;
  loaded: boolean;
  state: "idle" | "busy" | "ok" | "error";
  message: string;
  doSync: (c: Creds, saveCreds: boolean, auto?: boolean) => Promise<boolean>;
  logout: () => void;
}

function credKey(c: Creds) {
  return `${c.username}\0${c.password}`;
}

export function useCrewAccess(onSync: (p: SyncPayload) => void): CrewSession {
  const [creds, setCreds, loaded] = usePersistentState<Creds | null>(CREDS_KEY, null);
  const [state, setState] = useState<CrewSession["state"]>("idle");
  const [message, setMessage] = useState("");
  const syncing = useRef(false);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;
  const syncedFor = useRef<string | null>(null);

  const doSync = useCallback(
    async (c: Creds, saveCreds: boolean, auto = false) => {
      if (syncing.current) return false;
      syncing.current = true;
      setState("busy");
      if (!auto) setMessage("");
      try {
        const res = await fetch("/api/cae/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(c),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Sync failed (${res.status})`);
        syncedFor.current = credKey(c);
        if (saveCreds) setCreds(c);
        onSyncRef.current(data as SyncPayload);
        setState("ok");
        const t = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        setMessage(`${data.duties.length} duties · ${t}`);
        return true;
      } catch (err) {
        setState("error");
        setMessage(err instanceof Error ? err.message : "Sync failed");
        return false;
      } finally {
        syncing.current = false;
      }
    },
    [setCreds],
  );

  useEffect(() => {
    if (!loaded || !creds) return;
    const key = credKey(creds);
    if (syncedFor.current !== key) {
      syncedFor.current = key;
      void doSync(creds, false, true);
    }
    const timer = setInterval(() => void doSync(creds, false, true), AUTO_SYNC_MS);
    return () => clearInterval(timer);
  }, [loaded, creds, doSync]);

  const logout = () => {
    syncedFor.current = null;
    setCreds(null);
    setState("idle");
    setMessage("");
  };

  return { creds, loaded, state, message, doSync, logout };
}

export function LoginModal({ session }: { session: CrewSession }) {
  const [form, setForm] = useState<Creds>({ username: "", password: "" });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/70 px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-8 sm:items-center sm:pt-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-stone-900"
      >
        <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">FDTL Check</p>
        <h2 id="login-title" className="mt-1 text-lg font-semibold">
          Sign in
        </h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Use your CAE Crew Access login. The roster opens after this succeeds, and it refreshes every 5 minutes.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.username && form.password) void session.doSync(form, true);
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block text-stone-600 dark:text-stone-300">Username</span>
            <input
              className={inputCls}
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              enterKeyHint="next"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value.trim() })}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-stone-600 dark:text-stone-300">Password</span>
            <input
              className={inputCls}
              type="password"
              autoComplete="current-password"
              enterKeyHint="go"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </label>
          {session.state === "error" && session.message && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
              {session.message}
            </p>
          )}
          <button type="submit" className={`${btn.primary} w-full`} disabled={session.state === "busy"}>
            {session.state === "busy" ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export function SyncButton({ session }: { session: CrewSession }) {
  const [showAccount, setShowAccount] = useState(false);
  const [form, setForm] = useState<Creds>({ username: "", password: "" });

  const openAccount = () => {
    setForm(session.creds ?? { username: "", password: "" });
    setShowAccount(true);
  };

  return (
    <>
      <button
        className={btn.ghost}
        onClick={() => (session.creds ? void session.doSync(session.creds, false) : openAccount())}
        disabled={session.state === "busy"}
        aria-label="Sync roster from Crew Access"
      >
        {session.state === "busy" ? "Syncing…" : "Sync"}
      </button>
      <button
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
        onClick={openAccount}
        aria-label="Account"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 19.2c1.4-3 3.9-4.5 7-4.5s5.6 1.5 7 4.5" strokeLinecap="round" />
        </svg>
      </button>
      {showAccount && (
        <Sheet title="Crew Access" onClose={() => setShowAccount(false)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (form.username && form.password) {
                void session.doSync(form, true).then((ok) => {
                  if (ok) setShowAccount(false);
                });
              }
            }}
          >
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Saved in this browser and sent only to this app&apos;s server to fetch your roster.
            </p>
            <label className="block text-sm">
              <span className="mb-1 block text-stone-600 dark:text-stone-300">Username</span>
              <input
                className={inputCls}
                autoComplete="username"
                autoCapitalize="none"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.trim() })}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-stone-600 dark:text-stone-300">Password</span>
              <input
                className={inputCls}
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </label>
            {session.state === "error" && session.message && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                {session.message}
              </p>
            )}
            <button type="submit" className={`${btn.primary} w-full`} disabled={session.state === "busy"}>
              {session.state === "busy" ? "Signing in…" : "Save & sync"}
            </button>
            <button type="button" className={`${btn.danger} w-full`} onClick={session.logout}>
              Log out
            </button>
          </form>
        </Sheet>
      )}
    </>
  );
}
