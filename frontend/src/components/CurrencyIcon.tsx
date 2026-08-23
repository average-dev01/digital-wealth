"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

type CurrencyIconProps = {
  code: string;
  iconUrl?: string | null | undefined;
  /** Short text/emoji glyph  the fallback when there is no logo. */
  icon?: string | null | undefined;
  size?: number | undefined;
  className?: string | undefined;
};

/**
 * An asset's visual identity, degrading in three steps: the provider's logo,
 * then the admin's text glyph, then the first letter of the symbol.
 *
 * The last two matter more than they look  a currency can be created before
 * it is linked to the feed, a manual/demo asset never gets a logo at all, and
 * a provider CDN can fail at request time. None of those should leave a hole
 * in the layout.
 */
export function CurrencyIcon({ code, iconUrl, icon, size = 32, className }: CurrencyIconProps) {
  const [failed, setFailed] = useState(false);

  const shell = cn(
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
    className,
  );

  if (iconUrl && !failed) {
    return (
      <span className={shell} style={{ width: size, height: size }}>
        <Image
          src={iconUrl}
          alt=""
          width={size}
          height={size}
          className="size-full object-contain"
          onError={() => setFailed(true)}
          unoptimized={iconUrl.endsWith(".svg")}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(shell, "bg-muted text-muted-foreground font-medium")}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
    >
      {icon?.trim() || code.slice(0, 1).toUpperCase()}
    </span>
  );
}
