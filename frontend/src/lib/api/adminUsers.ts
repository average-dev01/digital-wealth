// Admin-side customer administration: the searchable user list, the per-user
// detail bundle, and the three mutating actions (suspend/reactivate, KYC
// decision, manual balance adjustment).

import { toWalletKeyword, type BackendWalletKeyword, type WalletKeyword } from "./accountKeyword";
import { fetchApi } from "./client";
import type { Profile, KycStatus } from "./profile";
import {
  toTransaction,
  toWallet,
  type BackendTransaction,
  type BackendWallet,
  type Transaction,
  type Wallet,
} from "./wallets";

export type { Profile };

export type KycDocument = {
  id: string;
  user_id: string;
  doc_type: string;
  storage_path: string | null;
  status: KycStatus;
  submitted_at: string;
};

export type UserFilters = {
  /** Matches full name or email, case-insensitive. */
  search?: string;
  kycStatus?: KycStatus | "all";
  isActive?: boolean | "all";
  page?: number;
  pageSize?: number;
};

export type PaginatedUsers = {
  rows: Profile[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type { WalletKeyword };

export type UserDetail = {
  profile: Profile;
  wallets: Wallet[];
  walletKeywords: WalletKeyword[];
  transactions: Transaction[];
  kycDocuments: KycDocument[];
};

type BackendUserRow = {
  id: string;
  email: string;
  fullName: string;
  country: string | null;
  dob: string | null;
  kycStatus: KycStatus;
  isActive: boolean;
  createdAt: string;
};

type BackendKycDocument = {
  id: string;
  userId: string;
  docType: string;
  storagePath: string | null;
  status: KycStatus;
  submittedAt: string;
};

function toProfile(row: BackendUserRow, isAdmin = false): Profile {
  return {
    id: row.id,
    email: row.email,
    full_name: row.fullName || null,
    country: row.country,
    dob: row.dob,
    kyc_status: row.kycStatus,
    role: isAdmin ? "ADMIN" : "CUSTOMER",
    is_active: row.isActive,
    created_at: row.createdAt,
  };
}

function toKycDocument(d: BackendKycDocument): KycDocument {
  return {
    id: d.id,
    user_id: d.userId,
    doc_type: d.docType,
    storage_path: d.storagePath,
    status: d.status,
    submitted_at: d.submittedAt,
  };
}

export async function getUsers(filters: UserFilters = {}): Promise<PaginatedUsers> {
  const params = new URLSearchParams();
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.kycStatus && filters.kycStatus !== "all") params.set("kycStatus", filters.kycStatus);
  if (filters.isActive !== undefined && filters.isActive !== "all") {
    params.set("isActive", String(filters.isActive));
  }
  params.set("page", String(Math.max(1, filters.page ?? 1)));
  params.set("pageSize", String(Math.max(1, filters.pageSize ?? 10)));

  const data = await fetchApi<{
    rows: BackendUserRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>(`/admin/users?${params.toString()}`);

  return { ...data, rows: data.rows.map((row) => toProfile(row)) };
}

export async function getUserDetail(userId: string): Promise<UserDetail | null> {
  try {
    const data = await fetchApi<{
      profile: BackendUserRow;
      isAdmin: boolean;
      wallets: BackendWallet[];
      walletKeywords: BackendWalletKeyword[];
      transactions: BackendTransaction[];
      kycDocuments: BackendKycDocument[];
    }>(`/admin/users/${userId}`);

    return {
      profile: toProfile(data.profile, data.isAdmin),
      wallets: data.wallets.map(toWallet),
      walletKeywords: (data.walletKeywords ?? []).map(toWalletKeyword),
      transactions: data.transactions.map(toTransaction),
      kycDocuments: data.kycDocuments.map(toKycDocument),
    };
  } catch {
    return null;
  }
}

/** Suspend or reactivate an account. A suspended user is refused a session at login. */
export async function updateUser(
  userId: string,
  data: { is_active?: boolean; full_name?: string | null },
): Promise<Profile> {
  const updated = await fetchApi<{ profile: BackendUserRow }>(`/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(data.is_active !== undefined ? { isActive: data.is_active } : {}),
      ...(data.full_name ? { fullName: data.full_name } : {}),
    }),
  });
  return toProfile(updated.profile);
}

/** Approve or reject a customer's identity verification. */
export async function updateUserKyc(userId: string, status: KycStatus): Promise<Profile> {
  const updated = await fetchApi<{ profile: BackendUserRow }>(`/admin/users/${userId}/kyc`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return toProfile(updated.profile);
}

/**
 * Credit or debit a customer wallet by `amount` (negative debits) and write the
 * matching ledger entry. Takes a currency *id* from the admin catalogue, which
 * the backend resolves to the symbol the wallet ledger is keyed by.
 */
export async function adjustUserBalance(
  userId: string,
  currencyId: string,
  amount: number,
  note: string,
): Promise<void> {
  await fetchApi<{ ok: true }>(`/admin/users/${userId}/adjust-balance`, {
    method: "POST",
    body: JSON.stringify({ currencyId, amount, note }),
  });
}

/**
 * Approve or decline one of a customer's per-wallet Wallet Connect keywords. A
 * decline needs a `note`  the reason shown back to the customer.
 */
export async function reviewWalletKeyword(
  userId: string,
  walletName: string,
  decision: "approved" | "declined",
  note?: string,
): Promise<void> {
  await fetchApi<{ walletKeyword: BackendWalletKeyword }>(
    `/admin/users/${userId}/wallet-keywords/review`,
    {
      method: "POST",
      body: JSON.stringify({ walletName, decision, ...(note ? { note } : {}) }),
    },
  );
}

/** Clears one wallet's keyword so it reads as "not entered" again. */
export async function resetWalletKeyword(userId: string, walletName: string): Promise<void> {
  await fetchApi<{ ok: true }>(`/admin/users/${userId}/wallet-keywords/reset`, {
    method: "POST",
    body: JSON.stringify({ walletName }),
  });
}
