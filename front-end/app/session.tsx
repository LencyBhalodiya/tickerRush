"use client";

import { createContext, use, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

export type Session = {
  user: { id: string; name: string; email: string; role: "user" | "admin" };
  accessToken: string;
};

type SessionState = [Session | null, Dispatch<SetStateAction<Session | null>>];

const SessionContext = createContext<SessionState | null>(null);

// Memory only, never localStorage, so injected scripts can't lift a stored token.
// The trade-off: a reload forgets the session until /refresh can restore it from the cookie.
export function SessionProvider({ children }: { children: ReactNode }) {
  const state = useState<Session | null>(null);
  return <SessionContext value={state}>{children}</SessionContext>;
}

export function useSession(): SessionState {
  const state = use(SessionContext);
  if (!state) throw new Error("useSession must be used inside <SessionProvider>");
  return state;
}
