import { fetchApi } from "./client";

export type KycStatus = "pending" | "verified" | "rejected";
export type UserRole = "ADMIN" | "CUSTOMER";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  country: string | null;
  dob: string | null;
  kyc_status: KycStatus;
  /** Opaque account identifier the customer enters once; null until they do. */
  account_keyword: string | null;
  account_keyword_set_at: string | null;
  role: UserRole;
  /**
   * Always true for the signed-in user: a suspended account is refused a
   * session at login, so anyone who can read their own profile is active by
   * definition. The admin user list reports other users' real value.
   */
  is_active: boolean;
  created_at: string;
};

export type BackendUser = {
  id: string;
  email: string;
  fullName: string;
  country: string | null;
  dob: string | null;
  kycStatus: KycStatus;
  accountKeyword: string | null;
  accountKeywordSetAt: string | null;
  createdAt: string;
};

/** Shared by every endpoint that returns a session (login/signup/refresh/me). */
export type SessionResponse = { user: BackendUser; isAdmin: boolean };

export function toProfile(user: BackendUser, isAdmin: boolean): Profile {
  return {
    id: user.id,
    email: user.email,
    full_name: user.fullName || null,
    country: user.country,
    dob: user.dob,
    kyc_status: user.kycStatus,
    account_keyword: user.accountKeyword ?? null,
    account_keyword_set_at: user.accountKeywordSetAt ?? null,
    role: isAdmin ? "ADMIN" : "CUSTOMER",
    is_active: true,
    created_at: user.createdAt,
  };
}

export async function updateMyProfile(
  _userId: string,
  patch: Partial<Pick<Profile, "full_name" | "country" | "dob">>,
): Promise<Profile> {
  const data = await fetchApi<SessionResponse>("/auth/me", {
    method: "PATCH",
    body: JSON.stringify({
      ...(patch.full_name !== undefined ? { fullName: patch.full_name } : {}),
      ...(patch.country !== undefined ? { country: patch.country } : {}),
      ...(patch.dob !== undefined ? { dob: patch.dob } : {}),
    }),
  });
  return toProfile(data.user, data.isAdmin);
}
