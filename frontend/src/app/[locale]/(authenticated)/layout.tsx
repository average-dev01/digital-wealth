"use client";

import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "@/i18n/navigation";

/**
 * Auth gate for everything under this route group — the port of the original
 * `_authenticated` pathless layout route's `beforeLoad` redirect. Session
 * state comes from an httpOnly cookie (via GET /auth/me), so this stays a
 * client component that redirects once the session query resolves.
 */
export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/auth?mode=login");
  }, [user, loading, router]);

  if (loading || !user) {
    return <div className="min-h-screen bg-background" />;
  }

  return <>{children}</>;
}
