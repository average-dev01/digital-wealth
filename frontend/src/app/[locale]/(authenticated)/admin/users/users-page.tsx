"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getUsers } from "@/lib/api/adminUsers";
import { kycBadgeVariant } from "@/components/admin/status";
import { Link } from "@/i18n/navigation";

const PAGE_SIZE = 10;

export function AdminUsersPage() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [kycStatus, setKycStatus] = useState<string>(searchParams.get("kyc") ?? "all");
  const [isActive, setIsActive] = useState<string>("all");
  const [page, setPage] = useState(1);

  // Reset to the first page whenever the result set changes shape.
  useEffect(() => {
    setPage(1);
  }, [search, kycStatus, isActive]);

  const query = useQuery({
    queryKey: ["admin", "users", { search, kycStatus, isActive, page }],
    placeholderData: keepPreviousData,
    queryFn: () =>
      getUsers({
        search,
        kycStatus: kycStatus === "all" ? "all" : (kycStatus as "pending" | "verified" | "rejected"),
        isActive: isActive === "all" ? "all" : isActive === "active",
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const rows = query.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Customer accounts, their verification state, and access status.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="user-search">Search</Label>
          <Input
            id="user-search"
            value={search}
            placeholder="Name or email"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-kyc">KYC status</Label>
          <Select value={kycStatus} onValueChange={setKycStatus}>
            <SelectTrigger id="user-kyc">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-active">Account status</Label>
          <Select value={isActive} onValueChange={setIsActive}>
            <SelectTrigger id="user-active">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="surface-panel overflow-x-auto">
        {query.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No customers match these filters.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>KYC</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell className="font-medium">{profile.full_name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{profile.email}</TableCell>
                  <TableCell className="num whitespace-nowrap text-xs text-muted-foreground">
                    {format(new Date(profile.created_at), "d MMM yyyy")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={kycBadgeVariant(profile.kyc_status)} className="capitalize">
                      {profile.kyc_status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={profile.is_active ? "secondary" : "destructive"}>
                      {profile.is_active ? "Active" : "Suspended"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/users/${profile.id}`}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {query.data && query.data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page <span className="num">{query.data.page}</span> of{" "}
            <span className="num">{query.data.totalPages}</span> ·{" "}
            <span className="num">{query.data.total}</span> customers
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={query.data.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={query.data.page >= query.data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
