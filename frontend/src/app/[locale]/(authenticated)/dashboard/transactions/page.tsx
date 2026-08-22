"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
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
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { listTransactions } from "@/lib/api/transactions";
import { formatUsd } from "@/lib/market";
import { useCurrencies } from "@/hooks/useCurrencies";
import { useDateTimeFormat } from "@/hooks/useDateTimeFormat";

const TYPES = ["deposit", "withdrawal", "admin_adjustment", "convert"] as const;
const STATUSES = ["pending", "completed", "rejected"] as const;

export default function Transactions() {
  const t = useTranslations("transactions");
  const tc = useTranslations("common");
  const { user } = useAuth();
  const { usdValue, formatCrypto } = useCurrencies();
  const dateFormat = useDateTimeFormat();
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [since, setSince] = useState("");

  const query = useQuery({
    queryKey: ["transactions", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => listTransactions(user!.id),
  });

  const rows = useMemo(() => {
    return (query.data ?? []).filter((tx) => {
      if (type !== "all" && tx.type !== type) return false;
      if (status !== "all" && tx.status !== status) return false;
      if (since && new Date(tx.created_at) < new Date(since)) return false;
      return true;
    });
  }, [query.data, type, status, since]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="filter-type">{t("type")}</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id="filter-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allTypes")}</SelectItem>
              {TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {tc(`transactionTypes.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-status">{t("status")}</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatuses")}</SelectItem>
              {STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {tc(`statuses.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-date">{t("fromDate")}</Label>
          <Input
            id="filter-date"
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
          />
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
          <p className="p-8 text-center text-sm text-muted-foreground">{t("noResults")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colDate")}</TableHead>
                <TableHead>{t("colType")}</TableHead>
                <TableHead>{t("colAsset")}</TableHead>
                <TableHead className="text-end">{t("colAmount")}</TableHead>
                <TableHead className="text-end">{t("colValue")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="num whitespace-nowrap text-xs text-muted-foreground">
                    {dateFormat.format(new Date(tx.created_at))}
                  </TableCell>
                  <TableCell>{tc(`transactionTypes.${tx.type}`)}</TableCell>
                  <TableCell className="num">{tx.currency}</TableCell>
                  <TableCell className="num text-end">
                    {formatCrypto(tx.currency, Number(tx.amount))}
                  </TableCell>
                  <TableCell className="num text-end text-muted-foreground">
                    {formatUsd(usdValue(tx.currency, Math.abs(Number(tx.amount))))}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        tx.status === "completed"
                          ? "secondary"
                          : tx.status === "pending"
                            ? "outline"
                            : "destructive"
                      }
                    >
                      {tc(`statuses.${tx.status}`)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
