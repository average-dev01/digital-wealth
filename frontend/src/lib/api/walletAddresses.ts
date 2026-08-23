// The deposit addresses the desk publishes to customers, one or more per
// currency/network. One shared address per asset, not per user  a customer
// cannot be given somewhere to send funds until an active address exists here.
// Real custody would source these from an HSM or exchange sub-account API;
// here they are plain rows.

import { fetchApi } from "./client";

export type WalletAddress = {
  id: string;
  currency_id: string;
  address: string;
  network: string;
  is_active: boolean;
  created_at: string;
};

export type WalletAddressInput = {
  currency_id: string;
  address: string;
  network: string;
  is_active: boolean;
};

type BackendWalletAddress = {
  id: string;
  currencyId: string;
  address: string;
  network: string;
  isActive: boolean;
  createdAt: string;
};

function toWalletAddress(row: BackendWalletAddress): WalletAddress {
  return {
    id: row.id,
    currency_id: row.currencyId,
    address: row.address,
    network: row.network,
    is_active: row.isActive,
    created_at: row.createdAt,
  };
}

function toPayload(data: Partial<WalletAddressInput>) {
  return {
    ...(data.currency_id !== undefined ? { currencyId: data.currency_id } : {}),
    ...(data.address !== undefined ? { address: data.address.trim() } : {}),
    ...(data.network !== undefined ? { network: data.network } : {}),
    ...(data.is_active !== undefined ? { isActive: data.is_active } : {}),
  };
}

export async function getWalletAddresses(): Promise<WalletAddress[]> {
  const data = await fetchApi<{ addresses: BackendWalletAddress[] }>("/admin/wallet-addresses");
  return data.addresses.map(toWalletAddress);
}

export async function createWalletAddress(data: WalletAddressInput): Promise<WalletAddress> {
  const created = await fetchApi<{ address: BackendWalletAddress }>("/admin/wallet-addresses", {
    method: "POST",
    body: JSON.stringify(toPayload(data)),
  });
  return toWalletAddress(created.address);
}

export async function updateWalletAddress(
  addressId: string,
  data: Partial<WalletAddressInput>,
): Promise<WalletAddress> {
  const updated = await fetchApi<{ address: BackendWalletAddress }>(
    `/admin/wallet-addresses/${addressId}`,
    { method: "PATCH", body: JSON.stringify(toPayload(data)) },
  );
  return toWalletAddress(updated.address);
}
