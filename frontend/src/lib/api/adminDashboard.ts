// Headline figures for the admin landing page. Computed server-side with
// aggregate queries, and valued against the admin-editable catalogue price
// rather than the frontend's compile-time list.

import { fetchApi } from "./client";

export type DashboardStats = {
  totalUsers: number;
  /** SIMULATED assets under management, in USD, at mock prices. */
  totalAumUsd: number;
  pendingKyc: number;
  pendingTransactions: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  return fetchApi<DashboardStats>("/admin/dashboard/stats");
}
