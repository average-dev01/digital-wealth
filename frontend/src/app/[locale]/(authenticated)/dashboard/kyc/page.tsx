"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { toast } from "sonner";
import { BadgeCheck, Clock, XCircle } from "lucide-react";
import { submitKyc } from "@/lib/api/kyc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth, useProfile } from "@/hooks/useAuth";

type KycValues = { full_name: string; dob: string; country: string };

export default function Kyc() {
  const t = useTranslations("kyc");
  const tc = useTranslations("common");
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<KycValues>({ full_name: "", dob: "", country: "" });
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const status = profile?.kyc_status ?? "pending";

  // Built here rather than at module scope so the validation messages come
  // from the active locale's catalogue.
  const kycSchema = useMemo(
    () =>
      z.object({
        full_name: z.string().trim().min(2, t("errors.fullName")).max(120),
        dob: z.string().min(1, t("errors.dob")),
        country: z.string().trim().min(2, t("errors.country")).max(80),
      }),
    [t],
  );

  const mutation = useMutation({
    mutationFn: (payload: KycValues) => submitKyc(user!.id, payload, file),
    onSuccess: () => {
      toast.success(t("toast.success"));
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      setFile(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("toast.error")),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = kycSchema.safeParse({
      full_name: values.full_name || profile?.full_name || "",
      dob: values.dob || profile?.dob || "",
      country: values.country || profile?.country || "",
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ||= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data);
  }

  const StatusIcon = status === "verified" ? BadgeCheck : status === "rejected" ? XCircle : Clock;

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="surface-panel flex items-center gap-3 p-5">
        <StatusIcon
          className={
            status === "verified"
              ? "size-5 text-success"
              : status === "rejected"
                ? "size-5 text-destructive"
                : "size-5 text-warning"
          }
          aria-hidden
        />
        <div>
          <p className="text-sm font-medium">{t("currentStatus")}</p>
          <Badge variant="outline" className="mt-1">
            {tc(`statuses.${status}`)}
          </Badge>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="surface-panel space-y-5 p-6">
        <div className="space-y-2">
          <Label htmlFor="full_name">{t("fullLegalName")}</Label>
          <Input
            id="full_name"
            defaultValue={profile?.full_name ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, full_name: e.target.value }))}
            aria-invalid={Boolean(errors["full_name"])}
            aria-describedby={errors["full_name"] ? "full_name-error" : undefined}
          />
          {errors["full_name"] && (
            <p id="full_name-error" role="alert" className="text-sm text-destructive">
              {errors["full_name"]}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="dob">{t("dob")}</Label>
          <Input
            id="dob"
            type="date"
            defaultValue={profile?.dob ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, dob: e.target.value }))}
            aria-invalid={Boolean(errors["dob"])}
            aria-describedby={errors["dob"] ? "dob-error" : undefined}
          />
          {errors["dob"] && (
            <p id="dob-error" role="alert" className="text-sm text-destructive">
              {errors["dob"]}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="country">{t("country")}</Label>
          <Input
            id="country"
            defaultValue={profile?.country ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, country: e.target.value }))}
            aria-invalid={Boolean(errors["country"])}
            aria-describedby={errors["country"] ? "country-error" : undefined}
          />
          {errors["country"] && (
            <p id="country-error" role="alert" className="text-sm text-destructive">
              {errors["country"]}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="document">{t("document")}</Label>
          <Input
            id="document"
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">{t("documentHint")}</p>
        </div>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? t("submitting") : t("submit")}
        </Button>
      </form>
    </div>
  );
}
