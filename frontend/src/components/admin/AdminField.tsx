"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Labelled input with the same error/aria wiring the customer-facing forms use
 * (`aria-invalid` + `aria-describedby` pointing at a `role="alert"` message).
 * Shared across the admin forms so the pattern stays identical to the rest of
 * the app rather than being re-implemented per screen.
 */
export function AdminField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  inputMode,
  type,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: string | undefined;
  placeholder?: string | undefined;
  inputMode?: "numeric" | "decimal" | undefined;
  type?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? ""}
        {...(inputMode ? { inputMode } : {})}
        {...(type ? { type } : {})}
        className={className ?? ""}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
