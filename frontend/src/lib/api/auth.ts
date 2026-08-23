import { fetchApi } from "./client";
import { toProfile, type BackendUser, type Profile, type SessionResponse } from "./profile";

export type UserRole = "ADMIN" | "CUSTOMER";
export type AuthUser = { id: string; email: string; role: UserRole };

/**
 * One `GET /auth/me` answers three questions the UI asks separately  who am
 * I, what's my profile, am I an admin  so it's cached as a single object and
 * the hooks in useAuth.tsx each read the slice they need. Fetching it once per
 * consumer was three identical requests per page load.
 */
export type Session = { user: AuthUser; profile: Profile };

/**
 * Every endpoint that returns a session also returns `isAdmin`, so this role
 * is authoritative and callers can route on it immediately after login rather
 * than landing on the customer dashboard and correcting course.
 */
function toAuthUser(user: BackendUser, isAdmin: boolean): AuthUser {
  return { id: user.id, email: user.email, role: isAdmin ? "ADMIN" : "CUSTOMER" };
}

function toSession(data: SessionResponse): Session {
  return { user: toAuthUser(data.user, data.isAdmin), profile: toProfile(data.user, data.isAdmin) };
}

export async function signup(email: string, password: string, fullName: string): Promise<Session> {
  const data = await fetchApi<SessionResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email: email.trim(), password, fullName: fullName.trim() }),
  });
  return toSession(data);
}

export async function login(email: string, password: string): Promise<Session> {
  const data = await fetchApi<SessionResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: email.trim(), password }),
  });
  return toSession(data);
}

export async function logout(): Promise<void> {
  await fetchApi<void>("/auth/logout", { method: "POST" });
}

export async function getSession(): Promise<Session | null> {
  try {
    return toSession(await fetchApi<SessionResponse>("/auth/me"));
  } catch {
    return null;
  }
}

/** Always resolves silently regardless of whether the account exists  matches the backend's no-enumeration behavior. */
export async function resetPasswordForEmail(email: string): Promise<void> {
  await fetchApi<void>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: email.trim() }),
  });
}

/** Completes a password-reset flow: exchanges the emailed token for a new password and signs the user in. */
export async function updateUser(payload: { password: string; token: string }): Promise<Session> {
  const data = await fetchApi<SessionResponse>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: payload.token, password: payload.password }),
  });
  return toSession(data);
}
