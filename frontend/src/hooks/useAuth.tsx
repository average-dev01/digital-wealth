"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSession, type AuthUser, type Session } from "@/lib/api/auth";
import type { Profile } from "@/lib/api/profile";

export type { Profile };

type AuthContextValue = {
  session: { user: AuthUser } | null;
  user: AuthUser | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
});

/**
 * The single source of session state. Every hook below reads this same cache
 * entry, so `GET /auth/me` is fetched once per page load however many
 * consumers there are.
 *
 * The short `staleTime` is deliberately much lower than the app-wide default
 *  the session must re-validate on window focus so a logout or suspension
 * from another tab is picked up on return  but not 0, or a second consumer
 * mounting a moment after the first (the dashboard layout right after the
 * provider) counts the just-fetched data as stale and refetches it.
 */
const SESSION_QUERY = {
  queryKey: ["me"] as const,
  queryFn: getSession,
  staleTime: 10_000,
  refetchOnWindowFocus: true,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isLoading } = useQuery(SESSION_QUERY);

  const value = useMemo(
    () => ({
      session: session ? { user: session.user } : null,
      user: session?.user ?? null,
      loading: isLoading,
    }),
    [session, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Profile slice of the shared session  no request of its own. */
export function useProfile() {
  return useQuery({
    ...SESSION_QUERY,
    select: (s: Session | null) => s?.profile ?? null,
  });
}

/**
 * Backs the /admin route guard. Reads `isAdmin` as returned by GET /auth/me
 * rather than any client-held flag, and because it shares the session query it
 * re-validates on window focus  so a role change or suspension takes effect
 * without signing out and back in.
 */
export function useIsAdmin() {
  return useQuery({
    ...SESSION_QUERY,
    select: (s: Session | null) => s?.user.role === "ADMIN",
  });
}
