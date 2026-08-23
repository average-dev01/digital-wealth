"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminField } from "@/components/admin/AdminField";
import {
  getWalletAddresses,
  createWalletAddress,
  updateWalletAddress,
  type WalletAddress,
  type WalletAddressInput,
} from "@/lib/api/walletAddresses";
import { getAllCurrencies, type Currency } from "@/lib/api/currencies";
import { cn } from "@/lib/utils";

export default function AdminWalletAddresses() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<WalletAddress | "new" | null>(null);

  const addressesQuery = useQuery({
    queryKey: ["admin", "wallet-addresses"],
    queryFn: getWalletAddresses,
  });
  const currenciesQuery = useQuery({
    queryKey: ["admin", "currencies"],
    queryFn: getAllCurrencies,
  });

  const currencies = currenciesQuery.data ?? [];
  const rows = addressesQuery.data ?? [];
  const symbolFor = (currencyId: string) =>
    currencies.find((c) => c.id === currencyId)?.symbol ?? "";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Wallet addresses</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Deposit addresses published to customers. These are simulated addresses.
          </p>
        </div>
        <Button onClick={() => setEditing("new")} disabled={currencies.length === 0}>
          <Plus className="me-2 size-4" aria-hidden /> Add address
        </Button>
      </header>

      <div className="surface-panel overflow-x-auto">
        {addressesQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No deposit addresses published yet. Customers cannot be given a deposit address until
              one exists.
            </p>
            <Button className="mt-4" onClick={() => setEditing("new")}>
              Add the first address
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Currency</TableHead>
                <TableHead>Network</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((address) => (
                <TableRow key={address.id} className={cn(!address.is_active && "opacity-55")}>
                  <TableCell className="num font-semibold">
                    {symbolFor(address.currency_id)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{address.network}</TableCell>
                  <TableCell className="num max-w-[22rem] truncate text-xs" title={address.address}>
                    {address.address}
                  </TableCell>
                  <TableCell>
                    <Badge variant={address.is_active ? "secondary" : "outline"}>
                      {address.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end">
                    <Button variant="outline" size="sm" onClick={() => setEditing(address)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {editing && (
        <WalletAddressFormDialog
          address={editing === "new" ? null : editing}
          currencies={currencies}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "wallet-addresses"] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function WalletAddressFormDialog({
  address,
  currencies,
  onClose,
  onSaved,
}: {
  address: WalletAddress | null;
  currencies: Currency[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [currencyId, setCurrencyId] = useState(address?.currency_id ?? currencies[0]?.id ?? "");
  const [value, setValue] = useState(address?.address ?? "");
  const [network, setNetwork] = useState(address?.network ?? "");
  const [isActive, setIsActive] = useState(address?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (input: WalletAddressInput) =>
      address ? updateWalletAddress(address.id, input) : createWalletAddress(input),
    onSuccess: () => {
      toast.success(address ? "Address updated." : "Address added.");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save address"),
  });

  function submit() {
    const next: Record<string, string> = {};
    if (!currencyId) next["currency"] = "Select a currency";
    if (value.trim().length < 12) next["address"] = "Enter a full deposit address";
    if (network.trim().length < 2) next["network"] = "Enter the network this address is on";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    mutation.mutate({
      currency_id: currencyId,
      address: value.trim(),
      network: network.trim(),
      is_active: isActive,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{address ? "Edit address" : "Add wallet address"}</DialogTitle>
          <DialogDescription>
            Customers are shown the active address for the currency they are depositing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address-currency">Currency</Label>
            <Select value={currencyId} onValueChange={setCurrencyId}>
              <SelectTrigger id="address-currency" aria-invalid={Boolean(errors["currency"])}>
                <SelectValue placeholder="Select a currency" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((currency) => (
                  <SelectItem key={currency.id} value={currency.id}>
                    {currency.symbol}  {currency.name}
                    {currency.is_active ? "" : " (inactive)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors["currency"] && (
              <p role="alert" className="text-sm text-destructive">
                {errors["currency"]}
              </p>
            )}
          </div>

          <AdminField
            id="address-network"
            label="Network"
            value={network}
            onChange={setNetwork}
            error={errors["network"]}
            placeholder="Ethereum (ERC-20)"
          />

          <AdminField
            id="address-value"
            label="Deposit address"
            value={value}
            onChange={setValue}
            error={errors["address"]}
            className="num text-xs"
          />

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="address-active">Active</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Only active addresses are handed out for new deposits.
              </p>
            </div>
            <Switch id="address-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : address ? "Save changes" : "Add address"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
