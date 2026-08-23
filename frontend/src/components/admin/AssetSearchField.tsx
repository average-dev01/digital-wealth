"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchAssets } from "@/lib/api/priceFeed";
import { cn } from "@/lib/utils";

type AssetSearchFieldProps = {
  value: string | null;
  onChange: (externalId: string | null) => void;
  /** Seeds the search box, so opening the picker for "BTC" starts useful. */
  defaultQuery?: string;
  error?: string | undefined;
};

/**
 * Picks the provider's asset id for a currency.
 *
 * Deliberately a search-and-select rather than a free-text field or an
 * automatic symbol match: dozens of real assets share a ticker, and silently
 * linking "BTC" to the wrong one would mis-price actual customer balances.
 */
export function AssetSearchField({
  value,
  onChange,
  defaultQuery = "",
  error,
}: AssetSearchFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(defaultQuery);
  const [debounced, setDebounced] = useState(defaultQuery);

  // Debounced because the backend proxies this to the provider, whose free
  // tier has a monthly call budget  one request per keystroke would burn it.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const search = useQuery({
    queryKey: ["price-feed", "search", debounced],
    queryFn: () => searchAssets(debounced),
    enabled: open && debounced.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const results = search.data ?? [];

  return (
    <div className="space-y-1.5">
      <Label htmlFor="asset-search">Market asset</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="asset-search"
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={Boolean(error)}
            className={cn(
              "w-full justify-between font-normal",
              !value && "text-muted-foreground",
              error && "border-destructive",
            )}
          >
            <span className="num truncate">{value ?? "Search for an asset…"}</span>
            <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search e.g. bitcoin"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {search.isFetching && (
                <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Searching…
                </div>
              )}
              {!search.isFetching && debounced.length < 2 && (
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  Type at least two characters.
                </div>
              )}
              {!search.isFetching && search.isError && (
                <div className="px-3 py-4 text-sm text-destructive">
                  {search.error instanceof Error
                    ? search.error.message
                    : "Market data provider is unavailable."}
                </div>
              )}
              {!search.isFetching && !search.isError && debounced.length >= 2 && (
                <>
                  <CommandEmpty>No assets found.</CommandEmpty>
                  <CommandGroup>
                    {results.map((hit) => (
                      <CommandItem
                        key={hit.external_id}
                        value={hit.external_id}
                        onSelect={() => {
                          onChange(hit.external_id);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "me-2 size-4",
                            value === hit.external_id ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="num font-medium">{hit.symbol}</span>
                        <span className="ms-2 truncate text-muted-foreground">{hit.name}</span>
                        {hit.rank > 0 && (
                          <span className="num ms-auto text-xs text-muted-foreground">
                            #{hit.rank}
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Price and logo are pulled from this asset automatically.
        </p>
      )}
    </div>
  );
}
