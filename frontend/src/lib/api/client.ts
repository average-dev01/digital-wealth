// Backend client. Every `lib/api/*.ts` domain file calls through `fetchApi()`
// below — there is no mock data layer any more.

export const API_BASE_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : undefined;
}

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (method !== "GET" && method !== "HEAD") {
    const csrfToken = readCookie("csrf_token");
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }
  return fetch(`${API_BASE_URL}${path}`, { ...init, method, headers, credentials: "include" });
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

// A concurrent burst of 401s (e.g. every dashboard query firing at once after
// an access token expires) should trigger exactly one /auth/refresh, not one
// per caller — so every in-flight retry waits on the same promise.
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= rawFetch("/auth/refresh", { method: "POST" })
    .then((res) => res.ok)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

// 401s from these two paths mean "your credentials/refresh token are actually
// invalid," not "your access token expired" — retrying would just loop or
// mask a real login failure as a generic error.
const NO_REFRESH_RETRY = new Set(["/auth/refresh", "/auth/login"]);

/**
 * Calls the real backend with the session cookie + CSRF header attached, and
 * transparently refreshes an expired access token once before giving up, so
 * callers only ever see a 401 when the session is truly dead.
 */
export async function fetchApi<T = void>(
  path: string,
  init: RequestInit = {},
  retryOn401 = true,
): Promise<T> {
  const res = await rawFetch(path, init);

  if (res.status === 401 && retryOn401 && !NO_REFRESH_RETRY.has(path)) {
    const refreshed = await refreshSession();
    if (refreshed) return fetchApi<T>(path, init, false);
  }

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, "Something went wrong. Please try again."));
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
