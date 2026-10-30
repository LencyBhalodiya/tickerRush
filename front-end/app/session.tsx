"use client";

import { createContext, use, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { postJson } from "./api";

export type Session = {
  user: { id: string; name: string; email: string; role: "user" | "admin" };
  accessToken: string;
};

// undefined while the page is still asking the server, null when signed out.
type SessionState = [Session | null | undefined, Dispatch<SetStateAction<Session | null | undefined>>];

const SessionContext = createContext<SessionState | null>(null);

// One request per page load. StrictMode runs effects twice in development, and a second request would
// rotate the refresh token again and use up another slot of the server's rate limit.
let restoring: Promise<Session | null> | undefined;

function restoreSession(): Promise<Session | null> {
  restoring ??= postJson("/auth/refresh", {})
    .then(({ res, data }) => (res.ok ? (data as Session) : null))
    .catch(() => null);
  return restoring;
}

// Memory only, never localStorage, so injected scripts can't lift a stored token.
// On load, the httpOnly refresh cookie (if any) is swapped for a fresh session.
export function SessionProvider({ children }: { children: ReactNode }) {
  const state = useState<Session | null | undefined>(undefined);
  const setSession = state[1];

  useEffect(() => {
    // Keep a session from a sign-in that finished while this request was in flight.
    restoreSession().then((restored) => setSession((current) => current ?? restored));
  }, [setSession]);

  return <SessionContext value={state}>{children}</SessionContext>;
}

export function useSession(): SessionState {
  const state = use(SessionContext);
  if (!state) throw new Error("useSession must be used inside <SessionProvider>");
  return state;
}
