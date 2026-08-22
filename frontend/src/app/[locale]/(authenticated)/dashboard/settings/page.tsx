"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateMyProfile } from "@/lib/api/profile";
import { resetPasswordForEmail } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, useProfile } from "@/hooks/useAuth";

const SUPPORT_EMAIL = "support@digitalwealthpartners.example";

export default function Settings() {
  const t = useTranslations("settings");
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState<string | null>(null);

  const saveProfile = useMutation({
    mutationFn: () =>
      updateMyProfile(user!.id, {
        full_name: (fullName ?? profile?.full_name ?? "").trim().slice(0, 120),
      }),
    onSuccess: () => {
      toast.success(t("toast.profileUpdated"));
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("toast.profileError")),
  });

  const sendReset = useMutation({
    mutationFn: () => resetPasswordForEmail(user!.email),
    onSuccess: () => toast.success(t("toast.resetSent")),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("toast.resetError")),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <section aria-labelledby="details-heading" className="surface-panel space-y-5 p-6">
        <h2 id="details-heading" className="text-lg font-semibold">
          {t("contactDetails")}
        </h2>
        <div className="space-y-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" readOnly value={user?.email ?? ""} className="num" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-name">{t("fullName")}</Label>
          <Input
            id="settings-name"
            defaultValue={profile?.full_name ?? ""}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
          {saveProfile.isPending ? t("saving") : t("save")}
        </Button>
      </section>

      <section aria-labelledby="security-heading" className="surface-panel space-y-4 p-6">
        <h2 id="security-heading" className="text-lg font-semibold">
          {t("security")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("securityBody")}</p>
        <Button variant="outline" onClick={() => sendReset.mutate()} disabled={sendReset.isPending}>
          {sendReset.isPending ? t("sending") : t("sendReset")}
        </Button>
      </section>

      <section aria-labelledby="support-heading" className="surface-panel space-y-3 p-6">
        <h2 id="support-heading" className="text-lg font-semibold">
          {t("support")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t.rich("supportBody", {
            email: () => (
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:opacity-80">
                {SUPPORT_EMAIL}
              </a>
            ),
          })}
        </p>
      </section>
    </div>
  );
}
