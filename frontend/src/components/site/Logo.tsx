import Image from "next/image";
import mark from "@/assets/dwp-mark.png";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Digital Wealth Partners home"
      className={cn("flex items-center gap-2.5", className)}
    >
      <Image src={mark} alt="" width={32} height={32} className="h-8 w-8" />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight">Digital Wealth</span>
          <span className="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">
            Partners
          </span>
        </span>
      )}
    </Link>
  );
}
