"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getAllCurrencies,
  createCurrency,
  updateCurrency,
  deactivateCurrency,
  type Currency,
  type CurrencyInput,
  type PriceSource,
} from "@/lib/api/currencies";
import { refreshPrices } from "@/lib/api/priceFeed";
import { AdminField } from "@/components/admin/AdminField";
import { AssetSearchField } from "@/components/admin/AssetSearchField";
import { CurrencyIcon } from "@/components/CurrencyIcon";
import { formatPercent, formatUsd } from "@/lib/market";
import { cn } from "@/lib/utils";

/** Compact "3m ago" style stamp — the exact second is never the question here. */
function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AdminCurrencies() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Currency | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<Currency | null>(null);

  const query = useQuery({ queryKey: ["admin", "currencies"], queryFn: getAllCurrencies });

  /**
   * Both keys, always. The customer app reads the catalogue under
   * ["currencies"], so invalidating only the admin key left every signed-in
   * customer on a stale price until their own staleTime expired.
   */
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "currencies"] });
    void queryClient.invalidateQueries({ queryKey: ["currencies"] });
  };

  const deactivateMutation = useMutation({
    mutationFn: (currency: Currency) => deactivateCurrency(currency.id),
    onSuccess: (currency) => {
      toast.success(`${currency.symbol} deactivated.`);
      invalidate();
      setDeactivating(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not deactivate currency"),
  });

  const refreshMutation = useMutation({
    mutationFn: refreshPrices,
    onSuccess: (run) => {
      toast.success(
        `Updated ${run.updated} ${run.updated === 1 ? "price" : "prices"}` +
          (run.missing > 0 ? ` · ${run.missing} not found` : "") +
          (run.skipped > 0 ? ` · ${run.skipped} unlinked` : ""),
      );
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not refresh prices"),
  });

  const rows = query.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Currencies</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            The asset catalogue, including retired assets. Live assets are priced from the market
            data feed; manual ones keep the price you set.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw
              className={cn("me-2 size-4", refreshMutation.isPending && "animate-spin")}
              aria-hidden
            />
            {refreshMutation.isPending ? "Refreshing…" : "Refresh prices"}
          </Button>
          <Button onClick={() => setEditing("new")}>
            <Plus className="me-2 size-4" aria-hidden /> Add currency
          </Button>
        </div>
      </header>

      <div className="surface-panel overflow-x-auto">
        {query.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">No currencies in the catalogue yet.</p>
            <Button className="mt-4" onClick={() => setEditing("new")}>
              Add the first currency
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-end">Decimals</TableHead>
                <TableHead className="text-end">Price</TableHead>
                <TableHead className="text-end">24h</TableHead>
                <TableHead className="text-end">Updated</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((currency) => (
                <TableRow key={currency.id} className={cn(!currency.is_active && "opacity-55")}>
                  <TableCell className="num font-semibold">
                    <span className="flex items-center gap-2">
                      <CurrencyIcon
                        code={currency.symbol}
                        iconUrl={currency.icon_url}
                        icon={currency.icon}
                        size={24}
                      />
                      {currency.symbol}
                    </span>
                  </TableCell>
                  <TableCell>{currency.name}</TableCell>
                  <TableCell>
                    {currency.price_source === "live" ? (
                      <Badge variant="secondary">Live</Badge>
                    ) : (
                      <Badge variant="outline">Manual</Badge>
                    )}
                  </TableCell>
                  <TableCell className="num text-end">{currency.decimals}</TableCell>
                  <TableCell className="num text-end">
                    {formatUsd(currency.mock_price_usd)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "num text-end",
                      currency.price_change_24h === null
                        ? "text-muted-foreground"
                        : currency.price_change_24h >= 0
                          ? "text-success"
                          : "text-destructive",
                    )}
                  >
                    {currency.price_change_24h === null
                      ? "—"
                      : formatPercent(currency.price_change_24h)}
                  </TableCell>
                  <TableCell className="num text-end text-xs text-muted-foreground">
                    {relativeTime(currency.price_updated_at)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={currency.is_active ? "secondary" : "outline"}>
                      {currency.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditing(currency)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!currency.is_active}
                        onClick={() => setDeactivating(currency)}
                      >
                        Deactivate
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {editing && (
        <CurrencyFormDialog
          currency={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}

      <AlertDialog
        open={Boolean(deactivating)}
        onOpenChange={(open) => !open && setDeactivating(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivating?.symbol}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivating?.name} will stop being offered for new deposits and conversions.
              Existing balances and history are left untouched, and the asset can be reactivated
              from its edit form.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (deactivating) deactivateMutation.mutate(deactivating);
              }}
              disabled={deactivateMutation.isPending}
            >
              {deactivateMutation.isPending ? "Deactivating…" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CurrencyFormDialog({
  currency,
  onClose,
  onSaved,
}: {
  currency: Currency | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [symbol, setSymbol] = useState(currency?.symbol ?? "");
  const [name, setName] = useState(currency?.name ?? "");
  const [decimals, setDecimals] = useState(String(currency?.decimals ?? 8));
  const [icon, setIcon] = useState(currency?.icon ?? "");
  const [price, setPrice] = useState(currency ? String(currency.mock_price_usd) : "");
  // New currencies default to live pricing; existing ones keep what they have.
  const [priceSource, setPriceSource] = useState<PriceSource>(currency?.price_source ?? "live");
  const [externalPriceId, setExternalPriceId] = useState<string | null>(
    currency?.external_price_id ?? null,
  );
  const [isActive, setIsActive] = useState(currency?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isLive = priceSource === "live";

  const mutation = useMutation({
    mutationFn: (input: CurrencyInput) =>
      currency ? updateCurrency(currency.id, input) : createCurrency(input),
    onSuccess: (saved) => {
      toast.success(currency ? `${saved.symbol} updated.` : `${saved.symbol} added.`);
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save currency"),
  });

  function submit() {
    const next: Record<string, string> = {};
    if (!/^[A-Za-z0-9]{2,10}$/.test(symbol.trim()))
      next["symbol"] = "2–10 letters or digits, no spaces";
    if (name.trim().length < 2) next["name"] = "Enter the asset name";
    const decimalsValue = Number(decimals);
    if (!Number.isInteger(decimalsValue) || decimalsValue < 0 || decimalsValue > 18)
      next["decimals"] = "Enter a whole number between 0 and 18";

    // These mirror the backend's rules exactly — see validateAgainstExisting in
    // backend/src/routes/adminCurrencies.ts.
    const priceValue = Number(price);
    if (isLive) {
      if (!externalPriceId) next["asset"] = "Pick the market asset to price this from";
    } else if (!Number.isFinite(priceValue) || priceValue <= 0) {
      next["price"] = "Enter a price greater than zero";
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    mutation.mutate({
      symbol: symbol.trim(),
      name: name.trim(),
      decimals: decimalsValue,
      icon: icon.trim() || null,
      price_source: priceSource,
      external_price_id: isLive ? externalPriceId : null,
      // A live currency's price is the feed's to set; sending one would just be
      // overwritten on the next refresh.
      ...(isLive ? {} : { mock_price_usd: priceValue }),
      is_active: isActive,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{currency ? `Edit ${currency.symbol}` : "Add currency"}</DialogTitle>
          <DialogDescription>
            Live assets are priced from the market data feed. Use manual pricing for a demo asset
            with no real market.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField
              id="currency-symbol"
              label="Symbol"
              value={symbol}
              onChange={setSymbol}
              error={errors["symbol"]}
              className="num uppercase"
            />
            <AdminField
              id="currency-icon"
              label="Icon"
              value={icon}
              onChange={setIcon}
              placeholder="₿"
              hint="Fallback glyph"
            />
          </div>
          <AdminField
            id="currency-name"
            label="Name"
            value={name}
            onChange={setName}
            error={errors["name"]}
          />

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="currency-live">Live market price</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Refreshes automatically from the market data feed.
              </p>
            </div>
            <Switch
              id="currency-live"
              checked={isLive}
              onCheckedChange={(checked) => setPriceSource(checked ? "live" : "manual")}
            />
          </div>

          {isLive ? (
            <AssetSearchField
              value={externalPriceId}
              onChange={setExternalPriceId}
              defaultQuery={symbol.trim()}
              error={errors["asset"]}
            />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField
              id="currency-decimals"
              label="Decimals"
              value={decimals}
              onChange={setDecimals}
              error={errors["decimals"]}
              inputMode="numeric"
              className="num"
            />
            {isLive ? (
              <div className="space-y-1.5">
                <Label htmlFor="currency-price-readonly">USD price</Label>
                <div
                  id="currency-price-readonly"
                  className="num flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground"
                >
                  {currency ? formatUsd(currency.mock_price_usd) : "Set by the feed"}
                </div>
                <p className="text-xs text-muted-foreground">Managed by the price feed.</p>
              </div>
            ) : (
              <AdminField
                id="currency-price"
                label="USD price"
                value={price}
                onChange={setPrice}
                error={errors["price"]}
                inputMode="decimal"
                className="num"
              />
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="currency-active">Active</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Inactive assets stay in history but are not offered to customers.
              </p>
            </div>
            <Switch id="currency-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : currency ? "Save changes" : "Add currency"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
